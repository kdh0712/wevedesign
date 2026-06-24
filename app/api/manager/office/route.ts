import { NextResponse } from 'next/server';
import { assertManager, assertSanityWriteConfigured, getOrCreateCategory, managerClient } from '../_utils';
import {
  canUseFirestoreForRequest,
  deleteOfficeRecordFromFirestore,
  officeFirestoreCollections,
  readOfficeDataFromFirestore,
  saveOfficeRecordToFirestore,
  shouldUseFirestoreErp,
  type PrivateOfficeType,
} from '../firestore';

export const runtime = 'nodejs';

type OfficeType = 'consultation' | 'customer' | 'site' | 'sale' | 'inventory' | 'vendor' | 'project' | 'category';

const typeMap: Record<OfficeType, string> = {
  consultation: 'officeConsultation',
  customer: 'officeCustomer',
  site: 'officeSite',
  sale: 'officeSale',
  inventory: 'officeInventoryItem',
  vendor: 'officeVendor',
  project: 'project',
  category: 'category',
};

const query = `{
  "consultations": *[_type == "officeConsultation"] | order(createdAt desc, _createdAt desc)[0...100] {
    _id, name, phone, siteType, propertyType, areaRange, homeStatus, reason, budget, timeline,
    postcode, address, detailAddress, fullAddress, message, privacyAgreed, status, source, memo, createdAt
  },
  "customers": *[_type == "officeCustomer"] | order(createdAt desc, _createdAt desc)[0...100] {
    _id, name, phone, siteType, address, status, memo, createdAt
  },
  "sites": *[_type == "officeSite"] | order(createdAt desc, _createdAt desc)[0...200] {
    _id, title, customerName, customerPhone, customerId, consultationId, siteType, address, status, memo, createdAt
  },
  "estimates": *[_type == "siteEstimate"] | order(updatedAt desc, _updatedAt desc)[0...300] {
    _id, siteId, siteTitle, customerName, versionType, versionLabel, customerEstimateTotal, executionCostTotal, marginAmount, marginRate, updatedAt, createdAt
  },
  "sales": *[_type == "officeSale"] | order(paymentDate desc, createdAt desc, _createdAt desc)[0...100] {
    _id, siteId, estimateId, customerName, projectTitle, amount, cost, status, paymentDate, memo, createdAt
  },
  "inventory": *[_type == "officeInventoryItem"] | order(itemName asc)[0...200] {
    _id, itemName, category, quantity, unit, minQuantity, vendor, memo, createdAt
  },
  "vendors": *[_type == "officeVendor"] | order(name asc)[0...100] {
    _id, name, manager, phone, service, status, memo, createdAt
  },
  "categories": *[_type == "category"] | order(displayOrder asc, title asc) {
    _id, title, "slug": slug.current
  },
  "projects": *[_type == "project" && !(_id in path("drafts.**"))] | order(_createdAt desc)[0...200] {
    _id, title, description, location, siteType, area, year, materials, blogUrl, displayOrder, featured, isVisible, mainImagePosition, mainImagePositionX, mainImagePositionY,
    "mainImage": mainImage.asset->url,
    "mainImageAssetId": mainImage.asset->_id,
    "mainImageAlt": mainImage.alt,
    "categoryId": category->_id,
    "categoryTitle": category->title,
    "galleryGroups": galleryGroups[] {
      roomType, title,
      images[] {
        "assetId": asset->_id,
        "url": asset->url,
        alt, caption
      }
    },
    "gallery": gallery[] {
      "assetId": asset->_id,
      "url": asset->url,
      alt, caption, roomType
    }
  }
}`;

const publicQuery = `{
  "categories": *[_type == "category"] | order(displayOrder asc, title asc) {
    _id, title, "slug": slug.current
  },
  "projects": *[_type == "project" && !(_id in path("drafts.**"))] | order(_createdAt desc)[0...200] {
    _id, title, description, location, siteType, area, year, materials, blogUrl, displayOrder, featured, isVisible, mainImagePosition, mainImagePositionX, mainImagePositionY,
    "mainImage": mainImage.asset->url,
    "mainImageAssetId": mainImage.asset->_id,
    "mainImageAlt": mainImage.alt,
    "categoryId": category->_id,
    "categoryTitle": category->title,
    "galleryGroups": galleryGroups[] {
      roomType, title,
      images[] {
        "assetId": asset->_id,
        "url": asset->url,
        alt, caption
      }
    },
    "gallery": gallery[] {
      "assetId": asset->_id,
      "url": asset->url,
      alt, caption, roomType
    }
  }
}`;

const emptyOfficeData = {
  consultations: [],
  customers: [],
  sites: [],
  estimates: [],
  sales: [],
  inventory: [],
  vendors: [],
};

async function readPublicData() {
  return managerClient.fetch(publicQuery).catch(() => ({ categories: [], projects: [] }));
}

const seoulDateKey = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const weekDateKeys = () => {
  const now = new Date();
  const seoulNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const day = seoulNow.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(seoulNow);
  monday.setDate(seoulNow.getDate() + mondayOffset);

  const keys: string[] = [];
  for (let date = new Date(monday); date <= seoulNow; date.setDate(date.getDate() + 1)) {
    keys.push(seoulDateKey(date));
  }
  return keys;
};

