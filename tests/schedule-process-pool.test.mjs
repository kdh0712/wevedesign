import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConstructionPool, poolItemsLabel } from '../app/lib/schedule-process-pool.ts';

// 공정 작업 list by 공사 (spec docs/superpowers/specs/2026-11-26-schedule-bars-and-construction-pool-design.md §2).

const line = (category, process, name) => ({ category, process, name });

test('buildConstructionPool makes one card per 공사, in the estimate order, with its 공종 under it', () => {
  const pool = buildConstructionPool(
    [
      line('가구 공사', '주방', '상부장'),
      line('가구 공사', '주방', '하부장'),
      line('가구 공사', '신발장', '현관 신발장'),
      line('전기 공사', '조명', '다운라이트'),
    ],
    [],
  );
  assert.deepEqual(pool, [
    { name: '가구 공사', items: ['주방', '신발장'] },
    { name: '전기 공사', items: ['조명'] },
  ]);
});

test('a 공종 named like its 공사 shows the 품명 instead (spaces ignored)', () => {
  const pool = buildConstructionPool([line('철거 공사', '철거공사', '욕실 철거'), line('철거 공사', '철거 공사', '주방 철거'), line('철거 공사', '폐기물', '1톤 차량')], []);
  assert.deepEqual(pool, [{ name: '철거 공사', items: ['욕실 철거', '주방 철거', '폐기물'] }]);
});

test('실행 내역서 lines join their 분류, else the 공사 of the same 공종, else 기타 (last)', () => {
  const pool = buildConstructionPool(
    [line('목 공사', '몰딩', '마이너스 몰딩'), line('', '', '')],
    [line('', '기타비용', '식대'), line('', '몰딩', '몰딩 추가'), line('설비 공사', '배관', '수도 배관'), line('목 공사', '목자재', '자재 입고')],
  );
  assert.deepEqual(pool, [
    { name: '목 공사', items: ['몰딩', '목자재'] },
    { name: '설비 공사', items: ['배관'] },
    { name: '기타', items: ['기타비용'] },
  ]);
});

test('a 공사 whose lines have no 공종 or 품명 still gets its card; blank lines are skipped', () => {
  assert.deepEqual(buildConstructionPool([line('도배 공사', '', ''), line(' ', ' ', ' ')], []), [{ name: '도배 공사', items: [] }]);
});

test('poolItemsLabel shows up to six, then five and 외 N개', () => {
  assert.equal(poolItemsLabel([]), '');
  assert.equal(poolItemsLabel(['a', 'b', 'c', 'd', 'e', 'f']), 'a · b · c · d · e · f');
  assert.equal(poolItemsLabel(['a', 'b', 'c', 'd', 'e', 'f', 'g']), 'a · b · c · d · e 외 2개');
});

test('a 실행 line whose 공종 is a 공사 name joins that 공사 (review finding: it went to 기타)', () => {
  const pool = buildConstructionPool([line('도배 공사', '', '실크 벽지')], [line('', '도배 공사', '도배 추가'), line('', ' 도배공사 ', '')]);
  assert.deepEqual(pool, [{ name: '도배 공사', items: ['실크 벽지', '도배 추가'] }]);
});
