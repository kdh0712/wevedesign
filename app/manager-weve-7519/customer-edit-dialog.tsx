'use client';

// "고객 정보 고치기": the customer's name, number, chat room and memo. What else follows the edit (the open site, the
// customer's other sites) is decided by the caller after onSave.
import { useState } from 'react';
import type { NewCustomerFields } from './customer-picker';
import type { Customer } from './office-types';
import { formatPhoneNumber } from './office-ui';

const input = 'w-full rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm outline-none focus:border-[#273541]';

export function CustomerEditDialog({
  customer,
  saving,
  onClose,
  onSave,
}: {
  customer: Customer;
  saving: boolean;
  onClose: () => void;
  onSave: (fields: NewCustomerFields) => void;
}) {
  const [fields, setFields] = useState<NewCustomerFields>({
    name: customer.name || '',
    phone: customer.phone || '',
    chatRoomUrl: customer.chatRoomUrl || '',
    memo: customer.memo || '',
  });
  const [error, setError] = useState('');
  const set = (patch: Partial<NewCustomerFields>) => setFields((current) => ({ ...current, ...patch }));

  const submit = () => {
    if (!fields.name.trim()) {
      setError('고객 이름을 입력해 주세요.');
      return;
    }
    onSave({ name: fields.name.trim(), phone: fields.phone.trim(), chatRoomUrl: fields.chatRoomUrl.trim(), memo: fields.memo.trim() });
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-[#17212b]/55 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="customer-edit-title" className="w-full max-w-lg rounded-lg bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <h2 id="customer-edit-title" className="text-xl font-semibold">
          고객 정보 고치기
        </h2>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-xs font-semibold text-[#4d5d66]">
            이름
            <input className={input} value={fields.name} onChange={(event) => set({ name: event.target.value })} disabled={saving} />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[#4d5d66]">
            연락처
            <input
              className={input}
              inputMode="tel"
              value={fields.phone}
              onChange={(event) => set({ phone: formatPhoneNumber(event.target.value) })}
              disabled={saving}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[#4d5d66]">
            카카오 채팅방 URL
            <input className={input} value={fields.chatRoomUrl} onChange={(event) => set({ chatRoomUrl: event.target.value })} disabled={saving} />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[#4d5d66]">
            고객 메모
            <textarea className={`${input} min-h-20`} value={fields.memo} onChange={(event) => set({ memo: event.target.value })} disabled={saving} />
          </label>
          {error && <p className="text-sm font-semibold text-[#b42318]">{error}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-md border border-[#d5dde2] bg-white px-4 py-2 text-sm font-semibold text-[#273541] disabled:opacity-50">
            취소
          </button>
          <button type="button" onClick={submit} disabled={saving} className="rounded-md bg-[#273541] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
