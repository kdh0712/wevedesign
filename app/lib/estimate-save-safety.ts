// Pure rules that keep estimate saves from losing data: the estimate-DB settings document (estimate categories,
// material links and order) and the check that an estimate version was not changed elsewhere since it was loaded.
// No imports, so node tests load this file directly; the route does the reading and writing.

export type MaterialSettings = {
  estimateCategories: string[];
  estimateItems: Record<string, string>;
  materialOrder: string[];
};

export type MaterialSettingsChange =
  | { ok: true; changed: boolean; settings: MaterialSettings }
  | { ok: false; status: number; error: string };

const cleanText = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();

export function normalizeMaterialSettings(settings: Partial<Record<keyof MaterialSettings, unknown>>): MaterialSettings {
  const estimateCategories = Array.isArray(settings.estimateCategories)
    ? Array.from(new Set(settings.estimateCategories.map((category) => cleanText(category)).filter(Boolean)))
    : [];
  const rawItems = settings.estimateItems && typeof settings.estimateItems === 'object' ? (settings.estimateItems as Record<string, unknown>) : {};
  const estimateItems = Object.fromEntries(
    Object.entries(rawItems)
      .map(([id, category]) => [id.trim(), cleanText(category)])
      .filter(([id, category]) => id && estimateCategories.includes(category)),
  );
  const materialOrder = Array.isArray(settings.materialOrder)
    ? Array.from(new Set(settings.materialOrder.map((id) => String(id || '').trim()).filter(Boolean)))
    : [];
  return { estimateCategories, estimateItems, materialOrder };
}

// The stored document keeps each list as a JSON string; a missing document (null) is an empty start.
export function decodeMaterialSettings(raw: unknown): MaterialSettings {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const parse = (value: unknown, fallback: unknown) => {
    if (typeof value !== 'string' || !value) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  };
  return normalizeMaterialSettings({
    estimateCategories: parse(record.estimateCategoriesJson, []),
    estimateItems: parse(record.estimateItemsJson, {}),
    materialOrder: parse(record.materialOrderJson, []),
  });
}

export function encodeMaterialSettingsFields(settings: MaterialSettings, updatedAt: string) {
  return {
    estimateCategoriesJson: JSON.stringify(settings.estimateCategories),
    estimateItemsJson: JSON.stringify(settings.estimateItems),
    materialOrderJson: JSON.stringify(settings.materialOrder),
    updatedAt,
  };
}

export function sameMaterialOrder(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

const changed = (current: MaterialSettings, next: Partial<MaterialSettings>): MaterialSettingsChange => {
  const settings = normalizeMaterialSettings({ ...current, ...next });
  return { ok: true, changed: JSON.stringify(settings) !== JSON.stringify(normalizeMaterialSettings(current)), settings };
};

const refuse = (error: string, status = 400): MaterialSettingsChange => ({ ok: false, status, error });

// Applies one settings action from the page to the settings just read from the server. Every action works on that
// fresh copy, so two people adding categories or links at once both keep their changes.
export function applyMaterialSettingsOp(current: MaterialSettings, body: Record<string, unknown>): MaterialSettingsChange {
  const op = String(body.op || '');
  const name = cleanText(body.name);

  if (op === 'addCategory') {
    if (!name) return refuse('추가할 견적 카테고리 이름을 입력해주세요.');
    if (current.estimateCategories.includes(name)) return refuse('이미 있는 견적 카테고리입니다.');
    return changed(current, { estimateCategories: [...current.estimateCategories, name] });
  }

  if (op === 'deleteCategory') {
    if (!current.estimateCategories.includes(name)) return refuse('삭제할 견적 카테고리를 찾지 못했습니다.');
    // Materials stay in the full DB; only their estimate-category link is removed (normalize drops the links).
    return changed(current, { estimateCategories: current.estimateCategories.filter((category) => category !== name) });
  }

  if (op === 'assign') {
    const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id || '').trim()).filter(Boolean) : [];
    const category = cleanText(body.category);
    if (!ids.length) return refuse('견적 DB에 넣을 품목을 선택해주세요.');
    if (category && !current.estimateCategories.includes(category)) return refuse('견적 카테고리를 먼저 추가해주세요.');
    const estimateItems = { ...current.estimateItems };
    ids.forEach((id) => {
      if (category) estimateItems[id] = category;
      else delete estimateItems[id];
    });
    return changed(current, { estimateItems });
  }

  if (op === 'assignMany') {
    // Bulk move from the full DB: each item names its own estimate category, created here if it does not exist yet.
    const raw = body.assignments && typeof body.assignments === 'object' ? (body.assignments as Record<string, unknown>) : {};
    const entries = Object.entries(raw)
      .map(([id, category]) => [id.trim(), cleanText(category)])
      .filter(([id, category]) => id && category);
    if (!entries.length) return refuse('견적 DB로 옮길 품목을 선택해주세요.');
    const estimateCategories = [...current.estimateCategories];
    entries.forEach(([, category]) => {
      if (!estimateCategories.includes(category)) estimateCategories.push(category);
    });
    return changed(current, { estimateCategories, estimateItems: { ...current.estimateItems, ...Object.fromEntries(entries) } });
  }

  if (op === 'reorder') {
    // The page sends the whole order it edited, so it must have started from the order stored now; otherwise a
    // reorder made elsewhere (or a page that failed to load the order) would be overwritten. Older pages send no base.
    if (Array.isArray(body.baseOrder)) {
      const baseOrder = normalizeMaterialSettings({ materialOrder: body.baseOrder }).materialOrder;
      if (!sameMaterialOrder(baseOrder, current.materialOrder)) {
        return refuse('다른 곳에서 자재 순서가 바뀌었습니다. 새로고침한 뒤 다시 순서를 바꿔 주세요.', 409);
      }
    }
    return changed(current, { materialOrder: Array.isArray(body.order) ? body.order.map((id) => String(id || '')) : [] });
  }

  return refuse('지원하지 않는 자재 DB 설정 작업입니다.');
}

