import test from 'node:test';
import assert from 'node:assert/strict';
import { renderManual, validateManual } from '../scripts/manuals/layout.mjs';

const shot = (marks = [1]) => ({ path: '/x', marks: marks.map((n) => ({ n, target: `버튼${n}` })) });
const step = (n, extra = {}) => ({ n, title: `단계${n}`, text: '설명', ...extra });

const smallManual = () => ({
  id: 'office',
  title: '통합 매니저 사용 설명서',
  eyebrow: 'WEVE OFFICE · 직원용',
  coverNote: '안내',
  chapters: [
    {
      title: '시작하기',
      sections: [
        { id: 'a', title: '로그인', shot: shot(), steps: [step(1)] },
        { id: 'b', title: '화면 구성', shot: shot([1, 2]), steps: [step(1), step(2, { appendix: 'A-1' })] },
      ],
    },
  ],
  appendix: [{ id: 'A-1', title: '권한 표', blocks: [{ p: '내용' }] }],
});

const render = (manual) => renderManual(manual, { shots: {}, date: new Date(2026, 9, 23) });
const linkPairs = (links) => links.map(({ page, targetPage }) => `${page}->${targetPage}`).sort();

test('pages run cover, contents, one page per section, one page per appendix', () => {
  assert.deepEqual(render(smallManual()).pageIds, ['cover', 'toc-1', 'sec-a', 'sec-b', 'appx-A-1']);
});

test('contents, appendix references and back links are all expected links', () => {
  const { expectedLinks } = render(smallManual());
  assert.deepEqual(linkPairs(expectedLinks), [
    // contents: chapter line, two sections, the appendix heading and its entry
    '2->3', '2->3', '2->4', '2->5', '2->5',
    // [부록 A-1] on section b, and the appendix page back to section b
    '4->5', '5->4',
  ].sort());
});

test('the links are anchors in the html', () => {
  const { html } = render(smallManual());
  assert.match(html, /<a [^>]*href="#appx-A-1"[^>]*>\[부록 A-1\]<\/a>/);
  assert.match(html, /id="sec-b"/);
  assert.match(html, /<a [^>]*href="#sec-b"[^>]*>← 1-2 화면 구성 쪽으로 돌아가기<\/a>/);
});

test('a long contents list spills onto a second page and moves every page after it', () => {
  const manual = smallManual();
  manual.chapters[0].sections = Array.from({ length: 40 }, (_, index) => ({ id: `s${index}`, title: `절${index}`, shot: shot(), steps: [step(1)] }));
  manual.chapters[0].sections[0].steps = [step(1, { appendix: 'A-1' })];
  const { pageIds, expectedLinks } = render(manual);
  assert.deepEqual(pageIds.slice(0, 4), ['cover', 'toc-1', 'toc-2', 'sec-s0']);
  assert.equal(pageIds.at(-1), 'appx-A-1');
  assert.ok(expectedLinks.some((link) => link.page === 4 && link.targetPage === 44));
});

test('a continued section keeps the number of the one before and stays out of the contents', () => {
  const manual = smallManual();
  manual.chapters[0].sections.push({ id: 'b2', continues: true, title: '화면 구성', shot: shot(), steps: [step(1)] });
  const { html, pageIds, expectedLinks } = render(manual);
  assert.deepEqual(pageIds, ['cover', 'toc-1', 'sec-a', 'sec-b', 'sec-b2', 'appx-A-1']);
  assert.match(html, /1-2 화면 구성 \(이어서\)/);
  assert.ok(!expectedLinks.some((link) => link.page === 2 && link.targetPage === 5));
});

test('the cover carries the month the manual was made', () => {
  assert.match(render(smallManual()).html, /2026년 10월 화면 기준/);
});

test('validateManual refuses broken content', () => {
  const duplicate = smallManual();
  duplicate.chapters[0].sections[1].id = 'a';
  assert.throws(() => validateManual(duplicate), /a/);

  const unmatched = smallManual();
  unmatched.chapters[0].sections[0].steps = [step(1), step(2)];
  assert.throws(() => validateManual(unmatched), /a/);

  const unknownAppendix = smallManual();
  unknownAppendix.chapters[0].sections[0].steps = [step(1, { appendix: 'A-9' })];
  assert.throws(() => validateManual(unknownAppendix), /A-9/);

  const unreferenced = smallManual();
  unreferenced.appendix.push({ id: 'A-2', title: '안 쓰는 부록', blocks: [] });
  assert.throws(() => validateManual(unreferenced), /A-2/);

  assert.doesNotThrow(() => validateManual(smallManual()));
});
