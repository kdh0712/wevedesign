'use client';

// 폰 실행내역서 등록 (spec docs/superpowers/specs/2026-11-24-phone-work-lines-design.md). The button opens a choice:
// - 영수증 첨부: photos → site → 날짜·공종·지출·비고·메모 (all optional, or skip) → the site's 영수증함 for the office.
// - 직접 등록: site → 날짜·공종·지출·비고 → one line straight into the site's 실행내역서.
// Below the choice, my own receipts: fix, move or delete them until the office has filed them.
import { Camera, ChevronLeft, ImagePlus, NotebookPen, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import type { MobileSite } from '../../lib/mobile-overview';
import { jpegFileName, resizeImageFile } from '../../lib/resize-image';
import {
  RECEIPT_MAX_PHOTOS,
  RECEIPT_MEMO_MAX,
  RECEIPT_NOTE_MAX,
  RECEIPT_PROCESS_MAX,
  parseReceiptAmount,
  receiptPhoneLabel,
  receiptPickerGroups,
  type SiteReceiptView,
} from '../../lib/site-receipts';
import { todayInSeoul } from '../../lib/site-progress';
import { CommaTextInput } from '../comma-text-input';
import { errorText, photoProgressLabel, shrinkAndUploadPhotos } from '../progress-manager';
import type { PhoneWorkLineApi, ReceiptApi, ReceiptSiteSummary } from '../receipt-api';
import { Notice } from './mobile-ui';

export const LAST_RECEIPT_SITE_KEY = 'weve-receipt-last-site';
export const LEAVE_RECEIPT_CONFIRM = '저장하지 않은 내용이 있어요. 닫으면 사진과 입력이 사라져요. 닫을까요?';

type PickedPhoto = { key: string; file: File; name: string; previewUrl: string };
type SiteOption = { id: string; title: string; address: string; status: string };
type Mode = 'menu' | 'receipt-photos' | 'receipt-site' | 'receipt-details' | 'direct-site' | 'direct-form';
type Details = { receiptDate: string; process: string; amount: string; note: string; memo: string };
type Editing = { id: string; siteId: string } & Details;

let photoKey = 0;

const won = (amount: number | null) => (amount === null ? '금액 없음' : `${amount.toLocaleString('ko-KR')}원`);
const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, '');
const inputClass = 'w-full rounded-xl border border-[#e1d6c4] bg-white px-3 py-2.5 text-base outline-none focus:border-[#8f6f43]';
const emptyDetails = (): Details => ({ receiptDate: todayInSeoul(), process: '', amount: '', note: '', memo: '' });

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

