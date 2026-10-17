// Helpers for the admin consultation alimtalk, kept out of the route so they can be tested without Next.js.

export type AligoResponse = {
  result_code?: string | number;
  code?: string | number;
  message?: string;
  msg?: string;
  info?: { mid?: string | number; scnt?: number; fcnt?: number; [key: string]: unknown };
  [key: string]: unknown;
};

// Matches the button on the approved "상담요청 안내문" template. Set ALIGO_CONSULTATION_ADMIN_BUTTON_JSON if the template changes.
export const DEFAULT_ADMIN_BUTTON_JSON = JSON.stringify({
  button: [{ name: '관리페이지', linkType: 'WL', linkTypeName: '웹링크', linkMo: 'https://www.wevedesign.co.kr/manager-weve-7519' }],
});

export function adminButtonJson(value: string | undefined) {
  return value?.trim() || DEFAULT_ADMIN_BUTTON_JSON;
}

// Kakao rejects any difference from the approved text, and Vercel values are often pasted with "\n" typed out or with Windows line breaks.
export function normalizeTemplateText(value: string) {
  return value.replace(/\\r\\n|\\n/g, '\n').replace(/\r\n?/g, '\n');
}

// Aligo answers with a code (0 = accepted). A response without one, such as an HTML error page, is a failure.
export function isAligoSuccess(payload: AligoResponse) {
  const rawCode = payload.result_code ?? payload.code;
  if (rawCode === undefined || rawCode === null || rawCode === '') return false;
  const code = String(rawCode);
  return code === '0' || code === '1' || code.toLowerCase() === 'success';
}
