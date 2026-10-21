'use client';

import { useState } from 'react';
import {
  CONSULTATION_MEMO_MAX,
  CONSULTATION_STATUSES,
  consultationGroup,
  timeAgo,
  type ConsultationGroup,
  type MobileConsultation,
} from '../../lib/mobile-overview';
import { CONSULTATION_GROUP_LABELS, movedConsultationNotice, syncedMemoDraft } from './mobile-screen';
import { CallButton, EmptyText, Notice, Pill } from './mobile-ui';

const GROUPS: ConsultationGroup[] = ['new', 'open', 'done'];

export type ConsultationChange = { status?: string; memo?: string };

export function ConsultationsTab({
  consultations,
  nowMs,
  onSave,
}: {
  consultations: MobileConsultation[];
  nowMs: number;
  onSave: (id: string, change: ConsultationChange) => Promise<void>;
}) {
  const [group, setGroup] = useState<ConsultationGroup>('new');
  const [openId, setOpenId] = useState<string | null>(null);
  // A status change can move the card out of the group on screen; this note stays so the change does not look lost.
  const [moved, setMoved] = useState<{ text: string; group: ConsultationGroup } | null>(null);
  const counts = { new: 0, open: 0, done: 0 };
  consultations.forEach((item) => (counts[consultationGroup(item.status)] += 1));
  const shown = consultations.filter((item) => consultationGroup(item.status) === group);

  const showGroup = (next: ConsultationGroup) => {
    setGroup(next);
    setMoved(null);
  };

  const save = async (item: MobileConsultation, change: ConsultationChange) => {
    await onSave(item.id, change);
    if (change.status === undefined) return;
    const text = movedConsultationNotice(item.name, change.status, group);
    setMoved(text ? { text, group: consultationGroup(change.status) } : null);
  };

  return (
    <div className="space-y-3">
      <h1 className="text-[22px] font-bold text-[#171512]">상담</h1>
      <div className="flex rounded-xl bg-[#f1ebe0] p-1 text-sm" role="tablist">
        {GROUPS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={group === key}
            onClick={() => showGroup(key)}
            className={`h-10 flex-1 rounded-lg ${group === key ? 'bg-white font-bold text-[#171512] shadow-sm' : 'text-[#625d54]'}`}
          >
            {CONSULTATION_GROUP_LABELS[key]} {counts[key]}
          </button>
        ))}
      </div>
      {group === 'done' && <p className="px-1 text-xs text-[#8b8276]">계약·완료는 최근 30일 것만 보여요.</p>}
      {moved && (
        <Notice tone="ok">
          <p>{moved.text}</p>
          <button type="button" onClick={() => showGroup(moved.group)} className="h-8 text-xs font-semibold underline underline-offset-2">
            {CONSULTATION_GROUP_LABELS[moved.group]} 묶음 보기
          </button>
        </Notice>
      )}

      {shown.length === 0 ? (
        <EmptyText>{group === 'new' ? '새 상담이 없어요.' : '해당하는 상담이 없어요.'}</EmptyText>
      ) : (
        shown.map((item) => (
          <ConsultationCard
            key={item.id}
            item={item}
            nowMs={nowMs}
            open={openId === item.id}
            onToggle={() => setOpenId((current) => (current === item.id ? null : item.id))}
            onSave={(change) => save(item, change)}
          />
        ))
      )}
    </div>
  );
}

function ConsultationCard({
  item,
  nowMs,
  open,
  onToggle,
  onSave,
}: {
  item: MobileConsultation;
  nowMs: number;
  open: boolean;
  onToggle: () => void;
  onSave: (change: ConsultationChange) => Promise<void>;
}) {
  const [memo, setMemo] = useState(item.memo);
  // The memo last seen from the server: when a reload brings a different one, the box follows it unless it is being edited.
  const [serverMemo, setServerMemo] = useState(item.memo);
  if (serverMemo !== item.memo) {
    setServerMemo(item.memo);
    setMemo(syncedMemoDraft(memo, serverMemo, item.memo));
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const chips = [item.siteType, item.areaRange, item.reason, item.timeline].filter(Boolean);

  const save = async (change: ConsultationChange, doneText: string) => {
    setSaving(true);
    setError('');
    setSaved('');
    try {
      await onSave(change);
      setSaved(doneText);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#eadfcd] bg-white px-4 py-3">
      <div className="flex items-start gap-3">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <span className="flex items-center gap-2">
            <span className="truncate font-bold text-[#171512]">{item.name}</span>
            {item.status === '신규' ? <Pill dark>NEW</Pill> : <Pill>{item.status}</Pill>}
          </span>
          <span className="mt-0.5 block text-xs text-[#625d54]">{[timeAgo(item.createdAt, nowMs), item.region].filter(Boolean).join(' · ')}</span>
        </button>
        <CallButton phone={item.phone} label={`${item.name} 전화`} filled />
      </div>
      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {chips.map((chip, index) => (
            <Pill key={`${index}-${chip}`}>{chip}</Pill>
          ))}
        </div>
      )}
      {item.message && <p className="mt-2 text-sm text-[#514c43]">“{item.message}”</p>}
      {!open && item.memo && <p className="mt-2 truncate text-xs text-[#8b8276]">메모: {item.memo}</p>}

      {!open && (
        <button type="button" onClick={onToggle} className="mt-2 h-9 text-xs font-semibold text-[#8f6f43]">
          상태 바꾸기 · 메모
        </button>
      )}
      {open && (
        <div className="mt-3 space-y-3 rounded-xl bg-[#faf6ef] p-3">
          <div className="flex flex-wrap gap-2">
            {CONSULTATION_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                disabled={saving || status === item.status}
                onClick={() => void save({ status }, `상태를 바꿨어요: ${status}`)}
                className={`h-9 rounded-full border px-3 text-sm ${
                  status === item.status ? 'border-[#171512] bg-[#171512] font-bold text-[#fffdf8]' : 'border-[#d8d1c5] bg-white text-[#171512]'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-[#514c43]">메모</span>
            <textarea
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              maxLength={CONSULTATION_MEMO_MAX}
              rows={3}
              className="mt-1 w-full rounded-lg border border-[#d8d1c5] bg-white px-3 py-2 text-base text-[#171512] outline-none focus:border-[#8f6f43]"
            />
          </label>
          <button
            type="button"
            disabled={saving || memo.trim() === item.memo}
            onClick={() => void save({ memo }, '메모를 저장했어요.')}
            className="h-10 w-full rounded-lg border border-[#171512] text-sm font-bold text-[#171512] disabled:border-[#d8d1c5] disabled:text-[#a59d90]"
          >
            {saving ? '저장하는 중…' : '메모 저장'}
          </button>
          {error && <Notice>{error}</Notice>}
          {saved && <Notice tone="ok">{saved}</Notice>}
        </div>
      )}
    </div>
  );
}
