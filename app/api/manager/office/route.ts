import { NextResponse } from 'next/server';
import { assertManager, managerClient } from '../_utils';

export const runtime = 'nodejs';

type OfficeType = 'consultation' | 'customer' | 'sale' | 'inventory' | 'vendor';

const typeMap: Record<OfficeType, string> = {
  consultation: 'officeConsultation',
  customer: 'officeCustomer',
  sale: 'officeSale',
  inventory: 'officeInventoryItem',
  vendor: 'officeVendor',
};

const query = `{
  "consultations": *[_type == "officeConsultation"] | order(createdAt desc, _createdAt desc)[0...100] {
    _id, name, phone, address, message, status, source, memo, createdAt
  },
  "customers": *[_type == "officeCustomer"] | order(createdAt desc, _createdAt desc)[0...100] {
    _id, name, phone, address, status, memo, createdAt
  },
  "sales": *[_type == "officeSale"] | order(paymentDate desc, createdAt desc, _createdAt desc)[0...100] {
    _id, customerName, projectTitle, amount, cost, status, paymentDate, memo, createdAt
  },
  "inventory": *[_type == "officeInventoryItem"] | order(itemName asc)[0...200] {
    _id, itemName, category, quantity, unit, minQuantity, vendor, memo, createdAt
  },
  "vendors": *[_type == "officeVendor"] | order(name asc)[0...100] {
    _id, name, manager, phone, service, status, memo, createdAt
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
    const record = body?.id
      ? await managerClient.patch(String(body.id)).set({ ...cleanData, updatedAt: now }).commit()
      : await managerClient.create({ _type: sanityType, ...cleanData, createdAt: now, updatedAt: now });

    return NextResponse.json({ record });
  } catch (error) {
    console.error('Office data save failed:', error);
    return NextResponse.json({ error: getErrorMessage(error, '업무 데이터를 저장하지 못했습니다.') }, { status: 500 });
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
