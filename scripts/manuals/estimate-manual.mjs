// 견적 작업 사용 설명서의 내용 (spec 2026-10-23 §3.2). Same shape as office-manual.mjs; see build-manuals.mjs for targets.

const ESTIMATE = '/manager-weve-7519/estimate?siteId=site-1';
const WIDE = 1600; // 견적서 shows the DB panel, the table and the preview side by side only from 1536px.

const tab = (label) => ({ click: { text: label, within: { selector: 'nav.no-print' } } });
const lineMenu = (lineId) => ({ selector: `[data-menu-owner="${lineId}"]` });
const templateMenu = (item) => [{ click: { selector: 'button[aria-haspopup="menu"]', nth: 0 } }, { click: { text: item, within: { selector: '[role="menu"]' } } }];
const dialog = (titleId) => ({ selector: `[aria-labelledby="${titleId}"]` });

export default {
  id: 'estimate',
  title: '견적 작업 사용 설명서',
  eyebrow: 'WEVE ESTIMATE · 직원용',
  lead: '견적서, 실행 내역서, 공정 일정, 발주서, 서류 출력을 화면별로 따라 해 보세요.',
  coverNote: "통합 매니저의 다른 메뉴는 '통합 매니저 사용 설명서'를 받아 주세요.",
  ready: { selector: 'select[aria-label="견적 버전 구분"]' },
  hide: [],
  chapters: [
    {
      title: '시작하기',
      sections: [
        {
          id: 'open',
          title: '견적 페이지 열기와 화면 구성',
          shot: {
            path: ESTIMATE,
            width: WIDE,
            marks: [
              { n: 1, target: '관리자 현장 목록으로' },
              { n: 2, target: { text: '사용 설명서', within: { selector: 'header' } } },
              { n: 3, target: { selector: 'header select' }, box: true },
              { n: 4, target: { text: '저장', within: { selector: 'header' } }, place: 'tr' },
              { n: 5, target: { selector: 'nav.no-print' }, box: true },
            ],
          },
          steps: [
            { n: 1, title: '관리자 현장 목록으로', text: "통합 매니저로 돌아갑니다. 견적 페이지는 통합 매니저의 '견적 작업'이나 업무 현황의 '견적 작업' 버튼으로 엽니다." },
            { n: 2, title: '사용 설명서', text: '이 설명서를 PDF로 내려받습니다.' },
            { n: 3, title: '현장 선택', text: '견적을 쓸 현장을 고릅니다. 저장하지 않은 변경이 있으면 먼저 저장할지 묻습니다.' },
            { n: 4, title: '저장', text: '지금 버전의 견적서, 실행 내역서, 공정 일정, 발주서, 추가 사항을 한 번에 저장합니다.' },
            { n: 5, title: '탭', text: '견적서, 실행 내역서, 자재 / 견적 단가, 공정 일정, 발주서, 추가 사항, 서류 출력으로 나뉩니다.' },
          ],
          tip: '견적 작업은 견적 권한이 있는 계정만 열 수 있습니다.',
        },
        {
          id: 'versions',
          title: '견적 버전',
          shot: {
            path: ESTIMATE,
            width: WIDE,
            actions: [{ click: '버전 추가' }],
            clip: { text: 'SITE', closest: 'section' },
            marks: [
              { n: 1, target: { selector: 'select[aria-label="견적 버전 구분"]' }, box: true },
              { n: 2, target: { selector: 'input[aria-label="견적 버전명"]' }, box: true },
              { n: 3, target: { contains: '현재 버전', closest: 'label' }, place: 'left' },
              { n: 4, target: '버전 추가' },
              { n: 5, target: '현재 버전 복사' },
              { n: 6, target: { text: '견적 금액', nth: 0 }, place: 'left' },
            ],
          },
          steps: [
            { n: 1, title: '버전 구분', text: '초안, 수정안, 최종안, 변경견적 중에서 고릅니다.', appendix: 'B-1' },
            { n: 2, title: '버전명 · 수정 기록 메모', text: '버전 이름과, 다른 컴퓨터에서 이어서 볼 작업 메모입니다.' },
            { n: 3, title: '현재 버전', text: '이 현장에 저장된 버전 중에서 고릅니다. 처음 열면 가장 최근에 고친 버전이 열립니다.' },
            { n: 4, title: '버전 추가 · 버전 삭제', text: '새 버전을 만드는 칸을 엽니다. 버전 삭제는 되돌릴 수 없습니다.' },
            { n: 5, title: '현재 버전 복사 · 빈 버전으로 시작', text: '지금 버전을 그대로 복사하거나 빈 견적으로 새 버전을 시작합니다. 저장해야 버전 목록에 생깁니다.' },
            { n: 6, title: '금액 카드', text: '견적 금액, 예상 마진, 견적 예상원가, 실제 마진(실행 내역서 기준)입니다.' },
          ],
        },
        {
          id: 'save',
          title: '저장과 저장 안 된 변경',
          shot: {
            path: ESTIMATE,
            width: WIDE,
            actions: [{ setValue: { target: { selector: 'input[aria-label="견적 버전명"]' }, value: '계약 견적 (욕실 변경)' } }],
            clip: { selector: 'header > div > div:nth-child(2)' },
            clipPad: 24,
            marks: [
              { n: 1, target: '저장 안 된 변경 있음' },
              { n: 2, target: { text: '저장', within: { selector: 'header' } }, box: true },
            ],
          },
          steps: [
            { n: 1, title: '저장 안 된 변경 있음', text: '고친 내용이 아직 저장되지 않았다는 표시입니다. 이 상태에서 현장이나 버전을 바꾸거나 페이지를 떠나면 먼저 저장할지 묻습니다.', appendix: 'B-1' },
            { n: 2, title: '저장', text: '누르면 위 표시가 사라집니다. 다른 컴퓨터에서 같은 버전을 먼저 저장했다면 덮어쓰지 않고, 새 버전으로 저장하거나 최신 내용을 불러오도록 묻습니다.' },
          ],
          tip: '세션이 끝나면 다시 로그인 창이 뜹니다. 고치던 내용은 화면에 그대로 남아 있으니 로그인한 뒤 저장하세요.',
        },
      ],
    },
    {
      title: '견적서',
      sections: [
        {
          id: 'lines',
          title: '공사별 견적 표',
          shot: {
            path: ESTIMATE,
            width: WIDE,
            height: 1000,
            actions: [{ scrollTo: { text: '견적서', closest: 'h2' } }, { run: 'window.scrollBy(0, -90)' }, { click: { selector: 'button[aria-haspopup="menu"]', nth: 0 } }],
            marks: [
              { n: 1, target: { text: '견적 단가 DB', closest: 'h2' }, place: 'left' },
              { n: 2, target: { text: '＋ DB에서 추가', nth: 0 } },
              { n: 3, target: { selector: '[role="menu"]' }, box: true, place: 'tr' },
              { n: 4, target: { selector: 'select[aria-label="공간 보기"]' } },
              { n: 5, target: { selector: '[aria-label="철거 공사 메뉴"]' }, place: 'tr' },
              { n: 6, target: { text: '세부내역서 미리보기' }, place: 'left' },
            ],
          },
          steps: [
            { n: 1, title: '견적 단가 DB', text: "검색해서 '선택 행 적용'(고른 줄에 넣기)이나 '새 행 추가'로 견적서에 넣습니다. 'DB 패널' 버튼으로 숨길 수 있습니다." },
            { n: 2, title: 'DB에서 추가', text: '분류 → 공종 → 품명 순서로 골라 새 줄을 넣습니다. 공사 이름 옆의 같은 버튼은 그 공사에 넣습니다.' },
            { n: 3, title: '템플릿 ▾', text: '템플릿 불러오기, 이 견적을 템플릿으로 저장, 템플릿 관리가 있습니다.' },
            { n: 4, title: '공간 보기', text: '거실, 욕실처럼 한 공간의 줄만 봅니다. 이때는 줄 순서를 바꿀 수 없습니다.' },
            { n: 5, title: '⋯ 메뉴', text: '공사 이름 옆 ⋯는 빈 줄 추가, 이름 바꾸기, 공사 복사, 위·아래로 옮기기, 공사 삭제입니다. 줄마다 맨 오른쪽에도 ⋯ 줄 메뉴가 있습니다(다음 쪽).' },
            { n: 6, title: '세부내역서 미리보기', text: '고객에게 나갈 세부내역서 모양을 바로 봅니다. 실행 금액 보기, 크게 보기가 있습니다.' },
          ],
          tip: '줄은 분류(없으면 공종)가 같은 것끼리 공사로 묶입니다. 기본견적 공사는 항상 맨 위에 있습니다. 공사 이름을 두 번 누르면 이름을 바꿉니다.',
        },
        {
          id: 'line-menu',
          title: '줄 메뉴',
          shot: {
            path: ESTIMATE,
            width: WIDE,
            actions: [{ scrollTo: lineMenu('l3') }, { run: 'window.scrollBy(0, -200)' }, { click: { selector: '[aria-label="줄 메뉴"]', within: lineMenu('l3') } }],
            marks: [
              { n: 1, target: { text: '복제', within: lineMenu('l3') }, place: 'left' },
              { n: 2, target: { contains: '다른 공사로 옮기기', within: lineMenu('l3') }, place: 'left' },
              { n: 3, target: { text: '위로 옮기기', within: lineMenu('l3') }, place: 'left' },
              { n: 4, target: { text: 'DB에 저장', within: lineMenu('l3') }, place: 'left' },
              { n: 5, target: { text: '삭제', within: lineMenu('l3') }, place: 'left' },
            ],
          },
          steps: [
            { n: 1, title: '복제', text: '같은 줄을 바로 아래에 하나 더 만듭니다.' },
            { n: 2, title: '다른 공사로 옮기기', text: '고른 공사의 맨 끝으로 옮깁니다. 줄을 끌어서는 같은 공사 안에서만 옮길 수 있습니다.' },
            { n: 3, title: '위로 · 아래로 옮기기', text: '같은 공사 안에서 한 칸씩 옮깁니다. 줄 왼쪽 ⋮⋮ 손잡이를 끌어도 됩니다.' },
            { n: 4, title: 'DB에 저장', text: '이 줄을 자재 DB에 품목으로 저장합니다(견적 카테고리를 고르면 견적 DB에도 들어감).' },
            { n: 5, title: '삭제', text: '한 번 더 묻고 지웁니다. 이 줄로 만든 실행 내역은 지우지 않고 그대로 둡니다.' },
          ],
        },
        {
          id: 'picker',
          title: '자재 DB에서 고르기',
          shot: {
            path: ESTIMATE,
            width: WIDE,
            actions: [{ click: { text: '＋ DB에서 추가', nth: 0 } }, { click: { contains: '욕실 공사', closest: 'button', nth: -1 } }, { click: { contains: '타일', closest: 'button', nth: -1 } }],
            marks: [
              { n: 1, target: { contains: '견적 DB', closest: 'button', nth: -1 } },
              { n: 2, target: { contains: '3 품명', closest: 'button' } },
              { n: 3, target: { contains: '공통 항목 4개' } },
              { n: 4, target: { text: 'DB 수정', nth: 0 } },
            ],
          },
          steps: [
            { n: 1, title: '견적 DB / 전체 DB', text: '견적 DB는 견적용으로 고른 품목만, 전체 DB는 엑셀로 올린 모든 자재입니다.' },
            { n: 2, title: '분류 → 공종 → 품명', text: '분류를 고르면 공종으로, 공종을 고르면 품명 목록으로 넘어갑니다. 품명을 누르면 견적서에 들어가고 견적단가·실행단가는 DB 단가로 채워집니다.' },
            { n: 3, title: '공통 항목', text: "품명이 '공통'인 품목은 미리 적어 둔 이름(거실 욕실, 안방 욕실 …) 중에서 고르거나 여러 개를 한 번에 넣습니다." },
            { n: 4, title: 'DB 수정', text: '자재 DB의 품목 정보와 단가를 바로 고칩니다.' },
          ],
        },
        {
          id: 'common-bulk',
          title: '공통 항목 한번에 추가',
          shot: {
            path: ESTIMATE,
            width: WIDE,
            actions: [
              { click: { text: '＋ DB에서 추가', nth: 0 } },
              { click: { contains: '욕실 공사', closest: 'button', nth: -1 } },
              { click: { contains: '타일', closest: 'button', nth: -1 } },
              { click: { contains: '공통 항목 4개', closest: 'button' } },
              { click: { text: '거실 욕실', closest: 'label' } },
              { click: { text: '안방 욕실', closest: 'label' } },
              { click: { contains: '선택 완료', closest: 'button' } },
            ],
            clip: dialog('common-bulk-add-title'),
            marks: [
              { n: 1, target: { text: '모든 항목에 똑같이 들어가는 값' }, place: 'left' },
              { n: 2, target: { selector: 'input[aria-label="1번째 수량"]' }, box: true },
              { n: 3, target: { contains: '개 항목 추가', closest: 'button' } },
            ],
          },
          steps: [
            { n: 1, title: '모든 항목에 똑같이', text: '규격과 단위는 모든 줄에 같이 들어갑니다.' },
            { n: 2, title: '항목마다', text: '공간, 품명, 수량, 견적단가, 실행단가, 비고를 줄마다 고칩니다. 필요 없는 줄은 빼기로 지웁니다.' },
            { n: 3, title: '항목 추가', text: '고른 항목이 견적서에 한 번에 들어갑니다.' },
          ],
        },
        {
          id: 'template-load',
          title: '템플릿 불러오기',
          shot: {
            path: ESTIMATE,
            width: WIDE,
            height: 1000,
            actions: [
              ...templateMenu('템플릿 불러오기'),
              { click: { contains: '30평형 풀공사', closest: 'button' }, wait: 800 },
              { click: { contains: '평형에 맞춰 수량 조정', closest: 'label' } },
              { setValue: { target: { selector: 'input[aria-label="이 현장 평형"]' }, value: '32' } },
            ],
            clip: dialog('template-load-title'),
            marks: [
              { n: 1, target: { text: '카테고리', closest: 'legend' }, place: 'left' },
              { n: 2, target: { text: '공간', closest: 'legend' }, place: 'left' },
              { n: 3, target: { contains: '평형에 맞춰 수량 조정', closest: 'label' }, place: 'left' },
              { n: 4, target: { contains: '불러올 항목' }, place: 'left' },
              { n: 5, target: { text: '불러오기', closest: 'button' } },
            ],
          },
          steps: [
            { n: 1, title: '카테고리', text: '불러올 공사를 체크합니다. 처음에는 모두 켜져 있습니다.' },
            { n: 2, title: '공간', text: '불러올 공간을 체크합니다. 카테고리와 공간이 둘 다 켜진 줄만 들어옵니다.' },
            { n: 3, title: '평형에 맞춰 수량 조정', text: '켜면 기준 평형과 이 현장 평형의 비율로 면적 단위 수량을 바꿉니다.', appendix: 'B-3' },
            { n: 4, title: '미리 보는 합계', text: '불러올 항목 수와 최신 DB 단가로 계산한 고객 합계, 단가가 바뀐 항목과 DB에서 못 찾은 항목 수입니다.', appendix: 'B-2' },
            { n: 5, title: '불러오기', text: '견적서에 넣습니다. 이미 항목이 있으면 바꿀지 뒤에 덧붙일지 묻습니다. 넣은 뒤 저장해야 견적에 남습니다.' },
          ],
        },
        {
          id: 'template-save',
          title: '이 견적을 템플릿으로 저장',
          shot: {
            path: ESTIMATE,
            width: WIDE,
            actions: templateMenu('이 견적을 템플릿으로 저장'),
            clip: dialog('save-as-template-title'),
            marks: [
              { n: 1, target: { text: '저장할 공사', closest: 'legend' }, place: 'left' },
              { n: 2, target: { text: '새 템플릿', closest: 'button' } },
              { n: 3, target: { text: '기존 템플릿에 덮어쓰기', closest: 'button' } },
              { n: 4, target: { contains: '템플릿 이름', closest: 'label' }, place: 'left' },
              { n: 5, target: { text: '새 템플릿으로 저장', closest: 'button' } },
            ],
          },
          steps: [
            { n: 1, title: '저장할 공사', text: '템플릿에 담을 공사를 체크합니다. 기본견적 공사는 처음에 꺼져 있습니다.' },
            { n: 2, title: '새 템플릿', text: '새 이름으로 템플릿을 만듭니다.' },
            { n: 3, title: '기존 템플릿에 덮어쓰기', text: '고른 템플릿의 항목을 이 견적으로 바꿉니다. 한 번 더 눌러야 저장됩니다.' },
            { n: 4, title: '템플릿 이름 · 기준 평형', text: '이름은 60자까지, 다른 템플릿과 겹치지 않게 씁니다. 기준 평형은 나중에 수량 조정에 쓰입니다.' },
            { n: 5, title: '저장', text: '현장 견적은 바뀌지 않고 템플릿만 저장됩니다.' },
          ],
        },
        {
          id: 'template-manager',
          title: '템플릿 관리',
          shot: {
            path: ESTIMATE,
            width: WIDE,
            actions: templateMenu('템플릿 관리'),
            clip: dialog('template-manager-title'),
            marks: [
              { n: 1, target: { text: '새로 만들기', closest: 'button' } },
              { n: 2, target: { text: '30평형 풀공사', nth: 0 }, place: 'left' },
              { n: 3, target: { text: '복사', nth: 0, within: dialog('template-manager-title') } },
              { n: 4, target: { text: '이름 바꾸기', nth: 0, within: dialog('template-manager-title') } },
              { n: 5, target: { text: '삭제', nth: 0, within: dialog('template-manager-title') }, place: 'tr' },
            ],
          },
          steps: [
            { n: 1, title: '새로 만들기', text: '현장과 상관없이 평형별 견적을 만듭니다. 기존 견적에서 복사해 시작할 수도 있습니다.' },
            { n: 2, title: '템플릿', text: '항목 수, 고객 합계, 기준 평형, 마지막으로 고친 날과 사람이 보입니다. 누르면 고치는 화면이 열립니다.' },
            { n: 3, title: '복사', text: "'… 복사'라는 이름으로 복사본을 엽니다. 저장해야 템플릿으로 생깁니다." },
            { n: 4, title: '이름 바꾸기', text: '템플릿 이름만 바꿉니다.' },
            { n: 5, title: '삭제', text: '한 번 더 묻고 지웁니다. 되돌릴 수 없습니다.' },
          ],
          tip: '다른 사람이 먼저 같은 템플릿을 저장했으면 덮어쓰지 않고 알려 줍니다.',
        },
      ],
    },
    {
      title: '실행 내역서',
      sections: [
        {
          id: 'work',
          title: '실행 내역서',
          shot: {
            path: ESTIMATE,
            width: WIDE,
            actions: [tab('실행 내역서')],
            marks: [
              { n: 1, target: '견적 공종 반영' },
              { n: 2, target: { text: '지출 합계' }, place: 'left' },
              { n: 3, target: { text: '실행 항목 입력', closest: 'h3' }, place: 'left' },
              { n: 4, target: { text: '항목 추가', closest: 'button' } },
              { n: 5, target: '엑셀 내보내기', place: 'tr' },
            ],
          },
          steps: [
            { n: 1, title: '견적 공종 반영', text: '견적서 줄 중 아직 실행 내역에 없는 것을 실행 항목으로 넣습니다.' },
            { n: 2, title: '합계', text: '수입, 지출, 결제 합계와 실제 마진입니다. 지출은 실제 마진 계산에 들어갑니다.' },
            { n: 3, title: '실행 항목 입력', text: '날짜(오늘이 기본), 공종, 수입, 지출, 결제, 비고를 넣습니다. 표의 줄을 두 번 누르면 이 칸에서 고칩니다.' },
            { n: 4, title: '항목 추가', text: '표에 넣습니다. 저장을 눌러야 남습니다.' },
            { n: 5, title: '엑셀', text: '엑셀로 내보내거나, 예전 엑셀 실행 내역서를 불러와 과거 실행 내역서 확인에서 봅니다.' },
          ],
        },
      ],
    },
    {
      title: '자재 / 견적 단가',
      sections: [
        {
          id: 'materials',
          title: '자재 DB와 견적 DB',
          shot: {
            path: ESTIMATE,
            width: WIDE,
            height: 1300,
            actions: [tab('자재 / 견적 단가'), { scrollTo: { text: '단가 업로드·수정', closest: 'h2' } }, { run: 'window.scrollBy(0, -120)' }],
            marks: [
              { n: 1, target: { text: '단가 업로드·수정', closest: 'h2' }, place: 'left' },
              { n: 2, target: '자재 단가 반영' },
              { n: 3, target: { text: '단가 저장', closest: 'button' } },
              { n: 4, target: { contains: '전체 데이터베이스', closest: 'button' } },
              { n: 5, target: { text: '견적 카테고리', nth: 0 }, place: 'left' },
              { n: 6, target: { text: '전체 DB → 견적 DB 한번에 옮기기', closest: 'button' } },
            ],
          },
          steps: [
            { n: 1, title: '단가 업로드', text: '자재단가 엑셀을 고르고 반영하면 시트마다 공정으로 읽어 품명·규격·단위·단가를 저장합니다.' },
            { n: 2, title: '자재 단가 반영', text: '고른 엑셀을 자재 DB에 넣습니다.' },
            { n: 3, title: '새 단가 입력 · 수정', text: '품목을 하나씩 넣거나 목록의 수정으로 고칩니다. 견적 카테고리를 고르면 견적 DB에도 들어갑니다.' },
            { n: 4, title: '전체 / 견적 데이터베이스', text: '전체 DB는 모든 자재, 견적 DB는 견적서에서 고를 품목입니다. 같은 품목이라 어느 쪽에서 고쳐도 함께 바뀝니다.' },
            { n: 5, title: '견적 카테고리', text: '견적 DB를 묶는 공사 이름(욕실 공사, 주방 공사 …)입니다. 여기서 더하거나 지웁니다.' },
            { n: 6, title: '한번에 옮기기', text: '전체 DB의 공정이나 품목을 골라 견적 DB로 한 번에 옮깁니다.' },
          ],
          tip: "목록에서 '순서 수정'을 누르면 줄을 끌어 순서를 바꿉니다. 그 사이 다른 사람이 순서를 바꿨다면 새로고침하라고 알려 줍니다.",
        },
      ],
    },
    {
      title: '공정 일정',
      sections: [
        {
          id: 'schedule',
          title: '공정 달력',
          shot: {
            path: ESTIMATE,
            width: WIDE,
            height: 1400,
            actions: [tab('공정 일정'), { scrollTo: { text: '공정 작업', closest: 'h2' } }, { run: 'window.scrollBy(0, -120)' }],
            marks: [
              { n: 1, target: { text: '공정 작업', closest: 'h2' }, place: 'left' },
              { n: 2, target: { contains: '공사 시작일', closest: 'label' }, place: 'left' },
              { n: 3, target: { text: '공사 시작 주부터', closest: 'button' } },
              { n: 4, target: { selector: '[title^="목공 ·"]', nth: 0 } },
              { n: 5, target: '달력 출력' },
              { n: 6, target: { text: '휴일 지정' }, place: 'left' },
            ],
          },
          steps: [
            { n: 1, title: '공정 작업', text: '견적서와 실행 내역서의 공종이 칩으로 나옵니다. 칩을 날짜 칸에 끌어 놓으면 그날 시작하는 일정이 됩니다.' },
            { n: 2, title: '공사 시작일', text: '넣으면 저장할 때 이 버전에 함께 남고, 달력이 공사 시작 주부터 보입니다. 비워 두면 첫 공정 시작일을 씁니다.' },
            { n: 3, title: '월별 보기 / 공사 시작 주부터', text: '한 달씩 보거나, 공사 시작 주부터 6주를 봅니다.' },
            { n: 4, title: '일정 막대', text: '두 번 누르면 수정 창이 열리고, 오른쪽 클릭하면 수정·삭제 메뉴가 나옵니다. 마지막 날의 ✕로도 지웁니다.' },
            { n: 5, title: '달력 출력', text: '공정표를 A4 가로로 인쇄합니다.', appendix: 'B-4' },
            { n: 6, title: '휴일 지정', text: '휴일을 넣으면 그 기간에 걸친 일정의 끝나는 날이 하루씩 늦춰집니다. 아래 일정 상세에서도 일정을 고르고 지웁니다.' },
          ],
          tip: '일정은 견적의 저장을 눌러야 이 버전에 남습니다. 고객 진행 현황의 공정 달력도 이 일정으로 그려집니다.',
        },
        {
          id: 'schedule-menu',
          title: '막대 우클릭 메뉴',
          shot: {
            path: ESTIMATE,
            width: WIDE,
            actions: [tab('공정 일정'), { scrollTo: { text: '공정 달력', closest: 'h2' } }, { run: 'window.scrollBy(0, -140)' }, { rightClick: { selector: '[title^="목공 ·"]', nth: 0 } }],
            marks: [
              { n: 1, target: { selector: '[data-task-menu]' }, box: true, place: 'tr' },
              { n: 2, target: { text: '수정', within: { selector: '[data-task-menu]' } }, place: 'left' },
              { n: 3, target: { text: '삭제', within: { selector: '[data-task-menu]' } }, place: 'left' },
            ],
          },
          steps: [
            { n: 1, title: '우클릭 메뉴', text: '일정 막대를 오른쪽 클릭하면 그 일정 이름과 메뉴가 나옵니다. Esc나 바깥을 누르면 닫힙니다.' },
            { n: 2, title: '수정', text: '일정 수정 창을 엽니다. 막대를 두 번 눌러도 같습니다.' },
            { n: 3, title: '삭제', text: '일정 이름과 기간을 보여 주고 한 번 더 묻습니다. 막대 마지막 날의 ✕, 일정 상세의 휴지통도 같은 창을 띄웁니다.' },
          ],
          tip: '지운 일정도 견적의 저장을 눌러야 이 버전에서 빠집니다.',
        },
        {
          id: 'schedule-edit',
          title: '일정 수정 창',
          shot: {
            path: ESTIMATE,
            width: WIDE,
            actions: [tab('공정 일정'), { doubleClick: { selector: '[title^="목공 ·"]', nth: 0 }, wait: 700 }],
            marks: [
              { n: 1, target: { contains: '공정명', closest: 'label' }, place: 'left' },
              { n: 2, target: { contains: '진행 기간', closest: 'label' }, place: 'left' },
              { n: 3, target: { contains: '표시 종료일' }, place: 'left' },
              { n: 4, target: { contains: '담당 작업자', closest: 'label' }, place: 'left' },
              { n: 5, target: { text: '저장', nth: -1 } },
            ],
          },
          steps: [
            { n: 1, title: '공정명 · 시작일', text: '일정 이름과 시작하는 날입니다.' },
            { n: 2, title: '진행 기간 · 진행률', text: '며칠 걸리는지와 진행률(0~100)입니다. 진행률을 1~99로 넣은 일정이 끝날 날을 넘기면 고객 화면에 지연으로 보입니다.' },
            { n: 3, title: '표시 종료일', text: '휴일을 빼고 계산한 실제 끝나는 날입니다.' },
            { n: 4, title: '담당 작업자 · 색상 · 메모', text: '협력업체에서 담당을 고르고 막대 색을 정합니다. 담당과 메모는 고객에게 보이지 않습니다.' },
            { n: 5, title: '저장 · 삭제', text: '달력에 반영합니다. 삭제는 항상 한 번 더 묻습니다.' },
          ],
        },
        {
          id: 'schedule-print',
          title: '달력 출력',
          shot: {
            path: ESTIMATE,
            width: WIDE,
            actions: [tab('공정 일정'), { click: '달력 출력', wait: 1000 }],
            marks: [
              { n: 1, target: { text: '월별', closest: 'button', nth: -1 } },
              { n: 2, target: { text: '공사 시작부터', closest: 'button', nth: -1 } },
              { n: 3, target: { contains: '인쇄 (', closest: 'button', nth: 0 } },
              { n: 4, target: { contains: '공정표', closest: 'h2, h3, p', nth: -1 }, place: 'left' },
            ],
          },
          steps: [
            { n: 1, title: '월별', text: '출력할 첫 달과 끝 달을 고르면 한 달에 한 장씩(최대 12장) 나옵니다.', appendix: 'B-4' },
            { n: 2, title: '공사 시작부터', text: '공사 시작 주부터 마지막 공정이 끝나는 주까지 5주씩 한 장으로 나옵니다.' },
            { n: 3, title: '인쇄', text: '오른쪽 미리보기 그대로 인쇄합니다. PDF로 저장하려면 인쇄 창에서 PDF로 저장을 고릅니다.' },
            { n: 4, title: '미리보기', text: '인쇄될 공정표입니다. 막대에는 공정 이름과 담당 작업자가 나옵니다.' },
          ],
        },
      ],
    },
    {
      title: '발주서',
      sections: [
        {
          id: 'purchase',
          title: '발주서',
          shot: {
            path: ESTIMATE,
            width: WIDE,
            height: 1300,
            actions: [tab('발주서'), { scrollTo: { text: '발주서 리스트', closest: 'h2' } }, { run: 'window.scrollBy(0, -120)' }],
            marks: [
              { n: 1, target: { text: '발주서 리스트', closest: 'h2' }, place: 'left' },
              { n: 2, target: { text: '발주 항목 입력', closest: 'h3' }, place: 'left' },
              { n: 3, target: { text: '발 주 서' }, place: 'left' },
              { n: 4, target: { contains: '발주서 템플릿', closest: 'label' }, place: 'left' },
              { n: 5, target: '템플릿 수정' },
            ],
          },
          steps: [
            { n: 1, title: '발주서 리스트', text: '업체별 발주서입니다. 추가로 새 발주서를 만듭니다.' },
            { n: 2, title: '발주 항목 입력', text: '구분, 모델명, 규격, 수량, 단위, 단가를 넣고 항목 추가를 누르면 아래 발주서에 들어갑니다. 표의 줄을 두 번 누르면 고칩니다.' },
            { n: 3, title: '발주서', text: '업체에 보낼 발주서 모양입니다. 서류 출력 탭에서 인쇄합니다.' },
            { n: 4, title: '발주 정보 · 템플릿', text: '발주서명, 업체명, 발주일, 입고 예정일, 메모와 표 모양(모델·규격형, 구분·종류형, 도어 세트형)을 고릅니다.' },
            { n: 5, title: '템플릿 수정', text: '열 이름, 너비, 정렬, 머리글 병합을 바꿉니다. 바꾸면 사용자 지정 템플릿이 됩니다.' },
          ],
        },
      ],
    },
    {
      title: '추가 사항',
      sections: [
        {
          id: 'extras',
          title: '추가 사항',
          shot: {
            path: ESTIMATE,
            width: WIDE,
            height: 1300,
            actions: [tab('추가 사항'), { scrollTo: { text: '추가 사항', closest: 'h2' } }, { run: 'window.scrollBy(0, -120)' }],
            marks: [
              { n: 1, target: { text: '추가 비용 합계' }, place: 'left' },
              { n: 2, target: { text: '추가 항목 입력', closest: 'h3' }, place: 'left' },
              { n: 3, target: { contains: '베란다 방수 추가', nth: 0 }, place: 'left' },
              { n: 4, target: { text: '총합계', nth: 0 }, place: 'left' },
            ],
          },
          steps: [
            { n: 1, title: '추가 비용 합계', text: '공사 중에 생긴 추가 비용입니다. 실제 마진 계산에 들어갑니다.' },
            { n: 2, title: '추가 항목 입력', text: '품명, 규격, 단위, 수량, 단가를 넣고 항목 추가를 누릅니다.' },
            { n: 3, title: '추가 사항 표', text: '고객에게 낼 추가 사항 서류 모양입니다. 줄을 두 번 누르면 고칩니다.' },
            { n: 4, title: '합계 · 총합계', text: '서류 출력 탭에서 인쇄합니다.' },
          ],
        },
      ],
    },
    {
      title: '서류 출력',
      sections: [
        {
          id: 'documents',
          title: '서류 출력',
          shot: {
            path: ESTIMATE,
            width: WIDE,
            height: 1300,
            actions: [tab('서류 출력'), { scrollTo: { text: '서류 출력', closest: 'h2' } }, { run: 'window.scrollBy(0, -120)' }],
            marks: [
              { n: 1, target: { text: '표지', closest: 'button' } },
              { n: 2, target: { text: '갑지', closest: 'button' } },
              { n: 3, target: { text: '세부내역서', closest: 'button', nth: -1 } },
              { n: 4, target: '현재 서류 인쇄' },
              { n: 5, target: '여러 서류 선택 출력' },
              { n: 6, target: { selector: '#estimate-print' }, box: true },
            ],
          },
          steps: [
            { n: 1, title: '표지', text: '고객명, 공사명, 견적금액(한글·숫자)이 들어간 견적 표지입니다.' },
            { n: 2, title: '갑지', text: '공사별 금액을 한 장에 모은 견적서입니다.' },
            { n: 3, title: '세부내역서', text: '공사별 품명, 규격, 단위, 수량, 단가, 금액입니다. 품명이 빈 줄은 나오지 않지만 금액은 합계에 들어갑니다.' },
            { n: 4, title: '현재 서류 인쇄', text: '오른쪽에 보이는 서류를 인쇄합니다. 발주서도 버튼으로 골라 인쇄합니다.' },
            { n: 5, title: '여러 서류 선택 출력', text: '표지, 갑지, 세부내역서, 공정표, 추가 사항, 발주서를 골라 한 번에 인쇄합니다.' },
            { n: 6, title: '미리보기', text: '인쇄될 모양입니다. 세부내역서가 여러 장이면 화살표로 넘겨 봅니다.' },
          ],
        },
        {
          id: 'batch-print',
          title: '여러 서류 출력',
          shot: {
            path: ESTIMATE,
            width: WIDE,
            actions: [tab('서류 출력'), { click: '여러 서류 선택 출력', wait: 1000 }],
            marks: [
              { n: 1, target: { contains: '견적 표지', closest: 'label' }, place: 'left' },
              { n: 2, target: { contains: '공정표 (', closest: 'label' }, place: 'left' },
              { n: 3, target: { text: '공정표 출력 방식', nth: 0 }, place: 'left' },
              { n: 4, target: { text: '선택 서류 한 번에 출력', closest: 'button' } },
            ],
          },
          steps: [
            { n: 1, title: '서류 고르기', text: '견적 표지, 견적 갑지, 세부내역서는 처음부터 체크되어 있습니다. 추가 사항과 발주서도 고를 수 있습니다.' },
            { n: 2, title: '공정표', text: '체크하면 공정 달력이 공정표로 함께 나옵니다.' },
            { n: 3, title: '공정표 출력 방식', text: '달력 출력과 같은 월별 / 공사 시작부터 중에서 고릅니다.', appendix: 'B-4' },
            { n: 4, title: '선택 서류 한 번에 출력', text: '오른쪽 미리보기 순서대로 인쇄합니다. 추가 사항과 발주서는 세로, 나머지는 가로로 나옵니다.' },
          ],
        },
      ],
    },
  ],
  appendix: [
    {
      id: 'B-1',
      title: '견적 버전과 저장',
      blocks: [
        {
          table: {
            head: ['버전 구분', '언제 쓰나요'],
            rows: [
              ['초안', '첫 상담 뒤 처음 쓰는 견적'],
              ['수정안', '고객 의견을 반영해 고친 견적'],
              ['최종안', '계약 전에 확정한 견적'],
              ['변경견적', '공사 중 추가·변경 공사'],
            ],
          },
        },
        { list: ['버전명은 비워 두면 초안, 최종안, 수정안 1처럼 자동으로 붙습니다.', '페이지를 열면 그 현장에서 가장 최근에 고친 버전이 열립니다.', '현재 버전 복사와 빈 버전으로 시작은 저장해야 버전 목록에 생깁니다.', '버전 삭제는 되돌릴 수 없습니다.'] },
        { h: '저장할 때' },
        { list: ['저장은 지금 버전의 견적서, 실행 내역서, 공정 일정, 휴일, 공사 시작일, 발주서, 추가 사항, 메모를 한 번에 저장합니다.', "다른 컴퓨터에서 같은 버전을 먼저 저장했다면 덮어쓰지 않습니다. '지금 내용을 새 버전으로 저장'이나 '최신 내용 불러오기' 중에서 고릅니다.", '저장하지 않고 현장·버전을 바꾸거나 페이지를 떠나면 먼저 저장할지 묻습니다.'] },
      ],
    },
    {
      id: 'B-2',
      title: '템플릿을 불러올 때 단가가 정해지는 규칙',
      blocks: [
        { p: '불러오기 직전에 자재 DB가 바뀌었는지 확인하고, 바뀌었으면 최신 단가를 다시 읽습니다. 확인하지 못하면 불러오지 않습니다(옛 단가로 들어가는 일이 없도록).' },
        {
          table: {
            head: ['템플릿의 줄', '들어가는 단가'],
            rows: [
              ['DB에서 고른 줄', '그 품목의 지금 DB 단가가 고객 단가·실행 단가 둘 다에 들어갑니다.'],
              ['직접 쓴 줄', '품명·규격·단위가 같은 DB 품목이 딱 하나 있으면 그 단가를 씁니다.'],
              ['공통 줄, 또는 같은 품목이 없거나 여럿', "템플릿 단가 그대로 들어가고 'DB에서 못 찾은 항목'으로 알려 줍니다."],
            ],
          },
        },
        { list: ['불러온 줄은 새 줄로 들어갑니다.', '바꾸기를 고르면 지운 줄과 연결된 실행 내역은 연결만 끊기고 남습니다.', '덧붙이기는 지금 견적 뒤에 붙입니다. 견적이 비어 있으면 묻지 않고 넣습니다.'] },
      ],
    },
    {
      id: 'B-3',
      title: '평형 수량 조정 계산',
      blocks: [
        { p: '평형에 맞춰 수량 조정을 켜면, 체크한 단위의 수량만 아래처럼 바꿉니다. 소수 첫째 자리까지 반올림합니다.' },
        { p: '새 수량 = 템플릿 수량 × 이 현장 평형 ÷ 기준 평형' },
        {
          table: {
            head: ['예 (기준 30평 → 현장 32평)', '템플릿', '불러온 수량'],
            rows: [
              ['실크 도배 (평)', '32', '34.1'],
              ['욕실 벽 타일 (m2)', '24', '25.6'],
              ['양변기 (개, 체크 안 함)', '2', '2'],
            ],
          },
        },
        { list: ['면적 단위(m2·㎡·m²·평)는 처음부터 체크되어 있습니다. 개·식·세트 같은 단위는 그대로 둡니다.', '기준 평형과 이 현장 평형을 둘 다 넣어야 불러올 수 있습니다.', '템플릿의 기준 평형은 템플릿을 저장할 때 넣습니다(1~500).'] },
      ],
    },
    {
      id: 'B-4',
      title: '달력 출력 방식',
      blocks: [
        {
          table: {
            head: ['방식', '어떻게 나오나요'],
            rows: [
              ['월별', '고른 첫 달부터 끝 달까지 한 달에 A4 가로 한 장씩, 최대 12장. 제목은 YYYY년 M월 공정표.'],
              ['공사 시작부터', "공사 시작 주(월요일)부터 마지막 공정이 끝나는 주까지 5주씩 한 장. 제목은 '공정표'. 공사 시작 전 날짜는 흐리게 나옵니다."],
            ],
          },
        },
        { list: ['한 주는 월요일부터 일요일까지입니다.', '가장 긴 공정이 맨 위 줄에 오고, 공정 이름은 막대 가운데에 나옵니다.', '인쇄된 막대에는 공정 이름과 담당 작업자가 함께 나옵니다.', '휴일에 걸친 공정은 끝나는 날이 휴일 수만큼 늦춰집니다.', '여러 서류 출력의 공정표도 같은 방식을 씁니다.'] },
      ],
    },
  ],
};
