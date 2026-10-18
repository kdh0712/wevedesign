'use client';

import { useEffect, useState } from 'react';

// The estimate page's comma-formatted number field (same behaviour as NumberTextInput in page.tsx), for the dialogs
// that live in their own files.
export function NumberTextInput({
  value,
  onChange,
  ariaLabel,
  className = '',
}: {
  value: number;
  onChange: (value: number) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const [displayValue, setDisplayValue] = useState(formatNumberInput(value));
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) setDisplayValue(formatNumberInput(value));
  }, [isEditing, value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={displayValue}
      onFocus={() => setIsEditing(true)}
      onBlur={() => {
        setIsEditing(false);
        setDisplayValue(formatNumberInput(value));
      }}
      onChange={(event) => {
        const nextValue = normalizeNumberInputText(event.target.value);
        setDisplayValue(nextValue);
        onChange(parseNumberInput(nextValue));
      }}
      className={`${className} rounded-md border border-[#d5dde2] px-2 py-2 text-right outline-none focus:border-[#38a9bd]`}
    />
  );
}

function formatNumberInput(value: number) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '';
  return Number(value).toLocaleString('ko-KR');
}

function normalizeNumberInputText(value: string) {
  const cleaned = value.replace(/,/g, '').replace(/[^0-9.-]/g, '');
  const sign = cleaned.startsWith('-') ? '-' : '';
  const unsigned = cleaned.replace(/-/g, '');
  const [integer = '', ...decimalParts] = unsigned.split('.');
  if (cleaned.includes('.')) return `${sign}${integer}.${decimalParts.join('')}`;
  return `${sign}${integer}`;
}

function parseNumberInput(value: string) {
  const normalized = value.replace(/,/g, '').replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