// saveMaterial with an estimateCategory: links (or unlinks, with '') that one material. An unknown category leaves the
// settings as they are, like before.
export function linkMaterialToEstimateCategory(current: MaterialSettings, id: string, category: unknown): MaterialSettingsChange {
  const nextCategory = cleanText(category);
  if ((current.estimateItems[id] || '') === nextCategory) return { ok: true, changed: false, settings: current };
  if (nextCategory && !current.estimateCategories.includes(nextCategory)) return { ok: true, changed: false, settings: current };
  const estimateItems = { ...current.estimateItems };
  if (nextCategory) estimateItems[id] = nextCategory;
  else delete estimateItems[id];
  return changed(current, { estimateItems });
}

export function removeMaterialFromSettings(current: MaterialSettings, id: string): MaterialSettingsChange {
  if (!current.estimateItems[id] && !current.materialOrder.includes(id)) return { ok: true, changed: false, settings: current };
  const estimateItems = { ...current.estimateItems };
  delete estimateItems[id];
  return changed(current, { estimateItems, materialOrder: current.materialOrder.filter((item) => item !== id) });
}

// Read, change and write the settings, starting over from a fresh read when another save got in between, so two people
// changing categories or links at the same time both keep their changes. A failed read rejects before anything is
// written, so it can never be taken for empty settings. A refused or unchanged result writes nothing.
export async function changeMaterialSettingsSafely<V>(
  steps: {
    read: () => Promise<{ settings: MaterialSettings; version: V }>;
    write: (settings: MaterialSettings, version: V) => Promise<void>;
    isConflict: (error: unknown) => boolean;
    attempts?: number;
  },
  change: (settings: MaterialSettings) => MaterialSettingsChange,
): Promise<MaterialSettingsChange> {
  const attempts = Math.max(1, steps.attempts ?? 3);
  for (let attempt = 1; ; attempt += 1) {
    const { settings, version } = await steps.read();
    const result = change(settings);
    if (!result.ok || !result.changed) return result;
    try {
      await steps.write(result.settings, version);
      return result;
    } catch (error) {
      if (attempt >= attempts || !steps.isConflict(error)) throw error;
    }
  }
}

export type EstimateSaveConflict = '' | 'changed' | 'deleted';

// An existing version saves only if it is still what the editor loaded: its stored updatedAt must equal the one the
// page sent (baseUpdatedAt). A new version has nothing to compare. A page that sends no base (opened before this
// check shipped) is let through, as before.
export function estimateSaveConflict(
  stored: { updatedAt?: unknown } | null,
  request: { existingId: string; baseUpdatedAt?: unknown },
): EstimateSaveConflict {
  if (!request.existingId) return '';
  const baseUpdatedAt = typeof request.baseUpdatedAt === 'string' ? request.baseUpdatedAt.trim() : '';
  if (!baseUpdatedAt) return '';
  if (!stored) return 'deleted';
  return String(stored.updatedAt || '') === baseUpdatedAt ? '' : 'changed';
}

export function estimateSaveConflictMessage(conflict: EstimateSaveConflict) {
  if (conflict === 'deleted') return '이 견적 버전은 다른 곳에서 삭제되었습니다. 새 버전으로 저장해 주세요.';
  if (conflict === 'changed') return '다른 컴퓨터에서 이 견적 버전을 먼저 저장했습니다. 새 버전으로 저장하거나 다시 불러와 주세요.';
  return '';
}

// Lines the printed documents leave out (no 품명) while their amount still counts in the totals.
export function unnamedPricedLineCount(lines: Array<{ name?: string; quantity?: number; customerUnitPrice?: number }>) {
  return lines.filter((line) => !String(line.name || '').trim() && Number(line.quantity || 0) * Number(line.customerUnitPrice || 0) !== 0).length;
}

// Deleting an estimate line keeps the 실행 내역 rows made from it (their 지출/결제 are real records); they only lose the link.
export function unlinkWorkLinesFromLine<T extends { sourceLineId?: string }>(workLines: T[], lineId: string): T[] {
  return workLines.map((line) => (line.sourceLineId === lineId ? { ...line, sourceLineId: '' } : line));
}

export function linkedWorkLineCount(workLines: Array<{ sourceLineId?: string }>, lineId: string) {
  return workLines.filter((line) => line.sourceLineId === lineId).length;
}
