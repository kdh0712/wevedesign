// Office records as the manager screens see them (Firestore officeCustomers / officeSites, or the Sanity data source).

export type Customer = {
  _id: string;
  name?: string;
  phone?: string;
  chatRoomUrl?: string;
  // Old customer-only fields: no longer read for the list (field mask) or shown, kept on stored records.
  siteType?: string;
  address?: string;
  status?: string;
  memo?: string;
  // Old per-customer record of the 계약 완료 안내 alimtalk; the record is per site now (Site.contractAlimtalkSentAt).
  contractAlimtalkSentAt?: string;
  createdAt?: string;
};

export type Site = {
  _id: string;
  title?: string;
  customerName?: string;
  customerPhone?: string;
  customerId?: string;
  consultationId?: string;
  siteType?: string;
  address?: string;
  status?: string;
  memo?: string;
  createdAt?: string;
  // 유입 경로 answer (server-written; see app/lib/acquisition.ts). The site form never sends it back.
  acquisition?: unknown;
  // 계약 완료 안내 alimtalk (server-written by /api/integrations/aligo-alimtalk/send). The site form never sends it back.
  contractAlimtalkSentAt?: string;
};
