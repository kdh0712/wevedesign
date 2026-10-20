// Dashboard rules kept out of the page so node tests can load them directly (no imports).

// The dashboard refreshes every 30 seconds, but Kakao BizForm+ is checked at most this often; each check pages through
// the whole form report. The 동기화 button still checks right away.
export const KAKAO_AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;

export function shouldAutoSyncKakao(lastSyncAt: number, now: number) {
  return !lastSyncAt || now - lastSyncAt >= KAKAO_AUTO_SYNC_INTERVAL_MS;
}

// A sale still at '견적' or one that was '취소' is not revenue. Other statuses, including an empty one on older
// records, count.
export const NON_REVENUE_SALE_STATUSES = ['견적', '취소'];

export function countsAsRevenue(status: unknown) {
  return !NON_REVENUE_SALE_STATUSES.includes(String(status ?? '').trim());
}

export function salesTotals(sales: ReadonlyArray<{ amount?: unknown; cost?: unknown; status?: unknown }>) {
  let revenue = 0;
  let profit = 0;
  let excluded = 0;
  for (const sale of sales) {
    if (!countsAsRevenue(sale.status)) {
      excluded += 1;
      continue;
    }
    const amount = Number(sale.amount) || 0;
    revenue += amount;
    profit += amount - (Number(sale.cost) || 0);
  }
  return { revenue, profit, excluded };
}