export function WorkLineSheet({
  sites,
  receiptApi,
  workLineApi,
  onClose,
  onDirtyChange,
  onBusyChange,
}: {
  sites: MobileSite[];
  receiptApi: ReceiptApi;
  workLineApi: PhoneWorkLineApi;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const options: SiteOption[] = useMemo(() => sites.map((site) => ({ id: site.id, title: site.title || '현장명 없음', address: site.address, status: site.status })), [sites]);
  const [lastSiteId, setLastSiteId] = useState(readLastSite);
  const groups = useMemo(() => receiptPickerGroups(options, lastSiteId), [options, lastSiteId]);

  const [mode, setMode] = useState<Mode>('menu');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [siteId, setSiteId] = useState('');
  const [details, setDetails] = useState<Details>(emptyDetails);
  const [processes, setProcesses] = useState<string[]>([]);
  const [target, setTarget] = useState<{ id: string; label: string } | null>(null);
  const [customProcess, setCustomProcess] = useState(false);
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
  const albumRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  const typed = details.amount.trim() !== '' || details.note.trim() !== '' || details.memo.trim() !== '' || details.process.trim() !== '';
  const dirty = photos.length > 0 || (mode === 'direct-form' && typed) || (mode === 'receipt-details' && typed);
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
      const data = await receiptApi.mine();
      setMine({ receipts: data.receipts, siteTitles: data.siteTitles });
    } catch (error) {
      setMineError(errorText(error, '내 영수증을 불러오지 못했어요.'));
    }
  }, [receiptApi]);
  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  const run = async (work: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await work();
    } finally {
      busyRef.current = false;
      setBusy(false);
      setProgress('');
    }
  };

  const clearPhotos = () => {
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    setPhotos([]);
  };

  const backToMenu = (message?: { tone: 'ok' | 'error'; text: string }) => {
    clearPhotos();
    setDetails(emptyDetails());
    setSiteId('');
    setTarget(null);
    setProcesses([]);
    setCustomProcess(false);
    setSearchOpen(false);
    setQuery('');
    setMode('menu');
    setNotice(message ?? null);
  };

  // 공종 names of the site's 실행내역서 version (names only). A site without an estimate has no target.
  const loadTarget = async (id: string) => {
    try {
      const data = await workLineApi.target(id);
      setTarget(data.target);
      setProcesses(data.processes);
      return data;
    } catch (error) {
      setTarget(null);
      setProcesses([]);
      throw error;
    }
  };

  // ── 영수증 첨부 ──
  const startReceipt = () => {
    setNotice(null);
    setMode('receipt-photos');
    // The tap is the gesture the phone needs to open its camera / photo picker at once.
    albumRef.current?.click();
  };

  const addPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;
    const room = RECEIPT_MAX_PHOTOS - photosRef.current.length;
    const added = files.slice(0, Math.max(room, 0)).map((file) => ({
      key: `receipt-photo-${(photoKey += 1)}`,
      file,
      name: file.name || '영수증.jpg',
      previewUrl: URL.createObjectURL(file),
    }));
    setPhotos((current) => [...current, ...added]);
    setNotice(files.length > room ? { tone: 'error', text: `사진은 한 영수증에 ${RECEIPT_MAX_PHOTOS}장까지예요.` } : null);
    if (added.length > 0 && mode !== 'receipt-details') setMode('receipt-site');
  };

  const removePhoto = (key: string) => {
    setPhotos((current) => {
      const photo = current.find((item) => item.key === key);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return current.filter((item) => item.key !== key);
    });
  };

  const pickReceiptSite = (id: string) => {
    setSiteId(id);
    setMode('receipt-details');
    // The 공종 list is only a help here; without it 공종 is typed.
    void loadTarget(id).catch(() => undefined);
  };

  const saveReceipt = (withDetails: boolean) =>
    run(async () => {
      if (photosRef.current.length === 0) return setNotice({ tone: 'error', text: '영수증 사진을 찍어 주세요.' });
      const fields = withDetails ? details : { ...emptyDetails(), receiptDate: '' };
      const checked = parseReceiptAmount(fields.amount);
      if (!checked.ok) return setNotice({ tone: 'error', text: checked.error });
      setNotice(null);
      try {
        const uploaded = await shrinkAndUploadPhotos(photosRef.current, {
          shrink: (photo) => resizeImageFile(photo.file),
          upload: (shrunk, photo) => receiptApi.uploadPhoto(siteId, shrunk.blob, jpegFileName(photo.name), shrunk),
          onProgress: (stage, done, total) => setProgress(photoProgressLabel(stage, done, total)),
        });
        if (!uploaded.ok) {
          // Nothing was saved: the photos and the inputs stay, so trying again is one tap.
          const text =
            uploaded.stage === 'resize'
              ? `사진을 열 수 없어요 (${uploaded.failed.map((item) => item.name).join(', ')}). 다른 사진으로 바꿔 주세요.`
              : `사진을 올리지 못해 저장하지 못했어요 (${uploaded.failed[0]?.error || '연결 문제'}). 다시 시도해 주세요.`;
          setNotice({ tone: 'error', text });
          return;
        }
        setProgress('저장하는 중');
        const receipt = await receiptApi.create({
          siteId,
          photos: uploaded.photos,
          amount: fields.amount,
          memo: fields.memo,
          process: fields.process,
          note: fields.note,
          receiptDate: fields.receiptDate,
        });
        writeLastSite(siteId);
        setLastSiteId(siteId);
        const title = siteTitle(siteId);
        setMine((current) => (current ? { receipts: [receipt, ...current.receipts], siteTitles: { ...current.siteTitles, [receipt.siteId]: title } } : current));
        backToMenu({ tone: 'ok', text: `${title}에 영수증을 저장했어요. 사무실에서 실행내역서로 옮겨요.` });
      } catch (error) {
        setNotice({ tone: 'error', text: errorText(error, '영수증을 저장하지 못했어요. 다시 시도해 주세요.') });
        void loadMine();
      }
    });

  // ── 직접 등록 ──
  const startDirect = () => {
    setNotice(null);
    setDetails(emptyDetails());
    setMode('direct-site');
  };

  const pickDirectSite = (id: string) =>
    run(async () => {
      setNotice(null);
      try {
        const data = await loadTarget(id);
        if (!data.target) {
          setNotice({ tone: 'error', text: '이 현장은 견적이 없어 실행내역서에 바로 넣을 수 없어요. 영수증 첨부로 남겨 주세요.' });
          return;
        }
        setSiteId(id);
        setCustomProcess(data.processes.length === 0);
        setDetails(emptyDetails());
        setMode('direct-form');
      } catch (error) {
        setNotice({ tone: 'error', text: errorText(error, '실행내역서를 불러오지 못했어요.') });
      }
    });

  const saveDirect = () =>
    run(async () => {
      if (!details.process.trim()) return setNotice({ tone: 'error', text: '공종을 골라 주세요.' });
      const checked = parseReceiptAmount(details.amount);
      if (!checked.ok) return setNotice({ tone: 'error', text: checked.error });
      if (checked.amount === null || checked.amount < 1) return setNotice({ tone: 'error', text: '지출 금액을 적어 주세요.' });
      setNotice(null);
      try {
        const saved = await workLineApi.add({ siteId, date: details.receiptDate, process: details.process.trim(), expense: details.amount, note: details.note });
        writeLastSite(siteId);
        setLastSiteId(siteId);
        setNotice({ tone: 'ok', text: `${details.process.trim()} ${won(checked.amount)}을 ${siteTitle(siteId)} ${saved.label} 실행내역서에 넣었어요.` });
        // Ready for the next line of the same site: the date stays, the rest clears.
        setDetails((current) => ({ ...emptyDetails(), receiptDate: current.receiptDate }));
        if (!processes.includes(details.process.trim())) setProcesses((current) => [...current, details.process.trim()]);
      } catch (error) {
        setNotice({ tone: 'error', text: errorText(error, '실행내역서에 넣지 못했어요. 다시 시도해 주세요.') });
      }
    });

  // ── 공통 ──
  const close = () => {
    if (busyRef.current) return;
    if (dirty && !window.confirm(LEAVE_RECEIPT_CONFIRM)) return;
    onClose();
  };

  const back = () => {
    if (busyRef.current) return;
    if (mode === 'receipt-details') return setMode('receipt-site');
    if (mode === 'receipt-site') return setMode('receipt-photos');
    if (mode === 'direct-form') return setMode('direct-site');
    if (dirty && !window.confirm(LEAVE_RECEIPT_CONFIRM)) return;
    backToMenu();
  };

  const openSearch = async () => {
    setSearchOpen(true);
    if (allSites) return;
    setSearchError('');
    try {
      setAllSites(await receiptApi.searchSites());
    } catch (error) {
      setSearchError(errorText(error, '현장 목록을 불러오지 못했어요.'));
    }
  };

  const searchResults = useMemo(() => {
    const q = normalize(query);
    if (!allSites) return [];
    return allSites.filter((site) => !q || normalize(site.title).includes(q) || normalize(site.address).includes(q)).slice(0, 30);
  }, [allSites, query]);

  const saveEdit = () =>
    run(async () => {
      if (!editing) return;
      const checked = parseReceiptAmount(editing.amount);
      if (!checked.ok) return setEditError(checked.error);
      setEditError('');
      try {
        const receipt = await receiptApi.update(editing);
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
      }
    });

  const remove = (receipt: SiteReceiptView) => {
    if (!window.confirm('이 영수증을 지울까요? 사진도 함께 지워져요.')) return;
    void run(async () => {
      try {
        await receiptApi.remove(receipt.id);
        setMine((current) => (current ? { ...current, receipts: current.receipts.filter((item) => item.id !== receipt.id) } : current));
        if (editing?.id === receipt.id) setEditing(null);
      } catch (error) {
        setMineError(errorText(error, '영수증을 지우지 못했어요.'));
        void loadMine();
      }
    });
  };

  const sitePicker = (onPick: (id: string) => void) => {
    const siteButton = (site: SiteOption | ReceiptSiteSummary) => (
      <button
        key={site.id}
        type="button"
        onClick={() => onPick(site.id)}
        disabled={busy}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#eadfcd] bg-white px-3 py-2.5 text-left text-[#171512] active:bg-[#faf6ef] disabled:opacity-60"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{site.title || '현장명 없음'}</span>
          {site.address && <span className="block truncate text-xs text-[#8b8276]">{site.address}</span>}
        </span>
        {site.status && <span className="shrink-0 text-xs text-[#8b8276]">{site.status}</span>}
      </button>
    );
    return (
      <section className="space-y-2">
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
    );
  };

  const field = (label: string, control: ReactNode, hint?: string) => (
    <label className="grid gap-1 text-sm font-semibold text-[#514c43]">
      <span>
        {label}
        {hint && <span className="ml-1 font-normal text-[#8b8276]">{hint}</span>}
      </span>
      {control}
    </label>
  );

  const processField = (required: boolean) => (
    <>
      {processes.length > 0 && !customProcess ? (
        field(
          '공종',
          <select
            value={details.process}
            onChange={(event) => {
              if (event.target.value === '__custom__') {
                setCustomProcess(true);
                setDetails({ ...details, process: '' });
              } else {
                setDetails({ ...details, process: event.target.value });
              }
            }}
            aria-label="공종"
            className={inputClass}
          >
            <option value="">{required ? '공종 고르기' : '고르지 않음'}</option>
            {processes.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value="__custom__">직접 입력…</option>
          </select>,
          required ? undefined : '(선택)',
        )
      ) : (
        field(
          '공종',
          <input value={details.process} onChange={(event) => setDetails({ ...details, process: event.target.value })} maxLength={RECEIPT_PROCESS_MAX} placeholder="예: 타일" aria-label="공종" className={inputClass} />,
          required ? undefined : '(선택)',
        )
      )}
      {customProcess && processes.length > 0 && (
        <button type="button" onClick={() => setCustomProcess(false)} className="-mt-1 text-left text-xs font-semibold text-[#8f6f43]">
          공종 목록에서 고르기
        </button>
      )}
    </>
  );

  const header = (title: string, step?: string) => (
    <div className="flex items-center gap-2">
      {mode !== 'menu' && (
        <button type="button" onClick={back} disabled={busy} aria-label="이전" className="flex h-10 w-10 items-center justify-center rounded-full text-[#514c43] disabled:opacity-40">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
      <h2 className="min-w-0 flex-1 truncate text-lg font-bold text-[#171512]">
        {title}
        {step && <span className="ml-2 text-sm font-normal text-[#8b8276]">{step}</span>}
      </h2>
      <button type="button" onClick={close} disabled={busy} aria-label="닫기" className="flex h-10 w-10 items-center justify-center rounded-full text-[#514c43] disabled:opacity-40">
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );

  const photoStrip = (
    <div className="grid grid-cols-3 gap-2">
      {photos.map((photo) => (
        <div key={photo.key} className="relative aspect-square overflow-hidden rounded-xl border border-[#eadfcd] bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of a picked file */}
          <img src={photo.previewUrl} alt="고른 영수증 사진" className="h-full w-full object-cover" />
          <button type="button" onClick={() => removePhoto(photo.key)} disabled={busy} aria-label="사진 빼기" className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ))}
      {photos.length < RECEIPT_MAX_PHOTOS && (
        <>
          <PhotoPicker label="촬영" icon={<Camera className="h-6 w-6" aria-hidden="true" />} capture disabled={busy} onChange={addPhotos} />
          <PhotoPicker label="사진첩" icon={<ImagePlus className="h-6 w-6" aria-hidden="true" />} disabled={busy} onChange={addPhotos} />
        </>
      )}
    </div>
  );

  const editSiteOptions = (current: string) => {
    const list: Array<{ id: string; title: string }> = [...options, ...(allSites || []).filter((site) => !options.some((item) => item.id === site.id))];
    return list.some((site) => site.id === current) ? list : [{ id: current, title: siteTitle(current) }, ...list];
  };

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-[#fffdf8]" role="dialog" aria-modal="true" aria-label="실행내역서 등록">
      {/* The 영수증 첨부 tap opens this at once: the phone offers its camera and its photo library. */}
      <input ref={albumRef} type="file" accept="image/*" multiple onChange={addPhotos} className="sr-only" aria-hidden="true" tabIndex={-1} />
      <div className="mx-auto max-w-md space-y-4 px-4 pb-12" style={{ paddingTop: 'calc(12px + env(safe-area-inset-top))' }}>
        {mode === 'menu' && (
          <>
            {header('실행내역서 등록')}
            <div className="grid gap-2">
              <button type="button" onClick={startReceipt} disabled={busy} className="flex items-center gap-3 rounded-2xl border border-[#eadfcd] bg-white p-4 text-left active:bg-[#faf6ef]">
                <Camera className="h-7 w-7 shrink-0 text-[#8f6f43]" aria-hidden="true" />
                <span>
                  <span className="block text-base font-bold text-[#171512]">영수증 첨부</span>
                  <span className="block text-xs text-[#8b8276]">바쁠 때 사진만 남겨 두면 사무실에서 실행내역서로 옮겨요</span>
                </span>
              </button>
              <button type="button" onClick={startDirect} disabled={busy} className="flex items-center gap-3 rounded-2xl border border-[#eadfcd] bg-white p-4 text-left active:bg-[#faf6ef]">
                <NotebookPen className="h-7 w-7 shrink-0 text-[#8f6f43]" aria-hidden="true" />
                <span>
                  <span className="block text-base font-bold text-[#171512]">직접 등록</span>
                  <span className="block text-xs text-[#8b8276]">날짜·공종·지출·비고를 적어 실행내역서에 바로 넣어요</span>
                </span>
              </button>
            </div>
            {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

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
                      <button type="button" onClick={() => photo?.url && setViewing(photo.url)} aria-label="영수증 사진 크게 보기" className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[#f3eee5]">
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
                          {receipt.receiptDate} · {receipt.process ? `${receipt.process} · ` : ''}
                          {won(receipt.amount)}
                          {receipt.photos.length > 1 ? ` · 사진 ${receipt.photos.length}장` : ''}
                        </p>
                        {(receipt.note || receipt.memo) && <p className="truncate text-xs text-[#514c43]">{[receipt.note, receipt.memo].filter(Boolean).join(' / ')}</p>}
                      </div>
                      <span className={`h-fit shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${open ? 'bg-[#fff4d6] text-[#7a5a12]' : 'bg-[#eef1ec] text-[#4b5b47]'}`}>{label}</span>
                    </div>
                    {editing?.id === receipt.id ? (
                      <div className="space-y-2 border-t border-[#f1ebe0] pt-2">
                        <select value={editing.siteId} onChange={(event) => setEditing({ ...editing, siteId: event.target.value })} aria-label="현장 바꾸기" className={inputClass}>
                          {editSiteOptions(receipt.siteId).map((site) => (
                            <option key={site.id} value={site.id}>
                              {site.title}
                            </option>
                          ))}
                        </select>
                        <input type="date" value={editing.receiptDate} onChange={(event) => setEditing({ ...editing, receiptDate: event.target.value })} aria-label="날짜" className={inputClass} />
                        <input value={editing.process} onChange={(event) => setEditing({ ...editing, process: event.target.value })} maxLength={RECEIPT_PROCESS_MAX} placeholder="공종" aria-label="공종" className={inputClass} />
                        <CommaTextInput value={editing.amount} onChange={(text) => setEditing({ ...editing, amount: text })} inputMode="numeric" placeholder="지출 (비워도 돼요)" aria-label="지출" className={inputClass} />
                        <input value={editing.note} onChange={(event) => setEditing({ ...editing, note: event.target.value })} maxLength={RECEIPT_NOTE_MAX} placeholder="비고" aria-label="비고" className={inputClass} />
                        <input value={editing.memo} onChange={(event) => setEditing({ ...editing, memo: event.target.value })} maxLength={RECEIPT_MEMO_MAX} placeholder="메모 (사무실에 남기는 말)" aria-label="메모" className={inputClass} />
                        {editError && <p className="text-xs text-[#8a1f17]">{editError}</p>}
                        <div className="flex gap-2">
                          <button type="button" onClick={() => void saveEdit()} disabled={busy} className="h-10 flex-1 rounded-xl bg-[#171512] text-sm font-semibold text-white disabled:opacity-60">
                            고친 내용 저장
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(null);
                              setEditError('');
                            }}
                            disabled={busy}
                            className="h-10 rounded-xl border border-[#e1d6c4] px-4 text-sm"
                          >
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
                              setEditing({
                                id: receipt.id,
                                siteId: receipt.siteId,
                                receiptDate: receipt.receiptDate,
                                process: receipt.process,
                                amount: receipt.amount === null ? '' : String(receipt.amount),
                                note: receipt.note,
                                memo: receipt.memo,
                              });
                            }}
                            disabled={busy}
                            className="h-9 flex-1 rounded-xl border border-[#e1d6c4] text-sm font-semibold text-[#514c43]"
                          >
                            고치기
                          </button>
                          <button type="button" onClick={() => remove(receipt)} disabled={busy} className="h-9 rounded-xl border border-[#f1c0bd] px-4 text-sm font-semibold text-[#8a1f17]">
                            지우기
                          </button>
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </section>
          </>
        )}

        {mode === 'receipt-photos' && (
          <>
            {header('영수증 첨부', '1/3 사진')}
            {photoStrip}
            {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
            <button type="button" onClick={() => setMode('receipt-site')} disabled={photos.length === 0} className="flex h-12 w-full items-center justify-center rounded-2xl bg-[#171512] text-base font-bold text-[#f1c76a] disabled:opacity-40">
              다음: 현장 고르기
            </button>
          </>
        )}

        {mode === 'receipt-site' && (
          <>
            {header('영수증 첨부', '2/3 현장')}
            {photoStrip}
            {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
            {sitePicker(pickReceiptSite)}
          </>
        )}

        {mode === 'receipt-details' && (
          <>
            {header('영수증 첨부', '3/3 내용 (모두 선택)')}
            <p className="text-sm text-[#514c43]">
              <span className="font-semibold">{siteTitle(siteId)}</span> · 사진 {photos.length}장
            </p>
            <div className="grid gap-3">
              {field('날짜', <input type="date" value={details.receiptDate} onChange={(event) => setDetails({ ...details, receiptDate: event.target.value })} aria-label="날짜" className={inputClass} />)}
              {processField(false)}
              {field('지출', <CommaTextInput value={details.amount} onChange={(text) => setDetails({ ...details, amount: text })} inputMode="numeric" placeholder="예: 32,000" aria-label="지출" className={inputClass} />, '(원)')}
              {field('비고', <input value={details.note} onChange={(event) => setDetails({ ...details, note: event.target.value })} maxLength={RECEIPT_NOTE_MAX} placeholder="예: 타일 본드 2통" aria-label="비고" className={inputClass} />)}
              {field('메모', <input value={details.memo} onChange={(event) => setDetails({ ...details, memo: event.target.value })} maxLength={RECEIPT_MEMO_MAX} placeholder="사무실에 남기는 말" aria-label="메모" className={inputClass} />)}
            </div>
            {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
            <div className="grid gap-2">
              <button type="button" onClick={() => void saveReceipt(true)} disabled={busy} className="flex h-12 w-full items-center justify-center rounded-2xl bg-[#171512] text-base font-bold text-[#f1c76a] disabled:opacity-60">
                {busy && progress ? progress : '등록'}
              </button>
              <button type="button" onClick={() => void saveReceipt(false)} disabled={busy} className="h-11 w-full rounded-2xl border border-[#e1d6c4] text-sm font-semibold text-[#514c43] disabled:opacity-60">
                건너뛰고 등록 (사진만)
              </button>
            </div>
          </>
        )}

        {mode === 'direct-site' && (
          <>
            {header('직접 등록', '현장 고르기')}
            {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
            {busy && <p className="text-center text-xs text-[#8b8276]">실행내역서를 확인하는 중…</p>}
            {sitePicker((id) => void pickDirectSite(id))}
          </>
        )}

        {mode === 'direct-form' && (
          <>
            {header('직접 등록')}
            <p className="rounded-xl bg-[#faf6ef] px-3 py-2 text-sm text-[#514c43]">
              <span className="font-semibold">{siteTitle(siteId)}</span> {target?.label || ''} 실행내역서에 바로 들어가요.
            </p>
            <div className="grid gap-3">
              {field('날짜', <input type="date" value={details.receiptDate} onChange={(event) => setDetails({ ...details, receiptDate: event.target.value })} aria-label="날짜" className={inputClass} />)}
              {processField(true)}
              {field('지출', <CommaTextInput value={details.amount} onChange={(text) => setDetails({ ...details, amount: text })} inputMode="numeric" placeholder="예: 32,000" aria-label="지출" className={inputClass} />, '(원)')}
              {field('비고', <input value={details.note} onChange={(event) => setDetails({ ...details, note: event.target.value })} maxLength={RECEIPT_NOTE_MAX} placeholder="예: 타일 본드 2통" aria-label="비고" className={inputClass} />, '(선택)')}
            </div>
            {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
            <button type="button" onClick={() => void saveDirect()} disabled={busy} className="flex h-12 w-full items-center justify-center rounded-2xl bg-[#171512] text-base font-bold text-[#f1c76a] disabled:opacity-60">
              {busy ? '넣는 중…' : '실행내역서에 등록'}
            </button>
          </>
        )}
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
      <input type="file" accept="image/*" {...(capture ? { capture: 'environment' as const } : { multiple: true })} disabled={disabled} onChange={onChange} className="sr-only" />
    </label>
  );
}
