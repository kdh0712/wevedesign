// Turns a manual's content (office-manual.mjs, estimate-manual.mjs) and its screenshots into print HTML: a cover, the
// contents, one A4 page per section and one per appendix entry (spec 2026-10-23 §2.2). It also returns every link it
// wrote as { page, targetPage }, which the builder compares with the links Chrome put into the PDF.

const TOC_LINES_PER_PAGE = 32;

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/** Throws with the reason when the content cannot make a correct manual. */
export function validateManual(manual) {
  const ids = new Set();
  const appendixIds = new Set((manual.appendix || []).map((entry) => entry.id));
  const referenced = new Set();
  for (const chapter of manual.chapters) {
    if (!chapter.sections.length) throw new Error(`장 '${chapter.title}'에 절이 없습니다.`);
    if (chapter.sections[0].continues) throw new Error(`장 '${chapter.title}'의 첫 절 '${chapter.sections[0].id}'은 이어지는 절일 수 없습니다.`);
    for (const section of chapter.sections) {
      if (ids.has(section.id)) throw new Error(`절 id '${section.id}'가 두 번 있습니다.`);
      ids.add(section.id);
      const stepNumbers = section.steps.map((step) => step.n).sort((a, b) => a - b).join(',');
      const markNumbers = (section.shot?.marks || []).map((mark) => mark.n).sort((a, b) => a - b).join(',');
      if (stepNumbers !== markNumbers) {
        throw new Error(`절 '${section.id}': 설명 번호(${stepNumbers})와 화면 번호(${markNumbers})가 다릅니다.`);
      }
      for (const step of section.steps) {
        if (!step.appendix) continue;
        if (!appendixIds.has(step.appendix)) throw new Error(`절 '${section.id}'이 없는 부록 '${step.appendix}'을 가리킵니다.`);
        referenced.add(step.appendix);
      }
    }
  }
  for (const id of appendixIds) {
    if (!referenced.has(id)) throw new Error(`부록 '${id}'을 가리키는 절이 없습니다(돌아가기 링크를 만들 수 없음).`);
  }
}

function planManual(manual) {
  const sections = [];
  manual.chapters.forEach((chapter, chapterIndex) => {
    let sectionNo = 0;
    for (const section of chapter.sections) {
      if (!section.continues) sectionNo += 1;
      sections.push({ ...section, chapter, chapterNo: chapterIndex + 1, number: `${chapterIndex + 1}-${sectionNo}` });
    }
  });
  const appendix = manual.appendix || [];

  const tocEntries = [];
  manual.chapters.forEach((chapter, chapterIndex) => {
    const own = sections.filter((section) => section.chapter === chapter);
    tocEntries.push({ kind: 'chapter', label: `${chapterIndex + 1}. ${chapter.title}`, target: `sec-${own[0].id}` });
    for (const section of own.filter((item) => !item.continues)) {
      tocEntries.push({ kind: 'section', label: `${section.number} ${section.title}`, adminOnly: section.adminOnly, target: `sec-${section.id}` });
    }
  });
  if (appendix.length) {
    tocEntries.push({ kind: 'appendix-heading', label: '부록', target: `appx-${appendix[0].id}` });
    for (const entry of appendix) tocEntries.push({ kind: 'appendix', label: `${entry.id} ${entry.title}`, target: `appx-${entry.id}` });
  }
  const tocPages = [];
  for (let index = 0; index < tocEntries.length; index += TOC_LINES_PER_PAGE) tocPages.push(tocEntries.slice(index, index + TOC_LINES_PER_PAGE));

  const pageIds = [
    'cover',
    ...tocPages.map((_, index) => `toc-${index + 1}`),
    ...sections.map((section) => `sec-${section.id}`),
    ...appendix.map((entry) => `appx-${entry.id}`),
  ];
  // Each appendix page links back to the first section that pointed at it.
  const backTarget = new Map();
  for (const section of sections) {
    for (const step of section.steps) if (step.appendix && !backTarget.has(step.appendix)) backTarget.set(step.appendix, section);
  }
  return { sections, appendix, tocPages, pageIds, backTarget };
}

const formatMonth = (date) => `${date.getFullYear()}년 ${date.getMonth() + 1}월 화면 기준`;

/**
 * @returns {{ html: string, pageIds: string[], expectedLinks: Array<{ page: number, targetPage: number }> }}
 */
