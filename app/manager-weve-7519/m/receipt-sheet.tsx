'use client';

// 현장 영수증함 on the staff phone (spec docs/superpowers/specs/2026-11-24-site-receipts-design.md): snap a receipt (1–3
// photos), pick the site, add an amount and a memo if wanted, save. Below, my own receipts: fix, move or delete them until
// the office has filed them into a 실행내역서.
import { Camera, ImagePlus, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import type { MobileSite } from '../../lib/mobile-overview';
import { jpegFileName, resizeImageFile } from '../../lib/resize-image';
import {
  RECEIPT_MAX_PHOTOS,
  RECEIPT_MEMO_MAX,
  parseReceiptAmount,
  receiptPhoneLabel,
  receiptPickerGroups,
  type SiteReceiptView,
} from '../../lib/site-receipts';
import { errorText, photoProgressLabel, shrinkAndUploadPhotos } from '../progress-manager';
import type { ReceiptApi, ReceiptSiteSummary } from '../receipt-api';
import { Notice } from './mobile-ui';

export const LAST_RECEIPT_SITE_KEY = 'weve-receipt-last-site';
export const LEAVE_RECEIPT_CONFIRM = '저장하지 않은 영수증이 있어요. 닫으면 사진과 입력이 사라져요. 닫을까요?';

type PickedPhoto = { key: string; file: File; name: string; previewUrl: string };
type SiteOption = { id: string; title: string; address: string; status: string };
type Editing = { id: string; siteId: string; amount: string; memo: string };

let photoKey = 0;

const won = (amount: number | null) => (amount === null ? '금액 없음' : `${amount.toLocaleString('ko-KR')}원`);
const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, '');

function readLastSite(): string | null {
  try {
    return window.localStorage.getItem(LAST_RECEIPT_SITE_KEY);
  } catch {
    return null;
  }
}

function writeLastSite(siteId: string) {
  try {
    window.localStorage.setItem(LAST_RECEIPT_SITE_KEY, siteId);
  } catch {
    // Storage may be blocked; the site is just not offered first next time.
  }
}

const inputClass = 'w-full rounded-xl border border-[#e1d6c4] bg-white px-3 py-2.5 text-base outline-none focus:border-[#8f6f43]';

