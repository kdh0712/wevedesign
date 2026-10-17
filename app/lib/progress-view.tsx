import type { ReactNode } from 'react';
import { Check, Phone } from 'lucide-react';
import { PROGRESS_CONTACT_PHONE, PROGRESS_PHOTOS_UNAVAILABLE_MESSAGE } from './progress-public';
import { ProgressPhotoGallery } from './progress-photo-gallery';
import type { CustomerProgressView, ProgressTaskView } from './site-progress';

// Display-only pieces of the customer progress page. No hooks and no server-only imports: the same components render in the
// server-rendered customer page and inside the manager's client-side preview. Interactivity lives in ProgressPhotoGallery.

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function dateParts(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null;
}

// 2026-10-17 -> "2026년 10월 17일 (토)"; anything that is not a date is shown as written.
function formatReportDate(value: string): string {
  const parts = dateParts(value);
  if (!parts) return value;
  const weekday = WEEKDAYS[new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()];
  return `${parts.year}년 ${parts.month}월 ${parts.day}일 (${weekday})`;
}

// 2026-10-17 -> "10.17" for the schedule rows, "2026.10.17" for the whole construction period.
function formatShortDate(value: string): string {
  const parts = dateParts(value);
  return parts ? `${String(parts.month).padStart(2, '0')}.${String(parts.day).padStart(2, '0')}` : value;
}

function formatFullDate(value: string): string {
  const parts = dateParts(value);
  return parts ? `${parts.year}.${formatShortDate(value)}` : value;
}

function formatTaskRange(task: Pick<ProgressTaskView, 'startDate' | 'endDate'>): string {
  return task.startDate === task.endDate
    ? formatShortDate(task.startDate)
    : `${formatShortDate(task.startDate)} ~ ${formatShortDate(task.endDate)}`;
}

const telHref = (phone: string) => `tel:${phone.replace(/\D/g, '')}`;

const columnClass = 'mx-auto w-full max-w-xl space-y-4 text-[#171512]';

// Page-level frame (background, side padding) for the public page. The manager preview supplies its own frame instead.
export function ProgressShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#eef3f5] px-4 pb-12 pt-8">
      <div className={columnClass}>{children}</div>
    </main>
  );
}

export function ProgressBrand() {
  return (
    <div className="flex justify-center pb-2">
      <img src="/weve-mark.webp" width={176} height={145} alt="WEVE DESIGN" className="h-auto w-[84px]" />
    </div>
  );
}

function CallButton({ phone }: { phone: string }) {
  return (
    <a
      href={telHref(phone)}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#38a9bd] text-base font-bold text-white hover:bg-[#2f94a7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171512]"
    >
      <Phone size={18} aria-hidden="true" />
      {phone} 전화하기
    </a>
  );
}

// A full page message (link switched off, number missing, temporary error) with the company phone button.
export function ProgressNotice({ message }: { message: string }) {
  return (
    <ProgressShell>
      <ProgressBrand />
      <section className="rounded-lg border border-[#d5dde2] bg-white p-5 shadow-sm">
        <h1 className="text-lg font-bold">공사 진행 현황</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#38434b]">{message}</p>
      </section>
      <CallButton phone={PROGRESS_CONTACT_PHONE} />
    </ProgressShell>
  );
}

const sectionClass = 'rounded-lg border border-[#d5dde2] bg-white p-4 shadow-sm';

function SectionTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="mb-3 flex items-center gap-2 text-base font-bold">
      <span className="h-2 w-2 rounded-full bg-[#38a9bd]" aria-hidden="true" />
      {children}
    </h2>
  );
}

const STATE_LABEL: Record<ProgressTaskView['state'], string> = { done: '완료', active: '진행 중', upcoming: '예정' };

function TaskMarker({ state }: { state: ProgressTaskView['state'] }) {
  if (state === 'done') {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#38a9bd] text-white" aria-hidden="true">
        <Check size={14} strokeWidth={3} />
      </span>
    );
  }
  if (state === 'active') {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-[#38a9bd] bg-white" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full bg-[#38a9bd]" />
      </span>
    );
  }
  return <span className="h-6 w-6 shrink-0 rounded-full border-2 border-[#d5dde2] bg-white" aria-hidden="true" />;
}

