import { NextResponse } from 'next/server';
import { assertManager, managerClient } from '../_utils';
import { canUseFirestoreOnServer, saveServerRecordToFirestore } from '../firestore';

export const runtime = 'nodejs';

const migrationQuery = `{
  "consultations": *[_type == "officeConsultation"] | order(createdAt desc, _createdAt desc)[0...1000] {
    _id, _type, name, phone, siteType, propertyType, areaRange, homeStatus, reason, budget, timeline,
    postcode, address, detailAddress, fullAddress, message, privacyAgreed, status, source, memo, createdAt, updatedAt
  },
  "customers": *[_type == "officeCustomer"] | order(createdAt desc, _createdAt desc)[0...1000] {
    _id, _type, name, phone, siteType, address, status, memo, createdAt, updatedAt
  },
  "sites": *[_type == "officeSite"] | order(createdAt desc, _createdAt desc)[0...1000] {
    _id, _type, title, customerName, customerPhone, customerId, consultationId, siteType, address, status, memo, createdAt, updatedAt
  },
  "sales": *[_type == "officeSale"] | order(paymentDate desc, createdAt desc, _createdAt desc)[0...1000] {
    _id, _type, siteId, estimateId, customerName, projectTitle, amount, cost, status, paymentDate, memo, createdAt, updatedAt
  },
  "inventory": *[_type == "officeInventoryItem"] | order(itemName asc)[0...1000] {
    _id, _type, itemName, category, quantity, unit, minQuantity, vendor, memo, createdAt, updatedAt
  },
  "vendors": *[_type == "officeVendor"] | order(name asc)[0...1000] {
    _id, _type, name, manager, phone, service, status, memo, createdAt, updatedAt
  },
  "estimates": *[_type == "siteEstimate"] | order(updatedAt desc, _updatedAt desc)[0...1000] {
    _id, _type, siteId, siteTitle, customerName, versionType, versionLabel, linesJson, workLinesJson, scheduleJson, holidaysJson,
    customerEstimateTotal, executionCostTotal, marginAmount, marginRate, memo, updatedAt, createdAt
  },
  "materials": *[_type == "estimateMaterial"] | order(category asc, process asc, name asc)[0...10000] {
    _id, _type, category, process, name, spec, unit, unitPrice, note, sourceSheet, updatedAt
  }
}`;

type MigrationData = Record<string, Array<Record<string, unknown> & { _id?: string }>>;

const collectionMap: Array<[keyof MigrationData, string]> = [
  ['consultations', 'officeConsultations'],
  ['customers', 'officeCustomers'],
  ['sites', 'officeSites'],
  ['sales', 'officeSales'],
  ['inventory', 'officeInventoryItems'],
  ['vendors', 'officeVendors'],
  ['estimates', 'siteEstimates'],
  ['materials', 'estimateMaterials'],
];

export async function POST(request: Request) {
  const authError = assertManager(request);
  if (authError) return authError;

  if (!process.env.SANITY_WRITE_TOKEN) {
    return NextResponse.json({ error: '기존 Sanity ERP 데이터를 읽으려면 SANITY_WRITE_TOKEN이 필요합니다.' }, { status: 500 });
  }

  if (!canUseFirestoreOnServer()) {
    return NextResponse.json({ error: 'Firestore 마이그레이션에는 Firebase 서비스 계정 환경변수가 필요합니다.' }, { status: 500 });
  }

  try {
    const data = (await managerClient.fetch(migrationQuery)) as MigrationData;
    const counts: Record<string, number> = {};

    for (const [key, collection] of collectionMap) {
      const rows = data[key] || [];
      counts[String(key)] = rows.length;
      for (const row of rows) {
        if (!row._id) continue;
        await saveServerRecordToFirestore(collection, row, String(row._id));
      }
    }

    return NextResponse.json({ ok: true, counts, migratedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Firestore migration failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Firestore 마이그레이션에 실패했습니다.' },
      { status: 500 },
    );
  }
}