export function ReceiptSheet({
  sites,
  api,
  onClose,
  onDirtyChange,
  onBusyChange,
}: {
  sites: MobileSite[];
  api: ReceiptApi;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const options: SiteOption[] = useMemo(() => sites.map((site) => ({ id: site.id, title: site.title || '현장명 없음', address: site.address, status: site.status })), [sites]);
  const [lastSiteId] = useState(readLastSite);
  const groups = useMemo(() => receiptPickerGroups(options, lastSiteId), [options, lastSiteId]);

  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [siteId, setSiteId] = useState(() => groups.recent?.id || '');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [allSites, setAllSites] = useState<ReceiptSiteSummary[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [query, setQuery] = useState('');
  const [mine, setMine] = useState<{ receipts: SiteReceiptView[]; siteTitles: Record<string, string> } | null>(null);
  const [mineError, setMineError] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [editError, setEditError] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);
  const busyRef = useRef(false);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  const dirty = photos.length > 0 || amount.trim() !== '' || memo.trim() !== '';
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);
  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl)), []);

  const siteTitle = useCallback(
    (id: string) => options.find((site) => site.id === id)?.title || allSites?.find((site) => site.id === id)?.title || mine?.siteTitles[id] || '현장',
    [options, allSites, mine],
  );

  const loadMine = useCallback(async () => {
    setMineError('');
    try {
      const data = await api.mine();
      setMine({ receipts: data.receipts, siteTitles: data.siteTitles });
    } catch (error) {
      setMineError(errorText(error, '내 영수증을 불러오지 못했어요.'));
    }
  }, [api]);
  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  const openSearch = async () => {
    setSearchOpen(true);
    if (allSites) return;
    setSearchError('');
    try {
      setAllSites(await api.searchSites());
    } catch (error) {
      setSearchError(errorText(error, '현장 목록을 불러오지 못했어요.'));
    }
  };

  const searchResults = useMemo(() => {
    const q = normalize(query);
    if (!allSites) return [];
    return allSites.filter((site) => !q || normalize(site.title).includes(q) || normalize(site.address).includes(q)).slice(0, 30);
  }, [allSites, query]);

  const addPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;
    const room = RECEIPT_MAX_PHOTOS - photos.length;
    const added = files.slice(0, Math.max(room, 0)).map((file) => ({
      key: `receipt-photo-${(photoKey += 1)}`,
      file,
      name: file.name || '영수증.jpg',
      previewUrl: URL.createObjectURL(file),
    }));
    setPhotos((current) => [...current, ...added]);
    setNotice(files.length > room ? { tone: 'error', text: `사진은 한 영수증에 ${RECEIPT_MAX_PHOTOS}장까지예요.` } : null);
  };

  const removePhoto = (key: string) => {
    setPhotos((current) => {
      const photo = current.find((item) => item.key === key);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return current.filter((item) => item.key !== key);
    });
  };

  const save = async () => {
    if (busyRef.current) return;
    if (photos.length === 0) return setNotice({ tone: 'error', text: '영수증 사진을 찍어 주세요.' });
    if (!siteId) return setNotice({ tone: 'error', text: '현장을 골라 주세요.' });
    const checked = parseReceiptAmount(amount);
    if (!checked.ok) return setNotice({ tone: 'error', text: checked.error });

    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const uploaded = await shrinkAndUploadPhotos(photos, {
        shrink: (photo) => resizeImageFile(photo.file),
        upload: (shrunk, photo) => api.uploadPhoto(siteId, shrunk.blob, jpegFileName(photo.name), shrunk),
        onProgress: (stage, done, total) => setProgress(photoProgressLabel(stage, done, total)),
      });
      if (!uploaded.ok) {
        // Nothing was saved: the photos and the inputs stay, so trying again is one tap.
        const text =
          uploaded.stage === 'resize'
            ? `사진을 열 수 없어요 (${uploaded.failed.map((item) => item.name).join(', ')}). 다른 사진으로 바꿔 주세요.`
            : `사진을 올리지 못했어요 (${uploaded.failed[0]?.error || '연결 문제'}). 영수증은 저장하지 않았어요. 다시 시도해 주세요.`;
        setNotice({ tone: 'error', text });
        return;
      }
      setProgress('저장하는 중');
      const receipt = await api.create({ siteId, photos: uploaded.photos, amount, memo });
      writeLastSite(siteId);
      const title = siteTitle(siteId);
      setNotice({ tone: 'ok', text: `${title}에 영수증을 저장했어요.` });
      photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      setPhotos([]);
      setAmount('');
      setMemo('');
      setMine((current) =>
        current ? { receipts: [receipt, ...current.receipts], siteTitles: { ...current.siteTitles, [receipt.siteId]: title } } : current,
      );
    } catch (error) {
      setNotice({ tone: 'error', text: `${errorText(error, '영수증을 저장하지 못했어요.')} 다시 시도해 주세요.` });
    } finally {
      busyRef.current = false;
      setBusy(false);
      setProgress('');
    }
  };

  const close = () => {
    if (busyRef.current) return;
    if (dirty && !window.confirm(LEAVE_RECEIPT_CONFIRM)) return;
    onClose();
  };

  const saveEdit = async () => {
    if (!editing || busyRef.current) return;
    const checked = parseReceiptAmount(editing.amount);
    if (!checked.ok) return setEditError(checked.error);
    busyRef.current = true;
    setBusy(true);
    setEditError('');
    try {
      const receipt = await api.update(editing);
      const title = siteTitle(receipt.siteId);
      setMine((current) =>
        current
          ? { receipts: current.receipts.map((item) => (item.id === receipt.id ? receipt : item)), siteTitles: { ...current.siteTitles, [receipt.siteId]: title } }
          : current,
      );
      setEditing(null);
    } catch (error) {
      setEditError(errorText(error, '영수증을 고치지 못했어요.'));
      // Filed meanwhile (409) or gone (404): the list shows the server's state.
      void loadMine();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const remove = async (receipt: SiteReceiptView) => {
    if (busyRef.current || !window.confirm('이 영수증을 지울까요? 사진도 함께 지워져요.')) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await api.remove(receipt.id);
      setMine((current) => (current ? { ...current, receipts: current.receipts.filter((item) => item.id !== receipt.id) } : current));
      if (editing?.id === receipt.id) setEditing(null);
    } catch (error) {
      setMineError(errorText(error, '영수증을 지우지 못했어요.'));
      void loadMine();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const siteButton = (site: SiteOption | ReceiptSiteSummary) => {
    const selected = site.id === siteId;
    return (
      <button
        key={site.id}
        type="button"
        onClick={() => setSiteId(site.id)}
        aria-pressed={selected}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left ${
          selected ? 'border-[#171512] bg-[#171512] text-white' : 'border-[#eadfcd] bg-white text-[#171512]'
        }`}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{site.title || '현장명 없음'}</span>
          {site.address && <span className={`block truncate text-xs ${selected ? 'text-white/70' : 'text-[#8b8276]'}`}>{site.address}</span>}
        </span>
        {site.status && <span className={`shrink-0 text-xs ${selected ? 'text-white/80' : 'text-[#8b8276]'}`}>{site.status}</span>}
      </button>
    );
  };

  // The edit form's site list: the phone's sites, any searched ones, and the receipt's own site if it is in neither.
  const editSiteOptions = (current: string) => {
    const list: Array<{ id: string; title: string }> = [...options, ...(allSites || []).filter((site) => !options.some((item) => item.id === site.id))];
    return list.some((site) => site.id === current) ? list : [{ id: current, title: siteTitle(current) }, ...list];
  };

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-[#fffdf8]" role="dialog" aria-modal="true" aria-label="영수증 남기기">
      <div className="mx-auto max-w-md space-y-4 px-4 pb-12" style={{ paddingTop: 'calc(12px + env(safe-area-inset-top))' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#171512]">영수증 남기기</h2>
          <button type="button" onClick={close} disabled={busy} aria-label="닫기" className="flex h-10 w-10 items-center justify-center rounded-full text-[#514c43] disabled:opacity-40">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-[#514c43]">사진 (최대 {RECEIPT_MAX_PHOTOS}장)</h3>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((photo) => (
              <div key={photo.key} className="relative aspect-square overflow-hidden rounded-xl border border-[#eadfcd] bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of a picked file */}
                <img src={photo.previewUrl} alt="고른 영수증 사진" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(photo.key)}
                  disabled={busy}
                  aria-label="사진 빼기"
                  className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
            {photos.length < RECEIPT_MAX_PHOTOS && (
              <>
                <PhotoPicker label="촬영" icon={<Camera className="h-6 w-6" aria-hidden="true" />} capture disabled={busy} onChange={addPhotos} />
                <PhotoPicker label="앨범에서" icon={<ImagePlus className="h-6 w-6" aria-hidden="true" />} disabled={busy} onChange={addPhotos} />
              </>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-[#514c43]">현장</h3>
          {groups.recent && (
            <div className="space-y-1.5">
              <p className="text-xs text-[#8b8276]">방금 고른 현장</p>
              {siteButton(groups.recent)}
            </div>
          )}
          {groups.active.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-[#8b8276]">진행중</p>
              {groups.active.map(siteButton)}
            </div>
          )}
          {groups.open.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-[#8b8276]">미체결</p>
              {groups.open.map(siteButton)}
            </div>
          )}
          {siteId && !options.some((site) => site.id === siteId) && (
            <div className="space-y-1.5">
              <p className="text-xs text-[#8b8276]">고른 현장</p>
              {siteButton(allSites?.find((site) => site.id === siteId) || { id: siteId, title: siteTitle(siteId), address: '', status: '' })}
            </div>
          )}
          {!searchOpen ? (
            <button type="button" onClick={() => void openSearch()} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#c9bda9] text-sm font-semibold text-[#8f6f43]">
              <Search className="h-4 w-4" aria-hidden="true" /> 다른 현장 찾기 (완료·보류 현장 포함)
            </button>
          ) : (
            <div className="space-y-1.5 rounded-xl border border-[#eadfcd] bg-[#faf6ef] p-2">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="현장명이나 주소" aria-label="현장 찾기" className={inputClass} />
              {searchError && <p className="text-xs text-[#8a1f17]">{searchError}</p>}
              {!allSites && !searchError && <p className="py-2 text-center text-xs text-[#8b8276]">불러오는 중…</p>}
              {allSites && searchResults.length === 0 && <p className="py-2 text-center text-xs text-[#8b8276]">맞는 현장이 없어요.</p>}
              {searchResults.map(siteButton)}
            </div>
          )}
        </section>

        <section className="grid grid-cols-[1fr_auto] items-center gap-2">
          <label className="col-span-2 text-sm font-semibold text-[#514c43]" htmlFor="receipt-amount">
            금액 <span className="font-normal text-[#8b8276]">(비워도 돼요)</span>
          </label>
          <input id="receipt-amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="numeric" placeholder="예: 32000" className={inputClass} />
          <span className="text-sm text-[#514c43]">원</span>
          <label className="col-span-2 mt-1 text-sm font-semibold text-[#514c43]" htmlFor="receipt-memo">
            메모 <span className="font-normal text-[#8b8276]">(비워도 돼요)</span>
          </label>
          <input
            id="receipt-memo"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            maxLength={RECEIPT_MEMO_MAX}
            placeholder="예: 타일 본드 2통"
            className={`${inputClass} col-span-2`}
          />
        </section>

        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-[#171512] text-base font-bold text-[#f1c76a] disabled:opacity-60"
        >
          {busy && progress ? progress : '저장'}
        </button>

        <section className="space-y-2 pt-2">
          <h3 className="text-sm font-semibold text-[#514c43]">내가 올린 영수증</h3>
          {mineError && (
            <Notice onRetry={() => void loadMine()}>
              <p>{mineError}</p>
            </Notice>
          )}
          {!mine && !mineError && <p className="py-4 text-center text-xs text-[#8b8276]">불러오는 중…</p>}
          {mine && mine.receipts.length === 0 && <p className="py-4 text-center text-xs text-[#8b8276]">아직 올린 영수증이 없어요.</p>}
          {mine?.receipts.map((receipt) => {
            const label = receiptPhoneLabel(receipt);
            const open = label === '정리 전';
            const photo = receipt.photos[0];
            return (
              <div key={receipt.id} className="space-y-2 rounded-2xl border border-[#eadfcd] bg-white p-3">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => photo?.url && setViewing(photo.url)}
                    aria-label="영수증 사진 크게 보기"
                    className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[#f3eee5]"
                  >
                    {photo?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL
                      <img src={photo.url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-[#8b8276]">사진 없음</span>
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#171512]">{mine.siteTitles[receipt.siteId] || siteTitle(receipt.siteId)}</p>
                    <p className="text-xs text-[#8b8276]">
                      {receipt.receiptDate} · {won(receipt.amount)}
                      {receipt.photos.length > 1 ? ` · 사진 ${receipt.photos.length}장` : ''}
                    </p>
                    {receipt.memo && <p className="truncate text-xs text-[#514c43]">{receipt.memo}</p>}
                  </div>
                  <span className={`h-fit shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${open ? 'bg-[#fff4d6] text-[#7a5a12]' : 'bg-[#eef1ec] text-[#4b5b47]'}`}>
                    {label}
                  </span>
                </div>
                {editing?.id === receipt.id ? (
                  <div className="space-y-2 border-t border-[#f1ebe0] pt-2">
                    <select
                      value={editing.siteId}
                      onChange={(event) => setEditing({ ...editing, siteId: event.target.value })}
                      aria-label="현장 바꾸기"
                      className={inputClass}
                    >
                      {editSiteOptions(receipt.siteId).map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.title}
                        </option>
                      ))}
                    </select>
                    <input value={editing.amount} onChange={(event) => setEditing({ ...editing, amount: event.target.value })} inputMode="numeric" placeholder="금액 (비워도 돼요)" aria-label="금액" className={inputClass} />
                    <input value={editing.memo} onChange={(event) => setEditing({ ...editing, memo: event.target.value })} maxLength={RECEIPT_MEMO_MAX} placeholder="메모" aria-label="메모" className={inputClass} />
                    {editError && <p className="text-xs text-[#8a1f17]">{editError}</p>}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void saveEdit()} disabled={busy} className="h-10 flex-1 rounded-xl bg-[#171512] text-sm font-semibold text-white disabled:opacity-60">
                        고친 내용 저장
                      </button>
                      <button type="button" onClick={() => { setEditing(null); setEditError(''); }} disabled={busy} className="h-10 rounded-xl border border-[#e1d6c4] px-4 text-sm">
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  open && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditError('');
                          setEditing({ id: receipt.id, siteId: receipt.siteId, amount: receipt.amount === null ? '' : String(receipt.amount), memo: receipt.memo });
                        }}
                        disabled={busy}
                        className="h-9 flex-1 rounded-xl border border-[#e1d6c4] text-sm font-semibold text-[#514c43]"
                      >
                        고치기
                      </button>
                      <button type="button" onClick={() => void remove(receipt)} disabled={busy} className="h-9 rounded-xl border border-[#f1c0bd] px-4 text-sm font-semibold text-[#8a1f17]">
                        지우기
                      </button>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </section>
      </div>

      {viewing && (
        <button type="button" onClick={() => setViewing(null)} aria-label="사진 닫기" className="fixed inset-0 z-40 flex items-center justify-center bg-black/85 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL */}
          <img src={viewing} alt="영수증 사진" className="max-h-full max-w-full object-contain" />
        </button>
      )}
    </div>
  );
}

function PhotoPicker({
  label,
  icon,
  capture = false,
  disabled,
  onChange,
}: {
  label: string;
  icon: ReactNode;
  capture?: boolean;
  disabled: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label
      className={`flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-[1.5px] border-dashed border-[#c9bda9] text-xs font-semibold text-[#8f6f43] ${
        disabled ? 'opacity-50' : 'active:bg-[#faf6ef]'
      }`}
    >
      {icon}
      {label}
      <input
        type="file"
        accept="image/*"
        {...(capture ? { capture: 'environment' as const } : { multiple: true })}
        disabled={disabled}
        onChange={onChange}
        className="sr-only"
      />
    </label>
  );
}
