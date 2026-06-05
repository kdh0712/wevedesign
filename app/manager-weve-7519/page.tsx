'use client';

import { useMemo, useState } from 'react';
import { Check, FolderUp, Loader2, Mail, ShieldCheck, UploadCloud } from 'lucide-react';

type UploadResult = {
  projectTitle: string;
  status: 'created' | 'updated' | 'skipped';
  imageCount?: number;
  groupCount?: number;
  reason?: string;
};

type PreviewProject = {
  title: string;
  count: number;
  rooms: string[];
};

type ManagerApiResponse = {
  error?: string;
  results?: UploadResult[];
};

const UPLOAD_PRESETS = [
  { maxWidth: 1920, quality: 0.82 },
  { maxWidth: 1680, quality: 0.78 },
  { maxWidth: 1440, quality: 0.74 },
  { maxWidth: 1280, quality: 0.7 },
];
const MAX_UPLOAD_BYTES = 3.8 * 1024 * 1024;

export default function ManagerPage() {
  const [password, setPassword] = useState('');
  const [category, setCategory] = useState('주택');
  const [featured, setFeatured] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [consultationEmail, setConsultationEmail] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);

  const previews = useMemo(() => buildPreview(files), [files]);

  const authHeaders = () => ({
    'x-manager-password': password,
  });

  const readManagerResponse = async (response: Response): Promise<ManagerApiResponse> => {
    const text = await response.text();

    if (!text) return {};

    try {
      return JSON.parse(text) as ManagerApiResponse;
    } catch {
      return {
        error: text.slice(0, 300) || `Server returned HTTP ${response.status}`,
      };
    }
  };

  const handleFolderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    setStatus('');
    setResults([]);
    setFiles(Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/')));
  };

  const saveEmail = async () => {
    setError('');
    setStatus('');

    if (!password) {
      setError('관리 비밀번호를 먼저 입력해주세요.');
      return;
    }

    setSavingEmail(true);

    try {
      const response = await fetch('/api/manager/settings', {
        method: 'PATCH',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ consultationEmail }),
      });
      const data = await readManagerResponse(response);

      if (!response.ok) throw new Error(data.error || '이메일 저장에 실패했습니다.');
      setStatus('상담문의 수신 이메일을 저장했습니다.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '이메일 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingEmail(false);
    }
  };

  const uploadProjects = async () => {
    setError('');
    setStatus('');
    setResults([]);

    if (!password) {
      setError('관리 비밀번호를 먼저 입력해주세요.');
      return;
    }

    if (files.length === 0) {
      setError('업로드할 현장 폴더를 선택해주세요.');
      return;
    }

    setUploading(true);

    try {
      setStatus('사진을 웹용으로 압축하고 있습니다...');
      const preparedFiles = await prepareUploadFiles(files);
      const totalBytes = preparedFiles.reduce((total, item) => total + item.file.size, 0);

      if (totalBytes > MAX_UPLOAD_BYTES) {
        throw new Error('사진 용량이 아직 큽니다. 한 번에 올릴 사진 수를 줄이거나 원본 사진을 조금 더 작게 저장한 뒤 다시 시도해 주세요.');
      }

      const formData = new FormData();

      preparedFiles.forEach((item) => {
        formData.append('files', item.file);
      });

      formData.append('paths', JSON.stringify(preparedFiles.map((item) => item.path)));
      formData.append('category', category);
      formData.append('featured', String(featured));
      setStatus('Sanity로 업로드하고 있습니다...');

      const response = await fetch('/api/manager/bulk-upload', {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      const data = await readManagerResponse(response);

      if (!response.ok) throw new Error(data.error || '업로드에 실패했습니다.');
      setResults(data.results || []);
      setStatus('현장 사진 업로드가 완료되었습니다.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f3ea] px-5 py-8 text-[#171512] md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col justify-between gap-5 border-b border-[#d9cdbb] pb-6 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#8f6f43]">WEVE MANAGER</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-normal md:text-5xl">간편 홈페이지 관리</h1>
          </div>
          <a href="/studio-weve-3891" className="rounded-md border border-[#cbb992] bg-white px-5 py-3 text-sm font-semibold">
            기존 관리자 페이지
          </a>
        </header>

        <section className="mb-5 rounded-lg border border-[#d9cdbb] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-[#8f6f43]" size={22} />
            <h2 className="text-xl font-semibold">관리 비밀번호</h2>
          </div>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Vercel 환경변수 MANAGER_PASSWORD에 설정한 비밀번호"
            className="mt-4 w-full rounded-md border border-[#d8d1c5] bg-[#fffdf8] px-4 py-3 outline-none focus:border-[#8f6f43]"
          />
        </section>

        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <section className="rounded-lg border border-[#d9cdbb] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <Mail className="text-[#8f6f43]" size={22} />
              <h2 className="text-xl font-semibold">상담문의 이메일</h2>
            </div>
            <p className="mt-3 leading-7 text-[#625d54]">홈페이지 상담문의가 도착할 이메일을 직접 바꿀 수 있습니다.</p>
            <input
              type="email"
              value={consultationEmail}
              onChange={(event) => setConsultationEmail(event.target.value)}
              placeholder="예: hello@wevedesign.co.kr"
              className="mt-5 w-full rounded-md border border-[#d8d1c5] bg-[#fffdf8] px-4 py-3 outline-none focus:border-[#8f6f43]"
            />
            <button
              onClick={saveEmail}
              disabled={savingEmail}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#f1c76a] px-5 py-3 font-semibold disabled:opacity-60"
            >
              {savingEmail ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
              이메일 저장
            </button>
          </section>

          <section className="rounded-lg border border-[#d9cdbb] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <FolderUp className="text-[#8f6f43]" size={22} />
              <h2 className="text-xl font-semibold">현장 폴더 한번에 업로드</h2>
            </div>
            <p className="mt-3 leading-7 text-[#625d54]">
              현장명 폴더 안에 `대표.jpg`, `거실1.jpg`, `거실2.jpg`, `주방1.jpg`처럼 정리한 뒤 폴더를 선택하면
              Project와 공간별 사진 묶음으로 자동 등록됩니다.
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <input
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="카테고리 예: 주택, 아파트"
                className="rounded-md border border-[#d8d1c5] bg-[#fffdf8] px-4 py-3 outline-none focus:border-[#8f6f43]"
              />
              <label className="flex items-center gap-2 rounded-md border border-[#d8d1c5] bg-[#fffdf8] px-4 py-3">
                <input type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} />
                메인 Project에도 표시
              </label>
            </div>

            <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#cbb992] bg-[#fffdf8] px-5 py-10 text-center transition hover:bg-[#fff7df]">
              <UploadCloud className="mb-3 text-[#8f6f43]" size={34} />
              <span className="font-semibold">현장 폴더 선택</span>
              <span className="mt-2 text-sm text-[#625d54]">여러 현장 폴더가 들어있는 상위 폴더도 선택할 수 있습니다.</span>
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={handleFolderChange}
                {...{ webkitdirectory: '', directory: '' }}
              />
            </label>

            {previews.length > 0 && (
              <div className="mt-5 rounded-lg bg-[#f7f3ea] p-4">
                <p className="font-semibold">업로드 미리보기</p>
                <div className="mt-3 grid gap-3">
                  {previews.map((project) => (
                    <div key={project.title} className="rounded-md bg-white p-3 text-sm">
                      <p className="font-semibold">{project.title} · 사진 {project.count}장</p>
                      <p className="mt-1 text-[#625d54]">{project.rooms.join(', ') || '상세 사진 없음'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={uploadProjects}
              disabled={uploading}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#171512] px-5 py-4 font-semibold text-white disabled:opacity-60"
            >
              {uploading ? <Loader2 className="animate-spin" size={18} /> : <UploadCloud size={18} />}
              Sanity에 업로드
            </button>
          </section>
        </div>

        {(status || error || results.length > 0) && (
          <section className="mt-5 rounded-lg border border-[#d9cdbb] bg-white p-5 shadow-sm">
            {status && <p className="font-semibold text-[#2f7d45]">{status}</p>}
            {error && <p className="font-semibold text-red-600">{error}</p>}
            {results.length > 0 && (
              <div className="mt-4 grid gap-2">
                {results.map((result) => (
                  <div key={result.projectTitle} className="rounded-md bg-[#fffdf8] px-4 py-3 text-sm">
                    <strong>{result.projectTitle}</strong> · {result.status}
                    {result.imageCount ? ` · 사진 ${result.imageCount}장 · 공간 ${result.groupCount}개` : ''}
                    {result.reason ? ` · ${result.reason}` : ''}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function buildPreview(files: File[]): PreviewProject[] {
  const map = new Map<string, { count: number; rooms: Set<string> }>();

  files.forEach((file) => {
    const path = file.webkitRelativePath || file.name;
    const parts = path.split(/[\\/]+/).filter(Boolean);
    const fileName = parts[parts.length - 1] || file.name;
    const projectTitle = parts.length > 1 ? parts[parts.length - 2] : fileName.replace(/\.[^.]+$/, '');
    const room = roomNameFromFile(fileName);
    const current = map.get(projectTitle) || { count: 0, rooms: new Set<string>() };
    current.count += 1;
    if (room) current.rooms.add(room);
    map.set(projectTitle, current);
  });

  return Array.from(map.entries()).map(([title, value]) => ({
    title,
    count: value.count,
    rooms: Array.from(value.rooms),
  }));
}

function roomNameFromFile(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, '').trim();
  const normalized = baseName.toLowerCase().replace(/\s+/g, '');

  if (/^(대표|메인|썸네일|커버|cover|main|thumbnail|thumb)$/i.test(normalized)) return '';
  if (/^(시공전|공사전|before|비포)$/i.test(normalized)) return '시공 전';

  const match = baseName.match(/^(.*?)[\s_-]*(\d+)$/);
  return (match ? match[1] : baseName).trim();
}

async function prepareUploadFiles(files: File[]) {
  let prepared = await compressFiles(files, UPLOAD_PRESETS[0]);

  for (const preset of UPLOAD_PRESETS.slice(1)) {
    const totalBytes = prepared.reduce((total, item) => total + item.file.size, 0);
    if (totalBytes <= MAX_UPLOAD_BYTES) break;
    prepared = await compressFiles(files, preset);
  }

  return prepared;
}

async function compressFiles(files: File[], preset: { maxWidth: number; quality: number }) {
  return Promise.all(
    files.map(async (file) => ({
      file: await compressImage(file, preset),
      path: file.webkitRelativePath || file.name,
    })),
  );
}

async function compressImage(file: File, preset: { maxWidth: number; quality: number }) {
  if (!file.type.startsWith('image/')) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, preset.maxWidth / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error('이미지 압축에 실패했습니다.'));
      },
      'image/jpeg',
      preset.quality,
    );
  });

  if (blob.size >= file.size) return file;

  return new File([blob], toJpegFileName(file.name), {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  });
}

function toJpegFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '') + '.jpg';
}
