'use client';

// The 고객 block of the 고객·현장 form: pick an existing customer by name or number, or enter a new one. A customer with the
// same number is offered before a new one is made; a customer who only shares the name is never linked on its own.
import { useState } from 'react';
import { findSamePhoneCustomers, phoneKey, suggestCustomers } from '../lib/customer-match';
import type { Customer } from './office-types';
import { formatPhoneNumber } from './office-ui';

export type NewCustomerFields = { name: string; phone: string; chatRoomUrl: string; memo: string };

// confirmedPhone: the number (phoneKey) staff chose to register as a new customer although someone already has it.
export type PickedCustomer =
  | { kind: 'existing'; customer: Customer }
  | ({ kind: 'new'; confirmedPhone?: string } & NewCustomerFields);

export const emptyNewCustomer = (fields: Partial<NewCustomerFields> = {}): PickedCustomer => ({
  kind: 'new',
  name: fields.name || '',
  phone: fields.phone || '',
  chatRoomUrl: fields.chatRoomUrl || '',
  memo: fields.memo || '',
});

// The customers with the new customer's number, unless staff already said "그래도 새 고객" for that number.
export function unconfirmedSamePhone(value: PickedCustomer | null, customers: readonly Customer[]): Customer[] {
  if (!value || value.kind !== 'new') return [];
  if (value.confirmedPhone && value.confirmedPhone === phoneKey(value.phone)) return [];
  return findSamePhoneCustomers(value.phone, customers);
}

const input = 'w-full rounded-md border border-[#d5dde2] bg-white px-3 py-2 text-sm outline-none focus:border-[#273541]';
const secondaryButton = 'rounded-md border border-[#d5dde2] bg-white px-3 py-1.5 text-xs font-semibold text-[#273541] hover:bg-[#f7fafb] disabled:opacity-50';
const primaryButton = 'rounded-md bg-[#273541] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1d2833] disabled:opacity-50';

function CustomerLine({ customer, siteCount }: { customer: Customer; siteCount?: number }) {
  return (
    <span className="min-w-0">
      <span className="font-semibold text-[#171512]">{customer.name || '이름 없음'}</span>
      <span className="text-[#60717d]"> · {customer.phone || '연락처 없음'}</span>
      {siteCount !== undefined && <span className="text-[#60717d]"> · {siteCount > 0 ? `현장 ${siteCount}곳` : '현장 없음'}</span>}
    </span>
  );
}

export function CustomerPicker({
  customers,
  siteCounts,
  value,
  onChange,
  disabled,
  onCancel,
}: {
  customers: readonly Customer[];
  siteCounts: ReadonlyMap<string, number>;
  value: PickedCustomer | null;
  onChange: (value: PickedCustomer | null) => void;
  disabled?: boolean;
  // Shown as [취소] while choosing another customer for a site that already has one.
  onCancel?: () => void;
}) {
  const [query, setQuery] = useState('');

  if (value?.kind === 'existing') {
    const { customer } = value;
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#d5dde2] bg-[#f7fafb] px-3 py-2.5 text-sm">
        <CustomerLine customer={customer} siteCount={siteCounts.get(customer._id) || 0} />
        <span className="flex gap-2">
          {customer.chatRoomUrl && (
            <a href={customer.chatRoomUrl} target="_blank" rel="noreferrer" className={secondaryButton}>
              채팅방
            </a>
          )}
          <button type="button" onClick={() => onChange(null)} disabled={disabled} className={secondaryButton}>
            다른 고객
          </button>
        </span>
      </div>
    );
  }

  if (value?.kind === 'new') {
    const samePhone = unconfirmedSamePhone(value, customers);
    const set = (patch: Partial<NewCustomerFields>) => onChange({ ...value, ...patch });
    return (
      <div className="grid gap-2 rounded-md border border-[#d5dde2] p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-[#171512]">새 고객</p>
          <button type="button" onClick={() => onChange(null)} disabled={disabled} className={secondaryButton}>
            기존 고객에서 찾기
          </button>
        </div>
        <label className="grid gap-1 text-xs font-semibold text-[#4d5d66]">
          이름
          <input className={input} value={value.name} onChange={(event) => set({ name: event.target.value })} disabled={disabled} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-[#4d5d66]">
          연락처
          <input
            className={input}
            inputMode="tel"
            value={value.phone}
            onChange={(event) => set({ phone: formatPhoneNumber(event.target.value) })}
            disabled={disabled}
          />
        </label>
        {samePhone.length > 0 && (
          <div className="grid gap-2 rounded-md border border-[#e2c06d] bg-[#fff8e6] p-3 text-sm text-[#5c4614]">
            <p>
              같은 번호의 고객 {samePhone.map((customer) => `${customer.name || '이름 없음'}님`).join(', ')}이 있습니다.
            </p>
            <div className="flex flex-wrap gap-2">
              {samePhone.map((customer) => (
                <button key={customer._id} type="button" onClick={() => onChange({ kind: 'existing', customer })} disabled={disabled} className={primaryButton}>
                  {samePhone.length > 1 ? `${customer.name || '이름 없음'}님으로` : '이 고객으로'}
                </button>
              ))}
              <button type="button" onClick={() => onChange({ ...value, confirmedPhone: phoneKey(value.phone) })} disabled={disabled} className={secondaryButton}>
                그래도 새 고객
              </button>
            </div>
          </div>
        )}
        <label className="grid gap-1 text-xs font-semibold text-[#4d5d66]">
          카카오 채팅방 URL
          <input
            className={input}
            value={value.chatRoomUrl}
            onChange={(event) => set({ chatRoomUrl: event.target.value })}
            placeholder="고객 채팅방 주소 (있을 때만)"
            disabled={disabled}
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-[#4d5d66]">
          고객 메모
          <textarea className={`${input} min-h-16`} value={value.memo} onChange={(event) => set({ memo: event.target.value })} disabled={disabled} />
        </label>
      </div>
    );
  }

  const suggestions = suggestCustomers(query, customers);
  const startNew = () => {
    const trimmed = query.trim();
    const looksLikePhone = trimmed !== '' && /^[\d\s+()-]+$/.test(trimmed);
    onChange(emptyNewCustomer(looksLikePhone ? { phone: formatPhoneNumber(trimmed) } : { name: trimmed }));
  };

  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <input
          className={input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="고객 이름 또는 연락처"
          aria-label="고객 찾기"
          disabled={disabled}
        />
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={disabled} className={secondaryButton}>
            취소
          </button>
        )}
      </div>
      {suggestions.length > 0 && (
        <ul className="grid gap-1">
          {suggestions.map((customer) => (
            <li key={customer._id} className="flex items-center justify-between gap-2 rounded-md border border-[#e3e8eb] px-3 py-2 text-sm">
              <CustomerLine customer={customer} siteCount={siteCounts.get(customer._id) || 0} />
              <button type="button" onClick={() => onChange({ kind: 'existing', customer })} disabled={disabled} className={secondaryButton}>
                이 고객으로
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim() !== '' && suggestions.length === 0 && <p className="text-xs text-[#60717d]">찾는 고객이 없습니다.</p>}
      <button type="button" onClick={startNew} disabled={disabled} className={`${secondaryButton} justify-self-start`}>
        + 새 고객으로 등록
      </button>
    </div>
  );
}
