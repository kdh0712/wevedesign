// A write that lands only on the copy it was prepared from (a Firestore updateTime precondition), read again when it
// loses to another write. conflictOf decides from each fresh read whether the save may go ahead at all (the estimate
// save: the version itself was not saved elsewhere since the editor loaded it); prepare builds what to write from that
// same read (it puts back phone lines). A phone line landing between read and write is then merged on the next round
// instead of showing the office a save conflict (spec docs/superpowers/specs/2026-11-24-phone-work-lines-design.md).
// Pure and import-free so Node tests can drive it with fakes.

export async function saveIfUnchanged<S, R, C extends string>(options: {
  read: () => Promise<{ stored: S | null; version: string | null }>;
  write: (record: R, version: string | null) => Promise<void>;
  conflictOf: (stored: S | null) => C | '';
  prepare: (stored: S | null) => R;
  isConflict: (error: unknown) => boolean;
  attempts?: number;
}): Promise<{ conflict: C | 'changed' | ''; written: R | null }> {
  const attempts = Math.max(1, options.attempts ?? 3);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const { stored, version } = await options.read();
    const conflict = options.conflictOf(stored);
    if (conflict) return { conflict, written: null };
    const record = options.prepare(stored);
    try {
      await options.write(record, version);
      return { conflict: '', written: record };
    } catch (error) {
      if (!options.isConflict(error)) throw error;
    }
  }
  return { conflict: 'changed', written: null };
}
