// Pure parts of the 계약 완료 안내 alimtalk route (send/route.ts). No imports, so Node tests can load this file directly.

// The approved template may use any of these placeholder spellings.
export function fillContractTemplate(template: string, data: { customerName: string; customerPhone: string }): string {
  return template
    .replaceAll('#{고객명}', data.customerName)
    .replaceAll('{고객명}', data.customerName)
    .replaceAll('{{customerName}}', data.customerName)
    .replaceAll('{{name}}', data.customerName)
    .replaceAll('#{연락처}', data.customerPhone)
    .replaceAll('{연락처}', data.customerPhone)
    .replaceAll('{{phone}}', data.customerPhone);
}

// Each site's contract is announced once; a second send needs an explicit resend.
export function contractResendRefusal(site: { contractAlimtalkSentAt?: unknown }, resend: boolean): string | null {
  const sentAt = typeof site.contractAlimtalkSentAt === 'string' ? site.contractAlimtalkSentAt : '';
  if (!sentAt || resend === true) return null;
  return '이미 계약 완료 알림톡을 보낸 현장입니다. 다시 보내려면 다시 보내기를 선택해 주세요.';
}
