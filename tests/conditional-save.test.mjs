import test from 'node:test';
import assert from 'node:assert/strict';
import { saveIfUnchanged } from '../app/lib/conditional-save.ts';

// The estimate save writes only onto the copy it read. A phone line landing in between makes that write fail; the save
// reads again and, when the office version itself is unchanged, saves with the phone line merged in
// (spec 2026-11-24-phone-work-lines).

class Conflict extends Error {}
const isConflict = (error) => error instanceof Conflict;

function store(states, failWrites = 0) {
  let reads = 0;
  let failures = failWrites;
  const writes = [];
  return {
    writes,
    read: async () => states[Math.min(reads++, states.length - 1)],
    write: async (record, version) => {
      if (failures > 0) {
        failures -= 1;
        throw new Conflict('precondition failed');
      }
      writes.push({ record, version });
    },
  };
}

test('saveIfUnchanged: a write that loses to a phone line is read again and saved with it', async () => {
  const s = store([
    { stored: { updatedAt: 'A', lines: ['office'] }, version: 'v1' },
    { stored: { updatedAt: 'A', lines: ['office', 'phone'] }, version: 'v2' },
  ], 1);
  const result = await saveIfUnchanged({
    read: s.read,
    write: s.write,
    conflictOf: (stored) => (stored && stored.updatedAt !== 'A' ? 'changed' : ''),
    prepare: (stored) => ({ lines: ['mine', ...stored.lines.filter((line) => line === 'phone')] }),
    isConflict,
  });
  assert.equal(result.conflict, '');
  assert.deepEqual(result.written, { lines: ['mine', 'phone'] });
  assert.deepEqual(s.writes, [{ record: { lines: ['mine', 'phone'] }, version: 'v2' }]);
});

test('saveIfUnchanged: a real save elsewhere (updatedAt moved) is still reported, nothing written', async () => {
  const s = store([
    { stored: { updatedAt: 'A' }, version: 'v1' },
    { stored: { updatedAt: 'B' }, version: 'v2' },
  ], 1);
  const result = await saveIfUnchanged({
    read: s.read,
    write: s.write,
    conflictOf: (stored) => (stored && stored.updatedAt !== 'A' ? 'changed' : ''),
    prepare: () => ({ x: 1 }),
    isConflict,
  });
  assert.equal(result.conflict, 'changed');
  assert.equal(result.written, null);
  assert.deepEqual(s.writes, []);
});

test('saveIfUnchanged: gives up as changed after the attempts, and other errors are thrown', async () => {
  const s = store([{ stored: null, version: null }], 5);
  const result = await saveIfUnchanged({ read: s.read, write: s.write, conflictOf: () => '', prepare: () => ({}), isConflict, attempts: 3 });
  assert.deepEqual(result, { conflict: 'changed', written: null });

  await assert.rejects(
    saveIfUnchanged({
      read: async () => ({ stored: null, version: null }),
      write: async () => {
        throw new Error('network');
      },
      conflictOf: () => '',
      prepare: () => ({}),
      isConflict,
    }),
    /network/,
  );
});
