'use client';

// A text field for money (and other whole numbers kept as text) that shows thousands commas while typing, e.g. 10,000,
// with the caret kept after the same digit. The value handed back is the formatted text; callers read it with
// parseTypedNumber (or strip the commas) when they save. Rules: app/lib/number-input.ts.
import { useLayoutEffect, useRef, type InputHTMLAttributes } from 'react';
import { formatTypedNumber, reformatWithCaret } from '../lib/number-input';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string;
  onChange: (text: string) => void;
  decimals?: boolean;
  negative?: boolean;
};

export function CommaTextInput({ value, onChange, decimals = false, negative = false, ...rest }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);

  // After the commas move, put the caret back after the digit it followed.
  useLayoutEffect(() => {
    const input = ref.current;
    if (caretRef.current !== null && input && document.activeElement === input) input.setSelectionRange(caretRef.current, caretRef.current);
    caretRef.current = null;
  });

  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      value={formatTypedNumber(value, { decimals, negative })}
      onChange={(event) => {
        const target = event.target;
        const next = reformatWithCaret(target.value, target.selectionStart ?? target.value.length, { decimals, negative });
        caretRef.current = next.caret;
        onChange(next.text);
      }}
    />
  );
}
