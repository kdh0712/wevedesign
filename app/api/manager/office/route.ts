import { NextResponse, after } from 'next/server';
import { canReadOffice, canWriteOffice, filterOfficeData } from '../../../lib/manager-permissions';
import { OFFICE_TRACKED_COLLECTIONS, parseOfficeVersionsParam, readableOfficeCollections } from '../../../lib/office-changes';
import { assertSanityWriteConfigured, getOrCreateCategory, isSanityIdWritable, managerClient } from '../_utils';
import { requireManager } from '../_session';
import { stripServerOwnedSiteFields } from '../_site-fields';
import { shouldCloseLinkOnSave } from '../_progress-link-rules';
import { deleteProgressUpdate, isProgressStoreReady, listProgressUpdates, saveSiteProgressFields } from '../_progress-store';
import { deleteProgressPhotos } from '../_progress-photo-storage';
import {
  canUseFirestoreForRequest,
  deleteOfficeRecordFromFirestore,
  getOfficeRecordFromFirestore,
  listFirestoreCollection,
  officeFirestoreCollections,
  readOfficeDataWithVersionsFromFirestore,
  readOfficeTrashFromFirestore,
  saveOfficeRecordToFirestoreWithPrevious,
  setOfficeRecordTrashInFirestore,
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
  "consultations": *[_type == "officeConsultation" && !defined(deletedAt)] | order(createdAt desc, _createdAt desc)[0...100] {
    _id, name, phone, siteType, propertyType, areaRange, homeStatus, reason, budget, timeline,
    postcode, address, detailAddress, fullAddress, message, privacyAgreed, status, source, memo, createdAt
  },
  "customers": *[_type == "officeCustomer" && !defined(deletedAt)] | order(createdAt desc, _createdAt desc)[0...100] {
    _id, name, phone, chatRoomUrl, siteType, address, status, memo, contractAlimtalkSentAt, createdAt
  },
  "sites": *[_type == "officeSite" && !defined(deletedAt)] | order(createdAt desc, _createdAt desc)[0...200] {
    _id, title, customerName, customerPhone, customerId, consultationId, siteType, address, status, memo, createdAt
  },
  "estimates": *[_type == "siteEstimate"] | order(updatedAt desc, _updatedAt desc)[0...300] {
    _id, siteId, siteTitle, customerName, versionType, versionLabel, customerEstimateTotal, executionCostTotal, marginAmount, marginRate, linesJson, updatedAt, createdAt
  },
  "sales": *[_type == "officeSale" && !defined(deletedAt)] | order(paymentDate desc, createdAt desc, _createdAt desc)[0...1000] {
    _id, siteId, estimateId, customerName, projectTitle, amount, cost, status, paymentDate, memo, createdAt
  },
  "inventory": *[_type == "officeInventoryItem" && !defined(deletedAt)] | order(itemName asc)[0...200] {
    _id, itemName, category, quantity, unit, minQuantity, vendor, memo, createdAt
  },
  "vendors": *[_type == "officeVendor" && !defined(deletedAt)] | order(name asc)[0...100] {
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

const trashProjection = '{ _id, name, phone, title, customerName, projectTitle, amount, itemName, deletedAt, deletedBy, createdAt }';

const trashQuery = `{
  "consultations": *[_type == "officeConsultation" && defined(deletedAt)] | order(deletedAt desc)[0...200] ${trashProjection},
  "customers": *[_type == "officeCustomer" && defined(deletedAt)] | order(deletedAt desc)[0...200] ${trashProjection},
  "sites": *[_type == "officeSite" && defined(deletedAt)] | order(deletedAt desc)[0...200] ${trashProjection},
  "sales": *[_type == "officeSale" && defined(deletedAt)] | order(deletedAt desc)[0...200] ${trashProjection},
  "inventory": *[_type == "officeInventoryItem" && defined(deletedAt)] | order(deletedAt desc)[0...200] ${trashProjection},
  "vendors": *[_type == "officeVendor" && defined(deletedAt)] | order(deletedAt desc)[0...200] ${trashProjection}
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

// Site records leave this route without the server-owned progress fields (link code, enabled flag, lockout record).
// The Firestore readers already drop them; this also covers the Sanity paths and the 휴지통 list.
function withoutServerOwnedSiteFields<T extends Record<string, unknown>>(data: T): T {
  if (!Array.isArray(data.sites)) return data;
  const sites = data.sites.map((site: unknown) =>
    typeof site === 'object' && site !== null ? stripServerOwnedSiteFields(site as Record<string, unknown>) : site,
  );
  return { ...data, sites };
}

// Server-Timing shows in the browser's network panel and the log line in Vercel, so the dashboard payload
// (and how much of it is estimate lines) can be checked against real data.
function timedJson(rawPayload: Record<string, unknown>, startedAt: number, label: string) {
  const payload = withoutServerOwnedSiteFields(rawPayload);
  const readMs = Date.now() - startedAt;
  const body = JSON.stringify(payload);
  const jsonMs = Date.now() - startedAt - readMs;
  const estimates = Array.isArray(payload.estimates) ? (payload.estimates as Array<{ linesJson?: unknown }>) : [];
  const estimateBytes = Buffer.byteLength(JSON.stringify(estimates));
  const linesBytes = estimates.reduce(
    (sum, estimate) => sum + (typeof estimate.linesJson === 'string' ? Buffer.byteLength(estimate.linesJson) : 0),
    0,
  );
  console.info(
    `Office GET ${label}: ${Buffer.byteLength(body)} bytes, estimates ${estimates.length} versions ${estimateBytes} bytes (linesJson ${linesBytes}), read ${readMs}ms, json ${jsonMs}ms`,
  );
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/json',
      'Server-Timing': `read;dur=${readMs}, json;dur=${jsonMs}`,
    },
  });
}

export async function GET(request: Request) {
  const access = requireManager(request);
  if (access.error) return access.error;
  const { session } = access;

  const startedAt = Date.now();
  // The dashboard's periodic refresh sends scope=refresh: it keeps the portfolio (projects, categories) it has.
  const isRefresh = new URL(request.url).searchParams.get('scope') === 'refresh';
  // A refresh may send versions=<base64url JSON> from its last answer: then only the lists that changed are read.
  // Without it (or when it is invalid) everything is read.
  const knownVersions = isRefresh ? parseOfficeVersionsParam(new URL(request.url).searchParams.get('versions')) : null;
  const readPortfolio = () => (isRefresh ? Promise.resolve({}) : readPublicData());
  try {
    // ?view=trash lists the records in the 휴지통 instead of the dashboard data. Like the 휴지통 tab, it is admin-only.
    if (new URL(request.url).searchParams.get('view') === 'trash') {
      if (session.role !== 'admin') return NextResponse.json({ error: '총괄 관리자만 사용할 수 있습니다.' }, { status: 403 });
      const useFirestore = shouldUseFirestoreErp() && canUseFirestoreForRequest(request);
      const trash = useFirestore ? await readOfficeTrashFromFirestore(request) : await managerClient.fetch(trashQuery);
      return NextResponse.json(withoutServerOwnedSiteFields(trash));
    }

    if (shouldUseFirestoreErp()) {
      try {
        if (!canUseFirestoreForRequest(request)) {
          throw new Error('Firestore 인증 정보가 없습니다. Firebase 서비스 계정 환경변수 또는 Firebase 로그인 토큰을 확인해 주세요.');
        }

        // Lists this session cannot read are not read at all; filterOfficeData below would blank them anyway.
        const readable = readableOfficeCollections((list) => canReadOffice(session, list));
        const [officeData, publicData, visitStats] = await Promise.all([
          readOfficeDataWithVersionsFromFirestore(request, knownVersions, readable),
          readPortfolio(),
          getVisitStats(),
        ]);
        const listsRead = readable.length - (officeData.unchangedCollections?.length || 0);
        return timedJson(
          filterOfficeData(session, { ...officeData, ...publicData, visitStats }),
          startedAt,
          `${isRefresh ? 'firestore refresh' : 'firestore'} (${listsRead}/${OFFICE_TRACKED_COLLECTIONS.length} lists)`,
        );
      } catch (firestoreError) {
        const warning = firestoreError instanceof Error ? firestoreError.message : 'Firestore 데이터를 불러오지 못했습니다.';
        console.error('Firestore office data fetch failed:', firestoreError);

        const [fallbackData, publicData, visitStats] = await Promise.all([
          managerClient.fetch(query).catch(() => null),
          readPortfolio(),
          getVisitStats(),
        ]);

        return timedJson(
          filterOfficeData(session, {
            ...(fallbackData || emptyOfficeData),
            ...publicData,
            visitStats,
            storageWarning: `Firestore 연결 확인 필요: ${warning}`,
          }),
          startedAt,
          'sanity fallback',
        );
      }
    }

    const data = await managerClient.fetch(query);
    data.visitStats = await getVisitStats();
    if (isRefresh) {
      delete data.categories;
      delete data.projects;
    }
    return timedJson(filterOfficeData(session, data), startedAt, isRefresh ? 'sanity refresh' : 'sanity');
  } catch (error) {
    console.error('Office data fetch failed:', error);
    return NextResponse.json({ error: getErrorMessage(error, '업무 데이터를 불러오지 못했습니다.') }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = requireManager(request);
  if (access.error) return access.error;

  try {
    const body = await request.json();
    const type = body?.type as OfficeType;
    const sanityType = typeMap[type];

    if (!sanityType) {
      return NextResponse.json({ error: '지원하지 않는 업무 데이터 유형입니다.' }, { status: 400 });
    }

    if (!canWriteOffice(access.session, type)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const sanitized = sanitizeRecord(body?.data || {});
    // The progress link fields belong to /api/manager/progress. A site form, possibly opened before a link change,
    // must not overwrite or revive them, so they are dropped before anything is merged over the stored record.
    const cleanData = type === 'site' ? stripServerOwnedSiteFields(sanitized) : sanitized;
    const now = new Date().toISOString();
    const firestoreType = type as PrivateOfficeType;

    if (firestoreType in officeFirestoreCollections && shouldUseFirestoreErp() && canUseFirestoreForRequest(request)) {
      const { saved, previous } = await saveOfficeRecordToFirestoreWithPrevious(request, firestoreType, cleanData, body?.id ? String(body.id) : undefined);
      if (type === 'site') await closeProgressLinkWhenSiteDone(previous, saved);
      // The stored site carries the progress link fields; the browser gets it back without them.
      const record = type === 'site' ? stripServerOwnedSiteFields(saved) : saved;
      return NextResponse.json({ record });
    }

    if (type === 'project') {
      if (body?.id && !(await isSanityIdWritable(String(body.id).replace(/^drafts\./, ''), 'project'))) {
        return NextResponse.json({ error: '수정할 프로젝트를 찾을 수 없습니다.' }, { status: 400 });
      }

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

    if (body?.id && !(await isSanityIdWritable(String(body.id), sanityType))) {
      return NextResponse.json({ error: '수정할 항목을 찾을 수 없습니다.' }, { status: 400 });
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

// Moves an office record to the 휴지통 (sets deletedAt / deletedBy). With permanent: true, removes a record that is
// already in the 휴지통.
export async function DELETE(request: Request) {
  const access = requireManager(request);
  if (access.error) return access.error;

  try {
    const body = await request.json();
    const id = String(body?.id || '').trim();
    const type = String(body?.type || '').trim() as PrivateOfficeType;
    const permanent = body?.permanent === true;

    if (!id) {
      return NextResponse.json({ error: '삭제할 항목을 선택해 주세요.' }, { status: 400 });
    }

    if (!Object.hasOwn(officeFirestoreCollections, type)) {
      return NextResponse.json({ error: '삭제할 수 없는 항목입니다.' }, { status: 400 });
    }

    if (!canWriteOffice(access.session, type)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    // Moving to the 휴지통 follows the record type's permission; emptying it is admin-only like the 휴지통 tab.
    if (permanent && access.session.role !== 'admin') return NextResponse.json({ error: '총괄 관리자만 사용할 수 있습니다.' }, { status: 403 });

    const useFirestore = shouldUseFirestoreErp() && canUseFirestoreForRequest(request);

    if (type === 'site') {
      const linkedEstimateCount = await countSiteEstimates(request, id, useFirestore);
      if (linkedEstimateCount > 0) {
        return NextResponse.json(
          { error: `이 현장에 견적 버전 ${linkedEstimateCount}개가 연결되어 있어 삭제할 수 없습니다. 견적 작업에서 견적 버전을 먼저 삭제해 주세요.` },
          { status: 409 },
        );
      }
    }

    const existing = await findOfficeRecord(request, type, id, useFirestore);
    if (!existing) {
      return NextResponse.json({ error: '이미 삭제되었거나 찾을 수 없는 항목입니다.' }, { status: 404 });
    }

    if (!useFirestore && existing._type !== typeMap[type]) {
      return NextResponse.json({ error: '삭제할 수 없는 항목입니다.' }, { status: 400 });
    }

    if (!useFirestore) {
      const sanityError = assertSanityWriteConfigured();
      if (sanityError) return sanityError;
    }

    if (permanent) {
      if (!existing.deletedAt) {
        return NextResponse.json({ error: '휴지통에 있는 항목만 영구 삭제할 수 있습니다.' }, { status: 409 });
      }

      // A site's customer progress records and their photos go with it; otherwise the photos would stay in the private
      // bucket with nothing pointing at them. Records first, then the site; the photos are removed after the answer
      // (a photo that cannot be deleted is only logged, as with a single record delete).
      if (type === 'site' && isProgressStoreReady()) {
        const updates = await listProgressUpdates(id);
        for (const update of updates) await deleteProgressUpdate(update._id);
        const pathnames = updates.flatMap((update) => update.photos.map((photo) => photo.pathname));
        if (pathnames.length) after(() => deleteProgressPhotos(pathnames));
      }

      if (useFirestore) await deleteOfficeRecordFromFirestore(request, type, id);
      else await managerClient.delete(id);
      return NextResponse.json({ ok: true });
    }

    const trash = {
      deletedAt: new Date().toISOString(),
      // Who deleted it comes from the signed session, not from anything the browser sends.
      deletedBy: (access.session.name || access.session.loginId).slice(0, 80),
    };

    if (useFirestore) await setOfficeRecordTrashInFirestore(request, type, id, existing, trash);
    else await managerClient.patch(id).set(trash).commit();
    return NextResponse.json({ ok: true, ...trash });
  } catch (error) {
    console.error('Office data delete failed:', error);
    return NextResponse.json({ error: getErrorMessage(error, '업무 데이터를 삭제하지 못했습니다.') }, { status: 500 });
  }
}

// Restores an office record from the 휴지통.
export async function PATCH(request: Request) {
  // Restoring happens in the admin-only 휴지통 tab.
  const access = requireManager(request, { admin: true });
  if (access.error) return access.error;

  try {
    const body = await request.json();
    const id = String(body?.id || '').trim();
    const type = String(body?.type || '').trim() as PrivateOfficeType;

    if (!id || !Object.hasOwn(officeFirestoreCollections, type)) {
      return NextResponse.json({ error: '복구할 항목을 선택해 주세요.' }, { status: 400 });
    }

    const useFirestore = shouldUseFirestoreErp() && canUseFirestoreForRequest(request);

    const existing = await findOfficeRecord(request, type, id, useFirestore);
    if (!existing || (!useFirestore && existing._type !== typeMap[type])) {
      return NextResponse.json({ error: '복구할 항목을 찾을 수 없습니다. 이미 영구 삭제되었을 수 있습니다.' }, { status: 404 });
    }

    if (!useFirestore) {
      const sanityError = assertSanityWriteConfigured();
      if (sanityError) return sanityError;
    }

    if (useFirestore) await setOfficeRecordTrashInFirestore(request, type, id, existing, null);
    else await managerClient.patch(id).unset(['deletedAt', 'deletedBy']).commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Office data restore failed:', error);
    return NextResponse.json({ error: getErrorMessage(error, '휴지통에서 복구하지 못했습니다.') }, { status: 500 });
  }
}

// The stored record (Firestore) or its _type and trash state (Sanity); null when it does not exist.
async function findOfficeRecord(request: Request, type: PrivateOfficeType, id: string, useFirestore: boolean) {
  if (useFirestore) return getOfficeRecordFromFirestore(request, type, id);
  return managerClient.fetch<Record<string, unknown> | null>('*[_id == $id][0]{_type, deletedAt}', { id });
}

async function countSiteEstimates(request: Request, siteId: string, useFirestore: boolean) {
  if (useFirestore) {
    const estimates = await listFirestoreCollection<{ siteId?: string }>('siteEstimates', request.headers.get('x-firebase-token') || '');
    return estimates.filter((estimate) => estimate.siteId === siteId).length;
  }

  return managerClient.fetch<number>('count(*[_type == "siteEstimate" && siteId == $siteId])', { siteId });
}

// A site saved into 완료 closes its customer progress link. The site is already saved, so a failure here is logged and never
// turned into a save error. Only the move into 완료 closes it: staff can switch a finished site's link back on by hand.
async function closeProgressLinkWhenSiteDone(previous: Record<string, unknown> | null, saved: Record<string, unknown>) {
  const siteId = typeof saved._id === 'string' ? saved._id : '';
  const previousStatus = typeof previous?.status === 'string' ? previous.status : undefined;
  const nextStatus = typeof saved.status === 'string' ? saved.status : undefined;
  const wasEnabled = typeof previous?.progressEnabled === 'boolean' ? previous.progressEnabled : undefined;
  if (!siteId || !shouldCloseLinkOnSave(previousStatus, nextStatus, wasEnabled)) return;

  try {
    await saveSiteProgressFields(siteId, { progressEnabled: false });
  } catch (error) {
    console.error('Progress link close failed after the site was saved:', error);
  }
}

function sanitizeRecord(value: Record<string, unknown>) {
  // deletedAt / deletedBy change only through DELETE (휴지통) and PATCH (복구).
  const blocked = new Set(['_id', '_type', '_createdAt', '_updatedAt', '_rev', 'deletedAt', 'deletedBy']);
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
