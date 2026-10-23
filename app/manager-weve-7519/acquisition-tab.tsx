'use client';

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Plus } from 'lucide-react';
import {
  MANAGER_SITE_LIST_LIMIT,
  acquisitionStats,
  normalizeAcquisitionOptions,
  periodRange,
  statsMayMissSites,
  type AcquisitionOption,
  type AcquisitionPeriod,
} from '../lib/acquisition';
import { todayInSeoul } from '../lib/site-progress';
import { createAcquisitionApi } from './acquisition-api';
import { errorText, formatSeoulDateTime, ProgressRequestError } from './progress-manager';

const PERIODS: Array<[AcquisitionPeriod, string]> = [
  ['month', '이번 달'],
  ['3months', '최근 3개월'],
  ['year', '올해'],
  ['all', '전체'],
];

const formatMoney = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;

function TabPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-[#d5dde2] bg-white p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <span className="h-2 w-2 rounded-full bg-[#38bcd4]" />
        {title}
      </h2>
      {children}
    </section>
  );
}

// An option row being edited; key keeps React's row identity while a new option has no id yet.
type DraftOption = { key: string; id?: string; label: string; hidden: boolean };

// The 유입 경로 tab: per-channel counts and revenue from the sites and sales the manager already loaded (no extra reads),
// and the survey's option list. Revenue columns show only for accounts with the sales permission.
export function AcquisitionTab({
  sites,
  sales,
  canSeeSales,
  authHeaders,
}: {
  sites: ReadonlyArray<Record<string, unknown>>;
  sales: ReadonlyArray<Record<string, unknown>>;
  canSeeSales: boolean;
  authHeaders: () => Record<string, string>;
}) {
  const api = useMemo(() => createAcquisitionApi(authHeaders), [authHeaders]);
  const [period, setPeriod] = useState<AcquisitionPeriod>('year');
  const [options, setOptions] = useState<AcquisitionOption[] | null>(null);
  const [updateTime, setUpdateTime] = useState('');
  const [draft, setDraft] = useState<DraftOption[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [openRow, setOpenRow] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);

  const applyLoaded = (loaded: { options: AcquisitionOption[]; updateTime: string }) => {
    setOptions(loaded.options);
    setUpdateTime(loaded.updateTime);
    setDraft(loaded.options.map((option) => ({ key: option.id, id: option.id, label: option.label, hidden: Boolean(option.hidden) })));
  };

  const load = () =>
    api
      .load()
      .then((loaded) => {
        applyLoaded(loaded);
        setLoadError('');
      })
      .catch((error) => setLoadError(errorText(error, '유입 경로 보기를 불러오지 못했습니다.')));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(
    () => (options ? acquisitionStats({ sites, sales: canSeeSales ? sales : [], options, range: periodRange(period, todayInSeoul()) }) : []),
    [canSeeSales, options, period, sales, sites],
  );
  const maxCount = Math.max(1, ...rows.map((row) => row.siteCount));
  const mayMiss = statsMayMissSites(sites, periodRange(period, todayInSeoul()));
  const totalSites = rows.reduce((sum, row) => sum + row.siteCount, 0);

  const moveDraft = (index: number, step: -1 | 1) =>
    setDraft((current) => {
      const target = index + step;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const addDraft = () => {
    const label = newLabel.trim();
    if (!label) return;
    setDraft((current) => [...current, { key: `new-${Date.now()}`, label, hidden: false }]);
    setNewLabel('');
  };

  const saveDraft = async () => {
    const payload = draft.map((item) => ({ ...(item.id ? { id: item.id } : {}), label: item.label, hidden: item.hidden }));
    // The same check the server runs, so mistakes show before anything is sent.
    const checked = normalizeAcquisitionOptions(payload, () => 'opt-check');
    if (!checked.ok) {
      setMessage({ tone: 'error', text: checked.error });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      applyLoaded(await api.saveOptions(payload as AcquisitionOption[], updateTime));
      setMessage({ tone: 'ok', text: '보기 목록을 저장했습니다. 고객 설문에 바로 반영됩니다.' });
    } catch (error) {
      setMessage({ tone: 'error', text: errorText(error) });
      if (error instanceof ProgressRequestError && error.status === 409) await load();
    } finally {
      setSaving(false);
    }
  };

  const dirty = options !== null && JSON.stringify(draft.map(({ id, label, hidden }) => ({ id, label, hidden }))) !==
    JSON.stringify(options.map((option) => ({ id: option.id, label: option.label, hidden: Boolean(option.hidden) })));
  const muted = (kind: string) => kind === 'skipped' || kind === 'none';

  return (
    <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr] xl:items-start">
      <TabPanel title="유입 경로 통계">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm leading-6 text-[#60717d]">
            기간 안에 등록된 현장(계약·시공중·완료, 또는 답이 있는 현장)을 고객이 처음 알게 된 경로별로 묶었습니다.
            {canSeeSales ? ' 매출은 그 현장들의 매출 기록 합계입니다(견적·취소 제외).' : ''}
          </p>
          <div className="inline-flex gap-1 rounded-md bg-[#edf2f5] p-1" role="group" aria-label="기간">
            {PERIODS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={period === key}
                onClick={() => setPeriod(key)}
                className={`rounded px-3 py-1.5 text-sm font-semibold ${period === key ? 'bg-white text-[#171512] shadow-sm' : 'text-[#60717d] hover:text-[#171512]'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loadError && <p className="mt-3 text-sm font-semibold text-red-600">{loadError}</p>}
        {!options && !loadError && (
          <p className="mt-3 inline-flex items-center gap-2 text-sm text-[#60717d]">
            <Loader2 className="animate-spin" size={16} /> 불러오는 중
          </p>
        )}

        {options && mayMiss && (
          <p role="status" className="mt-3 rounded-md border border-[#f0dca8] bg-[#fff8e6] px-3 py-2 text-xs leading-5 text-[#8b6420]">
            관리 화면은 최근 등록된 현장 {MANAGER_SITE_LIST_LIMIT}곳까지만 불러옵니다. 이 기간의 더 오래된 현장은 통계에서 빠질 수 있어요.
          </p>
        )}

        {options && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#d5dde2] text-left text-xs text-[#60717d]">
                  <th className="px-2 py-2 font-semibold">유입 경로</th>
                  <th className="w-[34%] px-2 py-2 font-semibold">현장 수</th>
                  {canSeeSales && <th className="px-2 py-2 text-right font-semibold">매출 합계</th>}
                  {canSeeSales && <th className="px-2 py-2 text-right font-semibold">현장당 평균</th>}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={canSeeSales ? 4 : 2} className="px-2 py-6 text-center text-[#60717d]">
                      이 기간에 셀 현장이 없습니다.
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <Fragment key={row.key}>
                    <tr
                      className="cursor-pointer border-b border-[#edf2f5] hover:bg-[#f7fafb]"
                      onClick={() => setOpenRow((current) => (current === row.key ? '' : row.key))}
                      aria-expanded={openRow === row.key}
                    >
                      <td className={`px-2 py-2.5 ${muted(row.kind) ? 'text-[#8a98a2]' : 'font-semibold'}`}>{row.label}</td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2.5 rounded-full ${muted(row.kind) ? 'bg-[#c9d3d9]' : 'bg-[#38a9bd]'}`}
                            style={{ width: `${(row.siteCount / maxCount) * 70}%` }}
                          />
                          <span className="tabular-nums">{row.siteCount}</span>
                          <span className="text-xs text-[#8a98a2]">{Math.round((row.siteCount / Math.max(1, totalSites)) * 100)}%</span>
                        </div>
                      </td>
                      {canSeeSales && <td className="px-2 py-2.5 text-right tabular-nums">{formatMoney(row.salesTotal)}</td>}
                      {canSeeSales && <td className="px-2 py-2.5 text-right tabular-nums">{formatMoney(row.average)}</td>}
                    </tr>
                    {openRow === row.key && (
                      <tr className="border-b border-[#edf2f5] bg-[#f7fafb]">
                        <td colSpan={canSeeSales ? 4 : 2} className="px-3 py-2">
                          <ul className="grid gap-1 text-xs text-[#38434b]">
                            {row.sites.map((site) => (
                              <li key={site._id} className="flex flex-wrap gap-x-3">
                                <span className="font-semibold">{site.title || '현장명 없음'}</span>
                                <span>{site.customerName}</span>
                                {row.kind === 'other' && <span>{site.answer}</span>}
                                {site.by && <span className="text-[#60717d]">{site.by === 'customer' ? '고객 답변' : '직원 입력'}</span>}
                                {site.at && <span className="text-[#8a98a2]">{formatSeoulDateTime(site.at)}</span>}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-[#8a98a2]">경로를 누르면 그 경로의 현장 목록이 펼쳐집니다.</p>
          </div>
        )}
      </TabPanel>

      <TabPanel title="설문 보기 관리">
        <p className="text-sm leading-6 text-[#60717d]">고객 설문에 보이는 보기와 순서입니다. 보기 이름은 12자까지 쓸 수 있습니다.</p>
        {options && (
          <>
            <ul className="mt-3 grid gap-1.5">
              {draft.map((item, index) => (
                <li key={item.key} className={`flex items-center gap-1.5 rounded-md border border-[#d5dde2] px-2 py-1.5 ${item.hidden ? 'bg-[#f7fafb]' : 'bg-white'}`}>
                  <input
                    value={item.label}
                    maxLength={12}
                    aria-label={`보기 ${index + 1} 이름`}
                    onChange={(event) => setDraft((current) => current.map((row) => (row.key === item.key ? { ...row, label: event.target.value } : row)))}
                    className={`min-w-0 flex-1 rounded border border-transparent px-2 py-1 text-sm font-semibold outline-none focus:border-[#38a9bd] ${item.hidden ? 'text-[#9aa7b0] line-through' : ''}`}
                  />
                  {item.hidden && <span className="shrink-0 rounded-full bg-[#fff4e0] px-2 py-0.5 text-[11px] font-bold text-[#8b6420]">숨김</span>}
                  <button type="button" aria-label="위로" disabled={index === 0} onClick={() => moveDraft(index, -1)} className="rounded p-1 text-[#60717d] hover:bg-[#edf2f5] disabled:opacity-30">
                    <ArrowUp size={15} />
                  </button>
                  <button type="button" aria-label="아래로" disabled={index === draft.length - 1} onClick={() => moveDraft(index, 1)} className="rounded p-1 text-[#60717d] hover:bg-[#edf2f5] disabled:opacity-30">
                    <ArrowDown size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft((current) => current.map((row) => (row.key === item.key ? { ...row, hidden: !row.hidden } : row)))}
                    className="inline-flex shrink-0 items-center gap-1 rounded border border-[#d5dde2] bg-white px-2 py-1 text-xs font-semibold"
                  >
                    {item.hidden ? <Eye size={13} /> : <EyeOff size={13} />}
                    {item.hidden ? '보이기' : '숨기기'}
                  </button>
                </li>
              ))}
              <li className="flex items-center gap-2 rounded-md border border-dashed border-[#d5dde2] bg-[#fafcfd] px-3 py-2 text-sm font-semibold text-[#60717d]">
                기타 (직접 입력)
                <span className="text-xs font-normal">항상 맨 아래</span>
              </li>
            </ul>
            <div className="mt-2 flex gap-2">
              <input
                value={newLabel}
                maxLength={12}
                onChange={(event) => setNewLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) addDraft();
                }}
                placeholder="새 보기 이름"
                aria-label="새 보기 이름"
                className="min-w-0 flex-1 rounded-md border border-[#d5dde2] px-3 py-2 text-sm outline-none focus:border-[#38a9bd]"
              />
              <button type="button" onClick={addDraft} disabled={!newLabel.trim()} className="inline-flex items-center gap-1 rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40">
                <Plus size={15} /> 보기 추가
              </button>
            </div>
            <p className="mt-3 rounded-md border border-[#f0dca8] bg-[#fff8e6] px-3 py-2 text-xs leading-5 text-[#8b6420]">
              숨겨도 예전 답은 통계에 남아요. 이름을 바꾸면 예전 답도 새 이름으로 묶여요.
            </p>
            {message && (
              <p role={message.tone === 'error' ? 'alert' : 'status'} className={`mt-2 text-sm font-semibold ${message.tone === 'error' ? 'text-red-600' : 'text-[#1f6f7f]'}`}>
                {message.text}
              </p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" disabled={!dirty || saving} onClick={() => options && applyLoaded({ options, updateTime })} className="rounded-md border border-[#d5dde2] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40">
                되돌리기
              </button>
              <button type="button" disabled={!dirty || saving} onClick={() => void saveDraft()} className="inline-flex items-center gap-1.5 rounded-md bg-[#171512] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                {saving && <Loader2 className="animate-spin" size={15} />}
                저장
              </button>
            </div>
          </>
        )}
      </TabPanel>
    </div>
  );
}
