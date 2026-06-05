import { NextResponse } from 'next/server';
import { assertManager, getOrCreateCategory, managerClient } from '../_utils';

export const runtime = 'nodejs';

type OfficeType = 'consultation' | 'customer' | 'sale' | 'inventory' | 'vendor' | 'project' | 'category';

const typeMap: Record<OfficeType, string> = {
  consultation: 'officeConsultation',
  customer: 'officeCustomer',
  sale: 'officeSale',
  inventory: 'officeInventoryItem',
  vendor: 'officeVendor',
  project: 'project',
  category: 'category',
};

const query = `{
  "consultations": *[_type == "officeConsultation"] | order(createdAt desc, _createdAt desc)[0...100] {
    _id, name, phone, siteType, propertyType, areaRange, homeStatus, reason, spaces, otherSpace, budget, timeline,
    postcode, address, detailAddress, fullAddress, message, privacyAgreed, status, source, memo, createdAt
  },
  "customers": *[_type == "officeCustomer"] | order(createdAt desc, _createdAt desc)[0...100] {
    _id, name, phone, siteType, address, status, memo, createdAt
  },
  "sales": *[_type == "officeSale"] | order(paymentDate desc, createdAt desc, _createdAt desc)[0...100] {
    _id, customerName, projectTitle, amount, cost, status, paymentDate, memo, createdAt
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
    _id, title, description, location, siteType, area, year, materials, displayOrder, featured, isVisible, mainImagePosition, mainImagePositionX, mainImagePositionY,
    "mainImage": mainImage.asset->url,
    "mainImageAlt": mainImage.alt,
    "categoryId": category->_id,
    "categoryTitle": category->title
  }
}`;

export async function GET(request: Request) {
  const authError = assertManager(request);
  if (authError) return authError;

  try {
    const data = await managerClient.fetch(query);
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

    if (type === 'project') {
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
      const title = String(cleanData.title || '').trim();
      if (!title) {
        return NextResponse.json({ error: '추가할 카테고리 이름을 입력해 주세요.' }, { status: 400 });
      }

      const record = await getOrCreateCategory(title);
      return NextResponse.json({ record });
    }

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

    if (!id) {
      return NextResponse.json({ error: '삭제할 항목을 선택해 주세요.' }, { status: 400 });
    }

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