export function renderManual(manual, { shots, date }) {
  validateManual(manual);
  const { sections, appendix, tocPages, pageIds, backTarget } = planManual(manual);
  const pageNo = (id) => pageIds.indexOf(id) + 1;
  const expectedLinks = [];
  let currentPage = '';
  const link = (targetId, inner, className = '') => {
    expectedLinks.push({ page: pageNo(currentPage), targetPage: pageNo(targetId) });
    return `<a${className ? ` class="${className}"` : ''} href="#${targetId}">${inner}</a>`;
  };
  const footer = (id) => `<div class="pno">${pageNo(id)}</div>`;
  const pages = [];

  currentPage = 'cover';
  pages.push(`<section class="page cover" id="cover">
  <div class="brand">WEVE DESIGN</div>
  <div class="eyebrow">${escapeHtml(manual.eyebrow)}</div>
  <h1>${escapeHtml(manual.title).replace(' 사용 설명서', '<br>사용 설명서')}</h1>
  <p class="lead">${escapeHtml(manual.lead || '')}</p>
  <div class="meta">${escapeHtml(formatMonth(date))}${manual.coverNote ? `<br>${escapeHtml(manual.coverNote)}` : ''}</div>
</section>`);

  tocPages.forEach((entries, index) => {
    currentPage = `toc-${index + 1}`;
    const rows = entries
      .map((entry) => {
        const label = `${escapeHtml(entry.label)}${entry.adminOnly ? ' <span class="admin">관리자 전용</span>' : ''}`;
        return `<li class="${entry.kind}">${link(entry.target, `<span class="label">${label}</span><span class="dots"></span><span class="num">${pageNo(entry.target)}</span>`)}</li>`;
      })
      .join('\n');
    pages.push(`<section class="page toc" id="${currentPage}">
  <div class="run"><span>${escapeHtml(manual.title)}</span><span>목차</span></div>
  ${index === 0 ? '<h2>목차</h2>' : ''}
  <ol>${rows}</ol>
  ${footer(currentPage)}
</section>`);
  });

  for (const section of sections) {
    currentPage = `sec-${section.id}`;
    const title = `${section.number} ${escapeHtml(section.title)}${section.continues ? ' (이어서)' : ''}`;
    const steps = [...section.steps]
      .sort((a, b) => a.n - b.n)
      .map(
        (step) => `<li><span class="n">${step.n}</span><div><b>${escapeHtml(step.title)}</b>${escapeHtml(step.text)}${
          step.appendix ? ` ${link(`appx-${step.appendix}`, `[부록 ${escapeHtml(step.appendix)}]`, 'ref')}` : ''
        }</div></li>`,
      )
      .join('\n');
    const image = shots[section.id] ? `<figure><img src="${shots[section.id]}" alt=""></figure>` : '<figure class="empty"></figure>';
    pages.push(`<section class="page body" id="${currentPage}">
  <div class="run"><span>${section.chapterNo}. ${escapeHtml(section.chapter.title)}</span><span>${title}</span></div>
  <h2>${title}${section.adminOnly ? ' <span class="admin">관리자 전용</span>' : ''}</h2>
  ${section.intro ? `<p class="intro">${escapeHtml(section.intro)}</p>` : ''}
  ${image}
  <ol class="steps">${steps}</ol>
  ${section.tip ? `<div class="tip">💡 ${escapeHtml(section.tip)}</div>` : ''}
  ${footer(currentPage)}
</section>`);
  }

  for (const entry of appendix) {
    currentPage = `appx-${entry.id}`;
    const back = backTarget.get(entry.id);
    const blocks = entry.blocks
      .map((block) => {
        if (block.h) return `<h3>${escapeHtml(block.h)}</h3>`;
        if (block.p) return `<p>${escapeHtml(block.p)}</p>`;
        if (block.list) return `<ul>${block.list.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
        if (block.table) {
          const head = block.table.head.map((cell) => `<th>${escapeHtml(cell)}</th>`).join('');
          const rows = block.table.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
          return `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
        }
        throw new Error(`부록 '${entry.id}'에 알 수 없는 블록이 있습니다.`);
      })
      .join('\n');
    pages.push(`<section class="page appx" id="${currentPage}">
  <div class="run"><span>부록</span><span>${escapeHtml(entry.id)}</span></div>
  <div class="label">부록 ${escapeHtml(entry.id)}</div>
  <h2>${escapeHtml(entry.title)}</h2>
  ${blocks}
  ${link(`sec-${back.id}`, `← ${back.number} ${escapeHtml(back.title)} 쪽으로 돌아가기`, 'back')}
  ${footer(currentPage)}
</section>`);
  }

  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${escapeHtml(manual.title)}</title>