function ScheduleSection({ schedule }: { schedule: NonNullable<CustomerProgressView['schedule']> }) {
  const allDone = schedule.tasks.every((task) => task.state === 'done');
  return (
    <>
      <section className={sectionClass} aria-labelledby="progress-summary-title">
        <h2 id="progress-summary-title" className="sr-only">
          전체 진행률
        </h2>
        <div className="flex items-end justify-between">
          <p className="text-sm font-semibold text-[#60717d]">전체 진행률</p>
          <p className="text-3xl font-extrabold leading-none text-[#171512]">
            {schedule.percent}
            <span className="ml-0.5 text-lg font-bold">%</span>
          </p>
        </div>
        <div
          role="progressbar"
          aria-label="전체 진행률"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={schedule.percent}
          className="mt-3 h-3 overflow-hidden rounded-full bg-[#d5dde2]"
        >
          <div className="h-full rounded-full bg-[#38a9bd]" style={{ width: `${schedule.percent}%` }} />
        </div>
        <p className="mt-3 text-sm text-[#38434b]">
          <span className="font-semibold text-[#60717d]">공사 기간</span>
          <span className="ml-2">
            {formatFullDate(schedule.startDate)} ~ {formatFullDate(schedule.endDate)}
          </span>
        </p>
        {allDone ? (
          <p className="mt-3 rounded-lg bg-[#eaf6f8] px-3 py-2.5 text-sm font-semibold text-[#1f6f7f]">모든 공정이 완료되었습니다.</p>
        ) : (
          <dl className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-[#eaf6f8] px-3 py-2.5">
              <dt className="text-xs font-semibold text-[#60717d]">지금 공정</dt>
              <dd className="mt-1 text-sm font-bold">{schedule.current.length > 0 ? schedule.current.map((task) => task.name).join(', ') : '없음'}</dd>
            </div>
            <div className="rounded-lg bg-[#f3f6f8] px-3 py-2.5">
              <dt className="text-xs font-semibold text-[#60717d]">다음 공정</dt>
              <dd className="mt-1 text-sm font-bold">
                {schedule.next ? schedule.next.name : '없음'}
                {schedule.next && <span className="mt-0.5 block text-xs font-medium text-[#60717d]">{formatShortDate(schedule.next.startDate)} 시작</span>}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <section className={sectionClass} aria-labelledby="progress-schedule-title">
        <SectionTitle id="progress-schedule-title">공정 일정</SectionTitle>
        <ol className="space-y-1.5">
          {schedule.tasks.map((task) => (
            <li
              key={task.id}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${task.state === 'active' ? 'bg-[#eaf6f8]' : 'bg-[#f7f9fa]'}`}
            >
              <TaskMarker state={task.state} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{task.name}</p>
                <p className="text-xs font-medium text-[#60717d]">{formatTaskRange(task)}</p>
              </div>
              <span
                className={`shrink-0 text-xs font-bold ${task.state === 'active' ? 'text-[#1f6f7f]' : task.state === 'done' ? 'text-[#38a9bd]' : 'text-[#8a98a2]'}`}
              >
                {STATE_LABEL[task.state]}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

// The customer's own view of one site: header, progress and schedule (when there is one), dated records with photos, contact.
// It renders the content column only; the public page wraps it in ProgressShell.
export function ProgressView({ view }: { view: CustomerProgressView }) {
  const heading = view.customerName ? `${view.customerName} 고객님의 공사 진행 현황` : '고객님의 공사 진행 현황';

  return (
    <div className={columnClass}>
      <header className="pb-1 text-center">
        <ProgressBrand />
        {view.siteTitle && <p className="text-sm font-semibold text-[#60717d]">{view.siteTitle}</p>}
        <h1 className="mt-1 text-xl font-extrabold leading-snug">{heading}</h1>
      </header>

      {view.schedule && <ScheduleSection schedule={view.schedule} />}

      <section className={sectionClass} aria-labelledby="progress-records-title">
        <SectionTitle id="progress-records-title">진행 기록</SectionTitle>
        {view.photosUnavailable && (
          <p role="status" className="mb-3 rounded-lg bg-[#fff8e6] px-3 py-2.5 text-sm font-semibold text-[#8b6420]">
            {PROGRESS_PHOTOS_UNAVAILABLE_MESSAGE}
          </p>
        )}
        {view.updates.length === 0 ? (
          <p className="rounded-lg bg-[#f7f9fa] px-3 py-6 text-center text-sm text-[#60717d]">아직 등록된 진행 기록이 없습니다.</p>
        ) : (
          <div className="space-y-4">
            {view.updates.map((update) => {
              const dateLabel = formatReportDate(update.reportDate);
              return (
                <article key={update.id} className="rounded-lg border border-[#d5dde2] p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-bold">{dateLabel}</h3>
                    {update.designer && <p className="shrink-0 text-xs font-semibold text-[#60717d]">담당 {update.designer}</p>}
                  </div>
                  {update.workDetail && (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-[#38434b]">{update.workDetail}</p>
                  )}
                  {update.photos.length > 0 && (
                    <div className="mt-3">
                      <ProgressPhotoGallery photos={update.photos} label={dateLabel} />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className={sectionClass} aria-labelledby="progress-contact-title">
        <SectionTitle id="progress-contact-title">문의</SectionTitle>
        <p className="mb-3 text-sm text-[#38434b]">공사에 대해 궁금한 점은 언제든 전화로 문의해 주세요.</p>
        <CallButton phone={view.contactPhone} />
      </section>
    </div>
  );
}
