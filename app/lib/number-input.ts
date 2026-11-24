// Number fields that show thousands commas while typing (10,000), shared by the estimate inputs, the sales form and the
// receipt amounts. Pure and import-free so Node tests load it directly. The caret is kept after the same digit when the
// commas move, so typing or deleting in the middle of a number works.

export type TypedNumberOptions = { decimals?: boolean; negative?: boolean };

const groupThousands = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// Keeps the digits, one decimal point (unless decimals: false) and a leading minus (unless negative: false); anything
// else (commas, spaces, 원) is dropped. Leading zeros go, but a lone 0 or "0." stays so 0.5 can be typed.
export function formatTypedNumber(text: string, options: TypedNumberOptions = {}): string {
  const allowDecimals = options.decimals !== false;
  const allowNegative = options.negative !== false;
  const raw = String(text ?? '');
  const negative = allowNegative && raw.trim().startsWith('-');
  let whole = '';
  let fraction = '';
  let hasPoint = false;
  for (const char of raw) {
    if (char >= '0' && char <= '9') {
      if (hasPoint) fraction += char;
      else whole += char;
    } else if (char === '.' && allowDecimals && !hasPoint) {
      hasPoint = true;
    }
  }
  whole = whole.replace(/^0+(?=\d)/, '');
  const wholeText = whole === '' ? (hasPoint ? '0' : '') : groupThousands(whole);
  return `${negative ? '-' : ''}${wholeText}${hasPoint ? `.${fraction}` : ''}`;
}

// The number behind a typed text; nothing usable ('', '-', '.') is 0.
export function parseTypedNumber(text: string, options: TypedNumberOptions = {}): number {
  const value = Number(formatTypedNumber(text, options).replace(/,/g, ''));
  // `|| 0` also turns -0 (from "-." or "-0") into 0.
  return Number.isFinite(value) ? value || 0 : 0;
}

const isSignificant = (char: string) => (char >= '0' && char <= '9') || char === '.' || char === '-';

// Formats what was typed and moves the caret so it sits after the same digit (commas do not count).
export function reformatWithCaret(text: string, caret: number, options: TypedNumberOptions = {}): { text: string; caret: number } {
  const formatted = formatTypedNumber(text, options);
  let wanted = 0;
  for (const char of String(text ?? '').slice(0, Math.max(0, caret))) if (isSignificant(char)) wanted += 1;
  if (wanted === 0) return { text: formatted, caret: 0 };
  let seen = 0;
  for (let index = 0; index < formatted.length; index += 1) {
    if (isSignificant(formatted[index])) seen += 1;
    if (seen === wanted) return { text: formatted, caret: index + 1 };
  }
  return { text: formatted, caret: formatted.length };
}