<style>${STYLE}</style>
</head>
<body>
${pages.join('\n')}
</body>
</html>`;
  return { html, pageIds, expectedLinks };
}

// Colours follow the manager screens and the sample shown to the owner (side-session note manual-sample.html).
const STYLE = `
@page { size: A4; margin: 0; }
:root { --navy: #273541; --teal: #38a9bd; --ink: #171512; --gray: #60717d; --line: #d5dde2; --soft: #f7fafb; --mark: #e4572e; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { color: var(--ink); font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; font-size: 10pt; line-height: 1.6;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
a { color: inherit; text-decoration: none; }
.page { width: 210mm; height: 297mm; padding: 15mm 16mm 16mm; position: relative; overflow: hidden; display: flex; flex-direction: column;
  break-after: page; page-break-after: always; }
.page:last-child { break-after: auto; page-break-after: auto; }
.run { display: flex; justify-content: space-between; color: #9aa7b0; font-size: 8pt; border-bottom: 0.3mm solid #e6ebee; padding-bottom: 1.5mm; margin-bottom: 4mm; }
.pno { position: absolute; bottom: 7mm; left: 0; right: 0; text-align: center; color: #9aa7b0; font-size: 8pt; }
h2 { font-size: 15pt; margin: 0 0 3mm; }
.admin { display: inline-block; vertical-align: middle; margin-left: 2mm; background: var(--navy); color: #fff; font-size: 7.5pt; font-weight: 700; padding: 0.4mm 2mm; border-radius: 1mm; }

.cover { justify-content: center; background: linear-gradient(160deg, #fff 60%, #edf8fb); padding: 24mm 22mm; }
.cover .brand { position: absolute; top: 22mm; left: 22mm; font-weight: 800; letter-spacing: 0.12em; color: var(--navy); font-size: 12pt; }
.cover .eyebrow { color: var(--teal); font-weight: 700; letter-spacing: 0.25em; font-size: 10pt; }
.cover h1 { font-size: 32pt; line-height: 1.3; margin: 4mm 0 4mm; }
.cover .lead { color: var(--gray); font-size: 12pt; margin: 0; }
.cover .meta { position: absolute; bottom: 24mm; left: 22mm; color: var(--gray); font-size: 10pt; line-height: 1.8; }

.toc ol { list-style: none; margin: 0; padding: 0; }
.toc li a { display: flex; gap: 2mm; padding: 1.1mm 0; align-items: baseline; }
.toc .dots { flex: 1; border-bottom: 0.3mm dotted #b9c3ca; transform: translateY(-1mm); }
.toc .chapter { font-weight: 700; margin-top: 2.2mm; }
.toc .section a, .toc .appendix a { padding-left: 5mm; color: #3c4a53; }
.toc .appendix-heading { font-weight: 700; margin-top: 4mm; color: #a8401f; }
.toc .num { min-width: 7mm; text-align: right; }

.body .intro { margin: 0 0 3mm; color: #3c4a53; }
.body figure { margin: 0; border: 0.3mm solid var(--line); border-radius: 1.5mm; overflow: hidden; background: #f3f6f8; display: flex; justify-content: center; }
.body figure img { display: block; max-width: 100%; max-height: 150mm; object-fit: contain; }
.body figure.empty { height: 100mm; }
.steps { list-style: none; margin: 4mm 0 0; padding: 0; display: grid; gap: 2.2mm; }
.steps li { display: grid; grid-template-columns: 7mm 1fr; gap: 2mm; }
.steps .n { width: 5.6mm; height: 5.6mm; border-radius: 50%; background: var(--mark); color: #fff; font-weight: 800; font-size: 8.5pt; display: grid; place-items: center; margin-top: 0.4mm; }
.steps b { display: block; }
.ref { display: inline-block; background: #fdeee8; color: #a8401f; border: 0.3mm solid #f3c6b5; border-radius: 1mm; padding: 0 1.6mm; font-size: 8.5pt; font-weight: 700; }
.tip { margin-top: 3.5mm; background: var(--soft); border: 0.3mm solid var(--line); border-radius: 1.5mm; padding: 2.5mm 3.5mm; color: #3c4a53; }

.appx .label { color: #a8401f; font-size: 8.5pt; font-weight: 700; letter-spacing: 0.1em; }
.appx h3 { font-size: 11pt; margin: 4mm 0 1.5mm; }
.appx p { margin: 0 0 2mm; }
.appx ul { margin: 0 0 2mm; padding-left: 5mm; }
.appx table { width: 100%; border-collapse: collapse; margin: 1.5mm 0 3mm; font-size: 9pt; }
.appx th, .appx td { border: 0.3mm solid var(--line); padding: 1.3mm 2mm; text-align: left; vertical-align: top; }
.appx th { background: var(--soft); }
.appx .back { margin-top: auto; margin-bottom: 4mm; color: var(--teal); font-weight: 700; }
`;
