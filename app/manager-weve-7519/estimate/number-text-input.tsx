'use client';

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { formatTypedNumber, parseTypedNumber, reformatWithCaret } from '../../lib/number-input';

// The estimate's number field (unit prices, quantities, 실행내역서 amounts …), used by the page and its dialogs. It shows
// thousands commas while typing (10,000) and keeps the caret after the same digit; decimals and a minus are allowed
// (quantities such as 12.5). Rules: app/lib/number-input.ts.
export function NumberTextInput({
  value,
  onChange,
  ariaLabel,
  className = '',
  onKeyDown,
  dataLine,
  dataCol,
  onMouseDown,
  title,
  autoFocus = false,
}: {
  value: number;
  onChange: (value: number) => void;
  ariaLabel?: string;
  className?: string;
  // For the grouped estimate table's keyboard moves (Enter to the next row).
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  dataLine?: string;
  dataCol?: string;
  // The 견적서 table's price cells open the 단가 수정 popup on a mouse press instead of taking the focus.
  onMouseDown?: (event: MouseEvent<HTMLInputElement>) => void;
  title?: string;
  // Focus the field and select its number when it first shows (the 단가 수정 popup's clicked price).
  autoFocus?: boolean;
}) {
  const [displayValue, setDisplayValue] = useState(formatNumberValue(value));
  const [isEditing, setIsEditing] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isEditing) setDisplayValue(formatNumberValue(value));
  }, [isEditing, value]);

  // Only on the first show.
  const autoFocusRef = useRef(autoFocus);
  useEffect(() => {
    if (!autoFocusRef.current) return;
    ref.current?.focus();
    ref.current?.select();
  }, []);

  // After the commas move, put the caret back after the digit it followed.
  useLayoutEffect(() => {
    const input = ref.current;
    if (caretRef.current !== null && input && document.activeElement === input) input.setSelectionRange(caretRef.current, caretRef.current);
    caretRef.current = null;
  });

  return (
    <input
      ref={ref}
      type="text"
      aria-label={ariaLabel}
      data-line={dataLine}
      data-gcol={dataCol}
      title={title}
      onKeyDown={onKeyDown}
      onMouseDown={onMouseDown}
      value={displayValue}
      onFocus={() => setIsEditing(true)}
      onBlur={() => {
        setIsEditing(false);
        setDisplayValue(formatNumberValue(value));
      }}
      onChange={(event) => {
        const target = event.target;
        const next = reformatWithCaret(target.value, target.selectionStart ?? target.value.length);
        caretRef.current = next.caret;
        setDisplayValue(next.text);
        onChange(parseTypedNumber(next.text));
      }}
      className={`${className} rounded-md border border-[#d5dde2] px-2 py-2 text-right outline-none focus:border-[#38a9bd]`}
    />
  );
}

function formatNumberValue(value: number) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '';
  return formatTypedNumber(String(value));
}
