'use client';

import { Camera, ImagePlus, X } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { REPORT_MAX_TEXT, reportBlockReason, sortSitesForList, type MobileSite } from '../../lib/mobile-overview';
import { jpegFileName, resizeImageFile } from '../../lib/resize-image';
import {
  errorText,
  photoFailureMessages,
  photoProgressLabel,
  postResultMessages,
  shrinkAndUploadPhotos,
  uploadShrunkPhoto,
  type Notice as PostNotice,
  type ProgressApi,
} from '../progress-manager';
import { Notice } from './mobile-ui';

// The phone report is the customer progress record itself (spec §6.3, decided: no internal memo). Same upload pipeline and
// same createUpdate as the PC daily report, so the server rules and the result messages are shared.

type PickedPhoto = { key: string; file: File; name: string; previewUrl: string };

let photoKey = 0;

export function ReportTab({
  sites,
  initialSiteId,
  today,
  designer,
  api,
  ensureSession,
  onDirtyChange,
  onBusyChange,
  onPosted,
}: {
  sites: MobileSite[];
  initialSiteId: string | null;
  today: string;
  designer: string;
  api: ProgressApi;
  ensureSession: () => Promise<unknown>;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onPosted: (siteId: string) => void;
}) {
  const [siteId, setSiteId] = useState(initialSiteId && sites.some((site) => site.id === initialSiteId) ? initialSiteId : '');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [notice, setNotice] = useState<PostNotice | null>(null);
  // Set when a post failed before anything was saved: 다시 시도 sends it again the same way (with or without 알림톡).
  const [retryNotify, setRetryNotify] = useState<boolean | null>(null);
  const busyRef = useRef(false);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  const dirty = photos.length > 0 || text.trim() !== '';
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  // The app keeps the tabs (and the logout) still while photos go up; a closed tab is never busy.
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Object URLs are released when the screen closes.
  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl)), []);

  const addPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;
    setNotice(null);
    setRetryNotify(null);
    setPhotos((current) => [
      ...current,
      ...files.map((file) => ({ key: `p${(photoKey += 1)}`, file, name: file.name || 'photo.jpg', previewUrl: URL.createObjectURL(file) })),
    ]);
  };

  const removePhoto = (key: string) =>
    setPhotos((current) => {
      const removed = current.find((photo) => photo.key === key);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((photo) => photo.key !== key);
    });

  const post = async (notify: boolean) => {
    if (busyRef.current) return;
    const problem = reportBlockReason({ siteId, photoCount: photos.length, text });
    if (problem) {
      setNotice({ tone: 'error', lines: [problem] });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    setRetryNotify(null);
    let saving = false;
    try {
      const uploaded = await shrinkAndUploadPhotos(photos, {
        shrink: (photo) => resizeImageFile(photo.file),
        // Checked before every photo: 40 photos on a slow connection can outlast the session.
        upload: async (shrunk, photo) => {
          await ensureSession();
          return uploadShrunkPhoto(api, siteId, shrunk, jpegFileName(photo.name));
        },
        onProgress: (stage, done, total) => setProgress(photoProgressLabel(stage, done, total)),
      });
      if (!uploaded.ok) {
        // Nothing was saved; the photos and the text stay so 다시 시도 is one tap. A photo that could not be opened has to
        // be swapped first, so that failure gets no button.
        setNotice({ tone: 'error', lines: photoFailureMessages(uploaded) });
        if (uploaded.stage === 'upload') setRetryNotify(notify);
        return;
      }
      setProgress(notify ? '저장하고 알림톡 보내는 중' : '저장하는 중');
      await ensureSession();
      saving = true;
      const saved = await api.createUpdate({ siteId, reportDate: today, designer, workDetail: text.trim(), photos: uploaded.photos, notify });
      setNotice(postResultMessages(saved, notify, uploaded.photos.length));
      photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      setPhotos([]);
      setText('');
      onPosted(siteId);
    } catch (error) {
      if (saving) {
        // The record may have been saved before the answer was lost, so no 다시 시도 here.
        setNotice({ tone: 'error', lines: [errorText(error, '진행 기록을 저장하지 못했습니다.'), '현장 상세의 최근 보고에 없으면 다시 올려 주세요.'] });
      } else {
        setNotice({ tone: 'error', lines: [errorText(error, '사진을 올리지 못했습니다.'), '아무것도 저장되지 않았어요. 사진과 글은 그대로 있어요.'] });
        setRetryNotify(notify);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      setProgress('');
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-bold text-[#171512]">오늘 보고</h1>

      <label className="block">
        <span className="text-sm font-semibold text-[#514c43]">현장</span>
        <select
          value={siteId}
          onChange={(event) => setSiteId(event.target.value)}
          disabled={busy}
          className="mt-1 h-12 w-full rounded-xl border border-[#d8d1c5] bg-white px-3 text-base text-[#171512]"
        >
          <option value="">현장을 고르세요</option>
          {sortSitesForList(sites).map((site) => (
            <option key={site.id} value={site.id}>
              {site.title} ({site.status || '상태 없음'})
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-[#8b8276]">작업일 {today}</span>
      </label>

      <div>
        <p className="text-sm font-semibold text-[#514c43]">
          사진 <span className="font-normal text-[#8b8276]">· 고객에게 보낼 사진만 넣어 주세요</span>
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <div key={photo.key} className="relative aspect-square overflow-hidden rounded-xl bg-[#efe8dc]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.previewUrl} alt="" className="h-full w-full object-cover" />
              {!busy && (
                <button
                  type="button"
                  onClick={() => removePhoto(photo.key)}
                  aria-label="사진 빼기"
                  className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
          <PhotoInput icon={<Camera className="h-6 w-6" aria-hidden="true" />} label="촬영" capture disabled={busy} onChange={addPhotos} />
          <PhotoInput icon={<ImagePlus className="h-6 w-6" aria-hidden="true" />} label="앨범" disabled={busy} onChange={addPhotos} />
        </div>
      </div>

      <label className="block">
        <span className="text-sm font-semibold text-[#514c43]">고객에게 보이는 내용</span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={REPORT_MAX_TEXT}
          rows={4}
          disabled={busy}
          placeholder="거실 벽체 마감과 전기 배선 작업을 진행했습니다."
          className="mt-1 w-full rounded-xl border border-[#d8d1c5] bg-white px-4 py-3 text-base leading-relaxed text-[#171512] outline-none placeholder:text-[#b4ab9d] focus:border-[#8f6f43]"
        />
      </label>

      {notice && (
        <Notice tone={notice.tone} onRetry={retryNotify !== null && !busy ? () => void post(retryNotify) : undefined}>
          {notice.lines.map((line, index) => (
            <p key={`${index}-${line}`}>{line}</p>
          ))}
        </Notice>
      )}

      <div className="space-y-2">
        <p className="text-center text-xs text-[#8b8276]">두 버튼 모두 고객 진행 현황 페이지에 올라갑니다.</p>
        <button
          type="button"
          onClick={() => void post(true)}
          disabled={busy}
          className="h-12 w-full rounded-xl bg-[#171512] text-base font-bold text-[#fffdf8] disabled:opacity-60"
        >
          {busy && progress ? progress : '올리고 알림톡 보내기'}
        </button>
        <button
          type="button"
          onClick={() => void post(false)}
          disabled={busy}
          className="h-12 w-full rounded-xl border border-[#d8d1c5] bg-white text-base font-semibold text-[#171512] disabled:opacity-60"
        >
          올리기만
        </button>
      </div>
    </div>
  );
}

function PhotoInput({
  icon,
  label,
  capture = false,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
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
