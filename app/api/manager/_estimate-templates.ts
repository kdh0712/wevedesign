import { randomBytes } from 'node:crypto';
import {
  normalizeBaseArea,
  normalizeTemplateLines,
  templateBaseAreaError,
  templateCustomerTotal,
  templateLinesError,
  templateNameError,
  type TemplateLine,
} from '../../lib/estimate-templates';
import {
  deleteFirestoreDocument,
  getFirestoreDocumentWithVersion,
  listFirestoreCollection,
  patchFirestoreFields,
} from './firestore';

// 견적 템플릿 in Firestore (spec docs/superpowers/specs/2026-10-22-estimate-templates-design.md §3.1). Read and written
// with the server service account only (no idToken), like 현장 기록; templates never mix with sites or estimates.

export const ESTIMATE_TEMPLATES_COLLECTION = 'estimateTemplates';

export type EstimateTemplateSummary = {
  id: string;
  name: string;
  lineCount: number;
  customerTotal: number;
  // 기준 평형 (spec 2026-10-23 §4), null when not set.
  baseArea: number | null;
  updatedAt: string;
  updatedBy: string;
};
export type EstimateTemplate = EstimateTemplateSummary & { lines: TemplateLine[]; updateTime: string };

// A request the rules turn down (name, size, missing version); the message is shown to the user as it is.
export class EstimateTemplateInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EstimateTemplateInputError';
  }
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const count = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);

function toSummary(record: Record<string, unknown>): EstimateTemplateSummary {
  return {
    id: text(record._id),
    name: text(record.name),
    lineCount: count(record.lineCount),
    customerTotal: count(record.customerTotal),
    baseArea: normalizeBaseArea(record.baseArea),
    updatedAt: text(record.updatedAt),
    updatedBy: text(record.updatedBy),
  };
}

export async function listEstimateTemplates(): Promise<EstimateTemplateSummary[]> {
  const records = await listFirestoreCollection<Record<string, unknown>>(ESTIMATE_TEMPLATES_COLLECTION, undefined, 1000, [
    'name',
    'lineCount',
    'customerTotal',
    'baseArea',
    'updatedAt',
    'updatedBy',
  ]);
  return records.map(toSummary).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export async function readEstimateTemplate(id: string): Promise<EstimateTemplate | null> {
  const read = await getFirestoreDocumentWithVersion<Record<string, unknown>>(ESTIMATE_TEMPLATES_COLLECTION, id);
  if (!read) return null;
  return { ...toSummary(read.record), id, lines: normalizeTemplateLines(read.record.linesJson), updateTime: read.updateTime };
}

// A new template is written only if its id is unused; an existing one only if it is still the version that was read
// (baseUpdateTime). Either failure throws FirestoreConflictError and writes nothing.
export async function saveEstimateTemplate(input: {
  id?: string;
  name: string;
  lines: unknown;
  baseUpdateTime?: string;
  baseArea?: unknown;
  by: string;
}): Promise<EstimateTemplate> {
  const id = text(input.id).trim();
  const name = text(input.name).trim();
  const rawLines = Array.isArray(input.lines) ? input.lines : [];
  const sizeError = templateLinesError(rawLines);
  if (sizeError) throw new EstimateTemplateInputError(sizeError);
  if (id && !text(input.baseUpdateTime)) throw new EstimateTemplateInputError('템플릿을 다시 열어 주세요.');
  const areaError = templateBaseAreaError(input.baseArea);
  if (areaError) throw new EstimateTemplateInputError(areaError);

  const others = (await listEstimateTemplates()).filter((template) => template.id !== id).map((template) => template.name);
  const nameError = templateNameError(name, others);
  if (nameError) throw new EstimateTemplateInputError(nameError);

  const lines = normalizeTemplateLines(rawLines);
  const now = new Date().toISOString();
  const by = text(input.by);
  const fields: Record<string, unknown> = {
    name,
    linesJson: JSON.stringify(lines),
    lineCount: lines.length,
    customerTotal: templateCustomerTotal(lines),
    baseArea: normalizeBaseArea(input.baseArea),
    updatedAt: now,
    updatedBy: by,
    ...(id ? {} : { createdAt: now, createdBy: by }),
  };
  const targetId = id || randomBytes(12).toString('hex');
  await patchFirestoreFields(ESTIMATE_TEMPLATES_COLLECTION, targetId, fields, {
    precondition: id ? { updateTime: text(input.baseUpdateTime) } : { exists: false },
  });
  const saved = await readEstimateTemplate(targetId);
  if (!saved) throw new Error('저장한 템플릿을 다시 읽지 못했습니다.');
  return saved;
}

export async function deleteEstimateTemplate(id: string): Promise<void> {
  await deleteFirestoreDocument(ESTIMATE_TEMPLATES_COLLECTION, id);
}
