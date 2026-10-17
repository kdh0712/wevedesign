// Pure helpers for masked Firestore REST writes: field paths, the PATCH query string, the office-save mask and the
// conflict check. No imports, so tests can load this file directly; firestore.ts does the fetching.

const SIMPLE_FIELD_NAME = /^[A-Za-z_][A-Za-z_0-9]*$/;

// A top-level key as a Firestore field path. A simple name is used as it is; anything else goes in backticks, with ` and \
// escaped by a backslash.
export function quoteFieldPath(key: string): string {
  if (SIMPLE_FIELD_NAME.test(key)) return key;
  return `\`${key.replace(/[`\\]/g, (character) => `\\${character}`)}\``;
}

export type FirestorePrecondition = { updateTime: string } | { exists: true };

// The query string of a PATCH that writes only these top-level fields: one updateMask.fieldPaths per field, plus the
// precondition. A PATCH without a mask replaces the whole document, so an empty field list is refused here.
export function buildPatchQuery(fieldKeys: readonly string[], precondition?: FirestorePrecondition): string {
  if (fieldKeys.length === 0) throw new Error('A masked Firestore write needs at least one field in its mask.');
  const params = fieldKeys.map((key) => `updateMask.fieldPaths=${encodeURIComponent(quoteFieldPath(key))}`);
  if (precondition && 'updateTime' in precondition) {
    if (!precondition.updateTime) throw new Error('A Firestore updateTime precondition needs the version that was read.');
    params.push(`currentDocument.updateTime=${encodeURIComponent(precondition.updateTime)}`);
  } else if (precondition?.exists) {
    params.push('currentDocument.exists=true');
  }
  return params.join('&');
}

// An office save writes every field of the merged record except the preserved ones, which stay out of both the mask and the
// body, so the stored values of those fields are never touched.
export function maskedWrite(
  record: Record<string, unknown>,
  preserveFields: readonly string[],
): { fieldPaths: string[]; fields: Record<string, unknown> } {
  const preserved = new Set(preserveFields);
  const fields = Object.fromEntries(Object.entries(record).filter(([key]) => !preserved.has(key)));
  return { fieldPaths: Object.keys(fields), fields };
}

const CONFLICT_STATUSES = new Set(['FAILED_PRECONDITION', 'NOT_FOUND', 'ABORTED']);

// A failed precondition (400 FAILED_PRECONDITION), a missing document under exists=true (404 NOT_FOUND) and contention
// (409 ABORTED). Without an error status only the HTTP code can tell, and a bare 400 may be anything.
export function isFirestoreConflictResponse(httpStatus: number, errorStatus: unknown): boolean {
  if (typeof errorStatus === 'string' && errorStatus) return CONFLICT_STATUSES.has(errorStatus);
  return httpStatus === 404 || httpStatus === 409;
}

// The write lost to another write (or the document is gone): nothing was saved, and reading again may give a different answer.
export class FirestoreConflictError extends Error {
  firestoreStatus: string;
  detail: string;

  constructor(firestoreStatus: string, detail: string) {
    super('다른 저장과 겹쳐 저장하지 못했습니다. 다시 시도해 주세요.');
    this.name = 'FirestoreConflictError';
    this.firestoreStatus = firestoreStatus;
    this.detail = detail;
  }
}

export function isFirestoreConflictError(error: unknown): error is FirestoreConflictError {
  return error instanceof FirestoreConflictError || (error instanceof Error && error.name === 'FirestoreConflictError');
}