async function getVisitStats() {
  const today = seoulDateKey(new Date());
  const weekDates = weekDateKeys();
  const rows = await managerClient
    .fetch<Array<{ date: string; count?: number }>>('*[_type == "siteVisitDaily" && date in $dates]{date,count}', { dates: weekDates })
    .catch(() => []);
  const todayCount = rows.find((row) => row.date === today)?.count || 0;
  const weekCount = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);

  return {
    today,
    todayCount,
    weekCount,
    refreshSeconds: 30,
  };
}

export async function GET(request: Request) {
  const authError = assertManager(request);
  if (authError) return authError;

  try {
    if (shouldUseFirestoreErp()) {
      try {
        if (!canUseFirestoreForRequest(request)) {
          throw new Error('Firestore 인증 정보가 없습니다. Firebase 서비스 계정 환경변수 또는 Firebase 로그인 토큰을 확인해 주세요.');
        }

        const [officeData, publicData, visitStats] = await Promise.all([
          readOfficeDataFromFirestore(request),
          readPublicData(),
          getVisitStats(),
        ]);
        return NextResponse.json({ ...officeData, ...publicData, visitStats });
      } catch (firestoreError) {
        const warning = firestoreError instanceof Error ? firestoreError.message : 'Firestore 데이터를 불러오지 못했습니다.';
        console.error('Firestore office data fetch failed:', firestoreError);

        const [fallbackData, publicData, visitStats] = await Promise.all([
          managerClient.fetch(query).catch(() => null),
          readPublicData(),
          getVisitStats(),
        ]);

        return NextResponse.json({
          ...(fallbackData || emptyOfficeData),
          ...publicData,
          visitStats,
          storageWarning: `Firestore 연결 확인 필요: ${warning}`,
        });
      }
    }

    const data = await managerClient.fetch(query);
    data.visitStats = await getVisitStats();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Office data fetch failed:', error);
    return NextResponse.json({ error: getErrorMessage(error, '업무 데이터를 불러오지 못했습니다.') }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = assertManager(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const type = body?.type as OfficeType;
    const sanityType = typeMap[type];

    if (!sanityType) {
      return NextResponse.json({ error: '지원하지 않는 업무 데이터 유형입니다.' }, { status: 400 });
    }

    const cleanData = sanitizeRecord(body?.data || {});
    const now = new Date().toISOString();
    const firestoreType = type as PrivateOfficeType;

    if (firestoreType in officeFirestoreCollections && shouldUseFirestoreErp() && canUseFirestoreForRequest(request)) {
      const record = await saveOfficeRecordToFirestore(request, firestoreType, cleanData, body?.id ? String(body.id) : undefined);
      return NextResponse.json({ record });
    }

    if (type === 'project') {
      const sanityError = assertSanityWriteConfigured();
      if (sanityError) return sanityError;

      if (!body?.id) {
        const record = await managerClient.create({
          _type: 'project',
          ...cleanData,
          isVisible: false,
          createdAt: now,
          updatedAt: now,
        });
        return NextResponse.json({ record });
      }

      const projectId = String(body.id).replace(/^drafts\./, '');
      const updates = { ...cleanData, updatedAt: now };
      const record = await managerClient.patch(projectId).set(updates).commit();
      const draftId = `drafts.${projectId}`;
      const draft = await managerClient.fetch('*[_id == $draftId][0]{_id}', { draftId });

      if (draft?._id) {
        await managerClient.patch(draftId).set(updates).commit();
      }

      return NextResponse.json({ record });
    }

    if (type === 'category') {
      const sanityError = assertSanityWriteConfigured();
      if (sanityError) return sanityError;

      const title = String(cleanData.title || '').trim();
      if (!title) {
        return NextResponse.json({ error: '추가할 카테고리 이름을 입력해 주세요.' }, { status: 400 });
      }

      const record = await getOrCreateCategory(title);
      return NextResponse.json({ record });
    }

    const sanityError = assertSanityWriteConfigured();
    if (sanityError) return sanityError;

    const record = body?.id
      ? await managerClient.patch(String(body.id)).set({ ...cleanData, updatedAt: now }).commit()
      : await managerClient.create({ _type: sanityType, ...cleanData, createdAt: now, updatedAt: now });

    return NextResponse.json({ record });
  } catch (error) {
    console.error('Office data save failed:', error);
    return NextResponse.json({ error: getErrorMessage(error, '업무 데이터를 저장하지 못했습니다.') }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const authError = assertManager(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const id = String(body?.id || '').trim();
    const type = String(body?.type || '').trim() as PrivateOfficeType;

    if (!id) {
      return NextResponse.json({ error: '삭제할 항목을 선택해 주세요.' }, { status: 400 });
    }

    if (type in officeFirestoreCollections && shouldUseFirestoreErp() && canUseFirestoreForRequest(request)) {
      await deleteOfficeRecordFromFirestore(request, type, id);
      return NextResponse.json({ ok: true });
    }

    const sanityError = assertSanityWriteConfigured();
    if (sanityError) return sanityError;

    await managerClient.delete(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Office data delete failed:', error);
    return NextResponse.json({ error: getErrorMessage(error, '업무 데이터를 삭제하지 못했습니다.') }, { status: 500 });
  }
}

function sanitizeRecord(value: Record<string, unknown>) {
  const blocked = new Set(['_id', '_type', '_createdAt', '_updatedAt', '_rev']);
  const clean: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value)) {
    if (blocked.has(key)) continue;
    if (typeof item === 'string') clean[key] = item.trim();
    else clean[key] = item;
  }

  return clean;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
