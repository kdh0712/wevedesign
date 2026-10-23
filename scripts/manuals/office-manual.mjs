// 통합 매니저 사용 설명서의 내용 (spec 2026-10-23 §3.1). Each section is one page: what to open (shot), where the red
// numbers go (marks) and what each number means (steps). Targets are visible text or { selector }; see build-manuals.mjs.

const OFFICE = '/manager-weve-7519';

// Opening a menu: the left menu button, then (when the group has several) the sub-menu button.
const open = (section, tab) => [{ click: { text: section, within: { selector: 'aside' } } }, ...(tab ? [{ click: { text: tab, within: { selector: 'nav[aria-label$="세부 메뉴"]' } } }] : [])];
const panel = (title) => ({ text: title, closest: 'section' });

export default {
  id: 'office',
  title: '통합 매니저 사용 설명서',
  eyebrow: 'WEVE OFFICE · 직원용',
  lead: '상담부터 현장, 매출, 홈페이지 관리까지 화면별로 따라 해 보세요.',
  coverNote: "견적 작업 페이지는 '견적 작업 사용 설명서'를 따로 받아 주세요.",
  ready: { text: '사무업무 통합 콘솔' },
  hide: [{ text: '로그인 상태를 복원했습니다.', closest: 'section' }],
  chapters: [
    {
      title: '시작하기',
      sections: [
        {
          id: 'login',
          title: '로그인',
          shot: {
            path: OFFICE,
            session: false,
            ready: { text: '관리자 로그인' },
            actions: [
              { setValue: { target: { selector: 'form input[type="text"]' }, value: 'weve-demo' } },
              { setValue: { target: { selector: 'form input[type="password"]' }, value: 'example-pass' } },
            ],
            clip: { selector: 'form' },
            clipPad: 40,
            marks: [
              { n: 1, target: { selector: 'form input[type="text"]' }, box: true },
              { n: 2, target: { selector: 'form input[type="password"]' }, box: true },
              { n: 3, target: { selector: 'form button[type="submit"]' } },
            ],
          },
          steps: [
            { n: 1, title: '계정 ID 또는 이메일', text: '관리자에게 받은 계정 ID나 이메일을 넣습니다.' },
            { n: 2, title: '비밀번호', text: '비밀번호를 넣습니다. 여러 번 틀리면 15분 동안 로그인할 수 없으니 잘 모르면 관리자에게 물어보세요.' },
            { n: 3, title: '로그인', text: '누르면 업무 현황 화면이 열립니다. 로그인은 이 브라우저 탭에서만 8시간 유지되고, 탭을 닫으면 다시 로그인합니다.' },
          ],
          tip: '매니저 주소는 회사 밖 사람에게 알려 주지 마세요. 공용 컴퓨터에서는 다 쓴 뒤 꼭 로그아웃합니다.',
        },
        {
          id: 'layout',
          title: '화면 구성',
          shot: {
            path: OFFICE,
            marks: [
              { n: 1, target: { selector: 'aside nav' }, box: true },
              { n: 2, target: { text: '사무업무 통합 콘솔' }, box: true },
              { n: 3, target: { contains: '접속자 오늘' }, place: 'tr' },
              { n: 4, target: '사용 설명서', place: 'tr' },
              { n: 5, target: { text: '로그아웃', within: { selector: 'header' } }, place: 'tr' },
            ],
          },
          steps: [
            { n: 1, title: '왼쪽 메뉴', text: '업무 묶음(업무 현황, 고객·현장, 견적 관리 …)을 고릅니다. 내 계정에 권한이 있는 메뉴만 보입니다.', appendix: 'A-1' },
            { n: 2, title: '머리글', text: '어느 메뉴에 있든 위쪽에 항상 보입니다.' },
            { n: 3, title: '접속자·자동 갱신', text: '홈페이지 방문자 수와 마지막 갱신 시각입니다. 화면은 30초마다 새 상담과 다른 직원이 바꾼 내용을 스스로 불러옵니다.' },
            { n: 4, title: '사용 설명서', text: '이 설명서를 PDF로 내려받습니다.' },
            { n: 5, title: '로그아웃', text: '다 쓴 뒤 누릅니다. 왼쪽 메뉴 아래에도 같은 버튼이 있습니다.' },
          ],
          tip: '고객·현장처럼 메뉴가 여러 개 묶인 곳은 머리글 아래에 세부 메뉴(상담 요청, 고객 관리 …)가 한 줄 더 나옵니다.',
        },
        {
          id: 'manual',
          title: '사용 설명서 받기',
          shot: {
            path: OFFICE,
            clip: { selector: 'header' },
            marks: [{ n: 1, target: '사용 설명서', box: true }],
          },
          steps: [
            {
              n: 1,
              title: '사용 설명서',
              text: "누르면 'WEVE 통합 매니저 사용 설명서.pdf'가 내려받아집니다. 받는 동안에는 '받는 중…'이 보입니다. 견적 작업 페이지 위쪽의 같은 버튼은 견적 작업 설명서를 받습니다.",
            },
          ],
          tip: '설명서의 목차와 [부록] 표시는 누르면 그 쪽으로 이동합니다. 화면이 바뀌면 설명서도 새로 만들어 올립니다.',
        },
      ],
    },
    {
      title: '업무 현황',
      sections: [
        {
          id: 'dashboard',
          title: '업무 현황 보는 법',
          shot: {
            path: OFFICE,
            marks: [
              { n: 1, target: { text: '계약 매출' }, place: 'left' },
              { n: 2, target: { text: '견적 예상' }, place: 'left' },
              { n: 3, target: { text: '미완료 상담' }, place: 'left' },
              { n: 4, target: { text: '최근 상담 요청' }, place: 'left' },
              { n: 5, target: { text: '매출·견적 흐름' }, place: 'left' },
            ],
          },
          steps: [
            { n: 1, title: '계약 매출', text: '계약된 매출 합계와 이익입니다. 상태가 견적·취소인 매출은 빼고 셉니다.' },
            { n: 2, title: '견적 예상 · 방문', text: '현장마다 가장 최근 견적을 더한 금액과 예상 마진, 홈페이지 방문 수(오늘 / 이번 주)입니다.' },
            { n: 3, title: '상태 카드', text: '끝나지 않은 상담, 계약·시공중·완료 현장 수, 견적을 쓴 현장의 비율, 최소 수량 이하로 떨어진 재고 수입니다.' },
            { n: 4, title: '최근 상담 요청', text: "최근 상담 6건입니다. 줄을 누르면 상담 상세가 열리고, '상담 완료'로 바로 완료 처리합니다." },
            { n: 5, title: '매출·견적 흐름', text: '최근 매출 6건의 금액, 원가, 이익입니다.' },
          ],
          tip: '금액 카드는 매출·견적 권한이 있는 계정에만 보입니다.',
        },
        {
          id: 'dashboard-site',
          title: '현장별 바로 보기',
          shot: {
            path: OFFICE,
            actions: [{ scrollTo: { text: '현장별 바로 보기' } }],
            clip: panel('현장별 바로 보기'),
            marks: [
              { n: 1, target: { selector: 'select', within: panel('현장별 바로 보기') }, box: true },
              { n: 2, target: { text: '견적 작업', within: panel('현장별 바로 보기') } },
              { n: 3, target: { text: '매출 등록', within: panel('현장별 바로 보기') }, place: 'tr' },
              { n: 4, target: { text: '알림톡', within: panel('현장별 바로 보기') } },
              { n: 5, target: { text: '일일보고서 작성', within: panel('현장별 바로 보기') }, place: 'tr' },
            ],
          },
          steps: [
            { n: 1, title: '현장 선택', text: '볼 현장을 고르면 아래에 그 현장의 고객, 최신 견적, 실행 원가, 등록 매출이 나옵니다.' },
            { n: 2, title: '견적 작업', text: '이 현장의 견적 작업 페이지를 엽니다.' },
            { n: 3, title: '매출 등록', text: '매출 관리로 가서 이 현장의 최신 견적 금액으로 매출 입력란을 채웁니다.' },
            { n: 4, title: '알림톡', text: '고객에게 보내는 안내 창(계약 완료 안내, 채팅방 이동)을 엽니다. 고객 연락처가 없으면 누를 수 없습니다.' },
            { n: 5, title: '일일보고서 작성', text: '오늘 작업 내용과 사진으로 고객용 일일 보고서를 만들고, 고객 진행 현황 페이지에 올립니다.' },
          ],
          tip: '아래 칩(최종안 · 계약 견적 …)은 이 현장에 저장된 견적 버전입니다.',
        },
        {
          id: 'daily-report',
          title: '일일 보고서 작성',
          shot: {
            path: OFFICE,
            height: 1250,
            actions: [
              { scrollTo: { text: '현장별 바로 보기' } },
              { click: '일일보고서 작성' },
              { setValue: { target: { selector: 'input[value="김동호 실장"]' }, value: '한디자인 실장' } },
              { setValue: { target: { selector: 'textarea[placeholder="견적 내역을 클릭하거나 직접 작업 내용을 입력하세요."]' }, value: '거실 우물천장 목공 마감\n욕실 방수 1차 완료, 내일 타일 시작' } },
            ],
            clip: { selector: 'div.fixed.inset-0 > section.max-w-7xl' },
            clipPad: 0,
            marks: [
              { n: 1, target: { text: '담당 디자이너' }, place: 'left' },
              { n: 2, target: { selector: 'textarea[placeholder="견적 내역을 클릭하거나 직접 작업 내용을 입력하세요."]' }, box: true },
              { n: 3, target: { text: '목공 진행' } },
              { n: 4, target: { text: '사진을 드래그하거나 클릭하여 업로드' } },
              { n: 5, target: { text: '보고서 이미지 생성/다운로드' } },
              { n: 6, target: { text: '견적 내역 불러오기' }, place: 'left' },
            ],
          },
          steps: [
            { n: 1, title: '날짜 · 담당 디자이너', text: '보고서 날짜(오늘이 기본)와 담당자를 넣습니다. 현장명과 고객명은 자동으로 들어갑니다.' },
            { n: 2, title: '상세 작업 내역', text: '오늘 한 일을 적습니다. 고객에게 보내는 보고서와 진행 현황에 쓰입니다.' },
            { n: 3, title: '공정 칩', text: '이 현장 견적의 공정으로 만든 칩입니다. 누르면 작업 내역에 한 줄이 들어갑니다.' },
            { n: 4, title: '현장 사진', text: '사진을 끌어 놓거나 눌러서 고릅니다(최대 12장). 가로 사진과 세로 사진은 알아서 다른 모양으로 배치됩니다.' },
            { n: 5, title: '보고서 이미지 생성/다운로드', text: '사진마다 보고서 이미지(JPG)를 만들어 내려받습니다. 만든 보고서는 왼쪽 목록에 날짜별로 남습니다.' },
            { n: 6, title: '견적 내역 불러오기', text: '견적 품목을 검색해서 누르면 작업 내역에 들어갑니다.' },
          ],
          tip: '왼쪽 생성 보고서 목록은 이 컴퓨터의 브라우저에만 저장됩니다. 다른 컴퓨터에서 이어 하려면 진행사항 내보내기 파일을 쓰세요.',
        },
        {
          id: 'daily-report-progress',
          title: '고객 진행 현황에 올리기',
          shot: {
            path: OFFICE,
            actions: [
              { scrollTo: { text: '현장별 바로 보기' } },
              { click: '일일보고서 작성' },
              { setValue: { target: { selector: 'textarea[placeholder="견적 내역을 클릭하거나 직접 작업 내용을 입력하세요."]' }, value: '거실 우물천장 목공 마감\n욕실 방수 1차 완료, 내일 타일 시작' } },
              { scrollTo: { selector: 'section[aria-labelledby="daily-report-progress-title"]' } },
            ],
            clip: { selector: 'section[aria-labelledby="daily-report-progress-title"]' },
            marks: [
              { n: 1, target: { text: '고객 진행 현황에 올리기' } },
              { n: 2, target: { selector: '#customer-progress-text' }, box: true },
              { n: 3, target: { text: '고객에게 알림톡 보내기' } },
              { n: 4, target: { text: '올리기' } },
              { n: 5, target: { text: '이 현장의 진행 기록', closest: 'h4' } },
            ],
          },
          steps: [
            { n: 1, title: '고객 진행 현황에 올리기', text: '켜 두면 이 보고서가 고객 진행 현황 페이지에 올라갑니다. 처음 올릴 때 고객 링크가 자동으로 만들어집니다.', appendix: 'A-2' },
            { n: 2, title: '고객에게 보이는 내용', text: '처음에는 상세 작업 내역이 그대로 들어갑니다. 내부 메모나 고객이 몰라도 되는 내용은 여기서 지우세요. 보고서 자체는 바뀌지 않습니다.', appendix: 'A-3' },
            { n: 3, title: '고객에게 알림톡 보내기', text: '체크하면 올릴 때 고객에게 알림톡이 갑니다. 저절로 보내지 않으니 필요할 때만 체크합니다.' },
            { n: 4, title: '올리기', text: '사진을 줄여 올리고 기록을 저장합니다. 같은 내용은 두 번 올라가지 않습니다.' },
            { n: 5, title: '이 현장의 진행 기록', text: '지금까지 올린 기록입니다. 알림톡을 다시 보내거나 기록을 지울 수 있습니다. 지우면 고객 화면에서도 바로 사라집니다.' },
          ],
        },
      ],
    },
    {
      title: '고객·현장',
      sections: [
        {
          id: 'consultations',
          title: '상담 요청',
          shot: {
            path: OFFICE,
            actions: open('고객·현장'),
            marks: [
              { n: 1, target: { contains: '최근 상담 요청' }, place: 'left' },
              { n: 2, target: { selector: 'select[aria-label="상담 상태 변경"]', nth: 0 } },
              { n: 3, target: { text: '고객으로 등록', nth: 0 } },
              { n: 4, target: { text: '상담 완료', nth: 0 } },
              { n: 5, target: { text: '삭제', nth: 0 }, place: 'tr' },
            ],
          },
          steps: [
            { n: 1, title: '상담 묶음', text: '최근 상담 요청(신규), 진행 중(상담중·견적·계약), 완료로 나눠 봅니다. 줄을 누르면 상담 상세가 열립니다.', appendix: 'A-5' },
            { n: 2, title: '상태 바꾸기', text: '신규 → 상담중 → 견적 → 계약 → 완료 중에서 고르면 바로 저장됩니다.' },
            { n: 3, title: '고객으로 등록', text: '상담 내용으로 고객 등록 입력란을 채우고 고객 관리로 갑니다.' },
            { n: 4, title: '상담 완료', text: '상담 완료 처리 창을 엽니다. 상담만 끝내거나 고객과 현장을 함께 등록할 수 있습니다.' },
            { n: 5, title: '삭제', text: '상담을 휴지통으로 옮깁니다.', appendix: 'A-4' },
          ],
          tip: '줄 위쪽 회색 글씨는 들어온 곳(홈페이지 상담 신청, 카카오 비즈니스폼+ …), 공간 종류, 평수, 예산, 희망 일정, 상태, 날짜입니다.',
        },
        {
          id: 'consultation-detail',
          title: '상담 상세',
          shot: {
            path: OFFICE,
            actions: [...open('고객·현장'), { click: { text: '정예시 · 010-0000-1101' } }],
            clip: { selector: 'div.fixed.inset-0 > div', nth: -1 },
            clipPad: 24,
            marks: [
              { n: 1, target: { text: '정예시' }, place: 'left' },
              { n: 2, target: { text: '문의 내용' }, place: 'left' },
              { n: 3, target: { text: '삭제', nth: -1 } },
              { n: 4, target: { text: '고객으로 등록', nth: -1 } },
              { n: 5, target: { text: '상담 완료', nth: -1 }, place: 'tr' },
            ],
          },
          steps: [
            { n: 1, title: '고객 정보', text: '이름, 받은 날짜, 연락처, 공간 종류, 주소, 상태, 그리고 설문 답(평수, 현재 상태, 인테리어 이유, 예산, 희망 시작일)입니다.' },
            { n: 2, title: '문의 내용', text: '고객이 상담 신청에 쓴 글입니다.' },
            { n: 3, title: '삭제', text: '상담을 휴지통으로 옮깁니다.' },
            { n: 4, title: '고객으로 등록', text: '이 상담으로 고객 등록을 시작합니다.' },
            { n: 5, title: '상담 완료', text: '상담 완료 처리 창을 엽니다.' },
          ],
        },
        {
          id: 'consultation-complete',
          title: '상담 완료 처리',
          shot: {
            path: OFFICE,
            actions: [...open('고객·현장'), { click: { text: '상담 완료', nth: 0 } }],
            clip: { text: '상담 완료 처리', closest: 'div.rounded-lg, div.rounded-xl, section' },
            clipPad: 60,
            marks: [
              { n: 1, target: '상담만 완료' },
              { n: 2, target: '고객 + 현장 등록', place: 'tr' },
              { n: 3, target: { text: '취소', nth: -1 } },
            ],
          },
          steps: [
            { n: 1, title: '상담만 완료', text: '상담 상태만 완료로 바꿉니다.' },
            { n: 2, title: '고객 + 현장 등록', text: "고객 등록 입력란을 상담 내용으로 채웁니다. 내용을 확인하고 저장하면 고객과 비공개 현장이 함께 만들어지고 상담은 완료됩니다." },
            { n: 3, title: '취소', text: '아무것도 바꾸지 않고 닫습니다.' },
          ],
        },
        {
          id: 'customers',
          title: '고객 관리',
          shot: {
            path: OFFICE,
            height: 1250,
            actions: open('고객·현장', '고객 관리'),
            marks: [
              { n: 1, target: { text: '고객 등록', closest: 'h2' }, place: 'left' },
              { n: 2, target: { text: '고객 정보' }, place: 'left' },
              { n: 3, target: { text: '현장 정보' }, place: 'left' },
              { n: 4, target: '고객 저장 + 현장 등록' },
              { n: 5, target: { text: '고객 목록', closest: 'h2' }, place: 'left' },
              { n: 6, target: { text: '알림톡', nth: 0 } },
            ],
          },
          steps: [
            { n: 1, title: '고객 등록', text: "새 고객을 넣습니다. 목록에서 '수정'을 누르면 이 칸이 '고객 수정'으로 바뀝니다." },
            { n: 2, title: '고객 정보', text: '고객명, 연락처(자동으로 - 표시), 카카오 채팅방 주소, 고객 상태, 메모입니다.' },
            { n: 3, title: '현장 정보', text: '현장명을 넣으면 고객을 저장할 때 그 현장도 함께 등록됩니다.' },
            { n: 4, title: '고객 저장 + 현장 등록', text: '고객과 현장을 저장합니다.' },
            { n: 5, title: '고객 목록', text: "고객마다 '채팅방'(주소가 있을 때), '수정', '삭제'(휴지통으로)가 있습니다." },
            { n: 6, title: '알림톡', text: '고객 안내 발송 창을 엽니다.' },
          ],
        },
        {
          id: 'alimtalk',
          title: '고객 안내 발송(알림톡)',
          shot: {
            path: OFFICE,
            actions: [...open('고객·현장', '고객 관리'), { click: { text: '알림톡', nth: 0 } }],
            clip: { text: '고객 안내 발송', closest: 'div.rounded-lg, div.rounded-xl, section' },
            clipPad: 60,
            marks: [
              { n: 1, target: { contains: '1. 계약 완료 안내', closest: 'button' } },
              { n: 2, target: { contains: '2. 채팅방 이동', closest: 'button' } },
              { n: 3, target: { contains: '3. 공사 완료 안내', closest: 'button' } },
            ],
          },
          steps: [
            { n: 1, title: '계약 완료 안내', text: '승인된 알림톡 템플릿으로 바로 보냅니다(다시 묻지 않음). 한 고객에게 한 번만 보낼 수 있고, 보낸 뒤에는 보낸 날짜가 표시됩니다.' },
            { n: 2, title: '채팅방 이동', text: '저장된 고객 채팅방을 엽니다. 주소가 없으면 카카오 채널 관리 화면을 엽니다.' },
            { n: 3, title: '공사 완료 안내', text: '알림톡 템플릿 승인 뒤에 쓸 수 있습니다(준비 중).' },
          ],
          tip: '알림톡은 보낼 때마다 비용이 듭니다. 고객 번호가 맞는지 먼저 확인하세요.',
        },
        {
          id: 'sites',
          title: '현장 관리',
          shot: {
            path: OFFICE,
            actions: [...open('고객·현장', '현장 관리'), { click: { text: '수정', nth: 0, within: panel('현장 목록') } }, { run: 'window.scrollTo(0, 0)' }],
            marks: [
              { n: 1, target: { text: '현장 수정', closest: 'h2' }, place: 'left' },
              { n: 2, target: '현장 수정 저장' },
              { n: 3, target: { text: '현장 목록', closest: 'h2' }, place: 'left' },
              { n: 4, target: { text: '수정', nth: 0, within: panel('현장 목록') } },
              { n: 5, target: { text: '삭제', nth: 0, within: panel('현장 목록') }, place: 'tr' },
            ],
          },
          steps: [
            { n: 1, title: '현장 등록·수정', text: "현장명, 고객명, 연락처, 현장 종류, 주소, 상태, 메모를 넣습니다. 저장하면 고객과 연결할지 확인하는 창이 뜨고, 같은 연락처(없으면 이름)의 고객이 있으면 연결, 없으면 새로 등록합니다." },
            { n: 2, title: '현장 수정 저장', text: "저장합니다. 상태를 '완료'로 저장하면 고객 진행 현황 링크가 자동으로 닫힙니다.", appendix: 'A-2' },
            { n: 3, title: '현장 목록', text: '등록된 현장과 상태입니다.' },
            { n: 4, title: '수정', text: '이 현장을 위 입력란에 불러옵니다. 입력란 아래에 고객 진행 현황 링크와 할 일·현장 기록이 나옵니다.' },
            { n: 5, title: '삭제', text: '현장을 휴지통으로 옮깁니다. 견적 버전이 있는 현장은 견적을 먼저 지워야 합니다.', appendix: 'A-4' },
          ],
          tip: '새 현장을 저장하면 견적 권한이 있는 계정은 바로 견적 작업 페이지로 넘어갑니다.',
        },
        {
          id: 'progress-link',
          title: '고객 진행 현황 링크',
          shot: {
            path: OFFICE,
            actions: [...open('고객·현장', '현장 관리'), { click: { text: '수정', nth: 0, within: panel('현장 목록') } }, { scrollTo: { selector: 'section[aria-labelledby^="progress-link-"]' } }],
            clip: { selector: 'section[aria-labelledby^="progress-link-"]' },
            marks: [
              { n: 1, target: { text: '켜짐' } },
              { n: 2, target: '링크 복사' },
              { n: 3, target: '링크 끄기' },
              { n: 4, target: '새 링크로 바꾸기' },
              { n: 5, target: '미리보기', place: 'tr' },
              { n: 6, target: { contains: '고객이 마지막으로 들어온 때' }, place: 'left' },
            ],
          },
          steps: [
            { n: 1, title: '링크 상태', text: '켜짐, 꺼짐, 링크 없음 중 하나입니다. 고객은 이 링크와 휴대폰 번호 뒷자리 4자리로 공사 진행 현황을 봅니다.', appendix: 'A-2' },
            { n: 2, title: '링크 복사', text: '고객에게 보낼 주소를 복사합니다.' },
            { n: 3, title: '링크 끄기 / 켜기', text: '끄면 고객이 볼 수 없습니다. 끈 링크는 기록을 올려도 다시 켜지지 않으니 필요하면 직접 켭니다.' },
            { n: 4, title: '새 링크로 바꾸기', text: '예전 링크와 고객 확인 기록을 모두 무효로 하고 새 주소를 만듭니다. 링크가 잠겼을 때도 씁니다.' },
            { n: 5, title: '미리보기', text: '고객이 보는 화면을 뒷자리 확인 없이 미리 봅니다.' },
            { n: 6, title: '확인 기록', text: '링크를 만든 때와 고객이 마지막으로 들어온 때입니다. 아래에는 알림톡 발송 기록이 나옵니다.' },
          ],
        },
        {
          id: 'progress-preview',
          title: '고객 화면 미리보기',
          shot: {
            path: OFFICE,
            actions: [
              ...open('고객·현장', '현장 관리'),
              { click: { text: '수정', nth: 0, within: panel('현장 목록') } },
              { scrollTo: { selector: 'section[aria-labelledby^="progress-link-"]' } },
              { click: '미리보기', wait: 1200 },
            ],
            clip: { selector: '[role="dialog"][aria-label="고객 화면 미리보기"]' },
            clipPad: 24,
            marks: [
              { n: 1, target: { text: '고객 화면 미리보기' } },
              { n: 2, target: { selector: '[aria-label="메뉴"]' } },
              { n: 3, target: { text: '전체 진행률', nth: 0, within: { selector: '[role="dialog"][aria-label="고객 화면 미리보기"]' } } },
              { n: 4, target: { text: '공정 달력', nth: 0, within: { selector: '[role="dialog"][aria-label="고객 화면 미리보기"]' } } },
            ],
          },
          steps: [
            { n: 1, title: '미리보기', text: '관리자 화면에서만 보는 고객 화면입니다. 링크가 꺼져 있으면 위에 노란 안내가 나옵니다.' },
            { n: 2, title: '☰ 메뉴', text: '고객은 이 메뉴로 공사 일정과 현황 사진을 오갑니다.' },
            { n: 3, title: '전체 진행률', text: '견적의 공정 일정으로 계산한 진행률, 공사 기간, 지금 공정과 다음 공정입니다.' },
            { n: 4, title: '공정 달력', text: '견적 작업 페이지의 공정 달력과 같은 막대가 보입니다. 금액, 업체, 작업자 이름은 보이지 않습니다.', appendix: 'A-3' },
          ],
        },
        {
          id: 'site-notes',
          title: '할 일과 현장 기록',
          shot: {
            path: OFFICE,
            actions: [...open('고객·현장', '현장 관리'), { click: { text: '수정', nth: 0, within: panel('현장 목록') } }, { scrollTo: { selector: 'section[aria-label="직원 할 일과 현장 기록"]' } }],
            clip: { selector: 'section[aria-label="직원 할 일과 현장 기록"]' },
            marks: [
              { n: 1, target: { contains: '할 일', closest: 'h3' }, place: 'left' },
              { n: 2, target: { selector: 'section[aria-label="직원 할 일과 현장 기록"] input[type="checkbox"]', nth: 0 } },
              { n: 3, target: { selector: 'input[placeholder="할 일 추가"]' }, box: true },
              { n: 4, target: { text: '현장 기록', closest: 'h3' }, place: 'left' },
              { n: 5, target: { selector: 'textarea[placeholder="현장 기록 남기기 (직원만 봐요)"]' }, box: true },
            ],
          },
          steps: [
            { n: 1, title: '할 일', text: '이 현장에서 남은 일입니다. 숫자는 아직 끝내지 않은 일의 수입니다.' },
            { n: 2, title: '체크', text: "끝낸 일은 체크합니다. 누가 언제 끝냈는지 남고, '끝낸 일 보기'로 다시 볼 수 있습니다." },
            { n: 3, title: '할 일 추가', text: '적고 추가를 누르면 다른 직원과 휴대폰 앱에도 바로 보입니다.' },
            { n: 4, title: '현장 기록', text: '관리사무소 안내, 고객 요청처럼 직원끼리 알아야 할 내용입니다.' },
            { n: 5, title: '기록 남기기', text: '최대 1,000자까지 씁니다. 글은 쓴 사람이나 총괄 관리자만 지울 수 있습니다.' },
          ],
          tip: '할 일과 현장 기록은 직원만 봅니다. 고객 진행 현황에는 나오지 않습니다.',
        },
        {
          id: 'sales',
          title: '매출 관리',
          shot: {
            path: OFFICE,
            height: 1250,
            actions: open('고객·현장', '매출 관리'),
            marks: [
              { n: 1, target: { selector: 'select', nth: 0, within: panel('매출 등록') }, box: true },
              { n: 2, target: { selector: 'select', nth: 1, within: panel('매출 등록') }, box: true },
              { n: 3, target: '매출 저장' },
              { n: 4, target: { text: '매출 현황', closest: 'h2' }, place: 'left' },
              { n: 5, target: { text: '수정', nth: 0, within: panel('매출 현황') } },
            ],
          },
          steps: [
            { n: 1, title: '현장 선택', text: "현장을 고르면 최신 견적 금액과 실행 원가가 매출액·원가에 자동으로 들어갑니다. 현장 없이 쓰려면 '수기 입력'입니다." },
            { n: 2, title: '기준 견적', text: '어느 견적 버전을 기준으로 할지 고릅니다. 메모에 기준 버전이 적힙니다.' },
            { n: 3, title: '매출 저장', text: '고객명, 현장명, 매출액, 원가, 상태(견적·계약·입금 예정·부분 입금·입금 완료·취소), 입금일을 확인하고 저장합니다.' },
            { n: 4, title: '매출 현황', text: '계약 매출(견적·취소 제외), 견적 기준 예상, 매출 등록률입니다.' },
            { n: 5, title: '수정·삭제', text: '매출마다 수정과 삭제(휴지통으로)가 있습니다.' },
          ],
        },
      ],
    },
    {
      title: '견적 관리',
      sections: [
        {
          id: 'estimates',
          title: '견적 작업',
          shot: {
            path: OFFICE,
            actions: open('견적 관리'),
            marks: [
              { n: 1, target: { text: '현장별 견적 작업', closest: 'h2' }, place: 'left' },
              { n: 2, target: '새 현장 등록', place: 'tr' },
              { n: 3, target: { text: '견적 요약', closest: 'h2' }, place: 'left' },
              { n: 4, target: { text: '견적 수정하기', closest: 'button' }, place: 'tr' },
              { n: 5, target: { text: '작업 상태' }, place: 'left' },
            ],
          },
          steps: [
            { n: 1, title: '현장 고르기', text: '현장마다 저장된 견적 버전 수와 대표 버전의 견적·원가가 보입니다. 누르면 오른쪽에 요약이 나옵니다.' },
            { n: 2, title: '새 현장 등록', text: '현장 관리로 가서 현장을 먼저 등록합니다.' },
            { n: 3, title: '견적 요약', text: '견적 금액, 실행 원가, 예상 마진, 견적을 쓴 현장 수입니다.' },
            { n: 4, title: '견적 수정하기', text: '견적 작업 페이지를 엽니다. 견적서, 실행 내역서, 공정 일정, 발주서, 서류 출력은 모두 그 페이지에서 합니다.' },
            { n: 5, title: '작업 상태', text: '대표 버전, 마지막 수정, 현장 상태, 버전 수입니다.' },
          ],
          tip: "견적 작업 페이지 사용법은 그 페이지 위쪽 '사용 설명서' 버튼으로 받는 견적 작업 설명서에 있습니다.",
        },
      ],
    },
    {
      title: '자재·협력업체',
      sections: [
        {
          id: 'inventory',
          title: '재고 관리',
          shot: {
            path: OFFICE,
            actions: open('자재·협력업체'),
            marks: [
              { n: 1, target: { text: '재고 등록', closest: 'h2' }, place: 'left' },
              { n: 2, target: { contains: '최소 수량', closest: 'label' }, place: 'left' },
              { n: 3, target: '재고 저장' },
              { n: 4, target: { text: '재고 목록', closest: 'h2' }, place: 'left' },
              { n: 5, target: { text: '수정', nth: 0, within: panel('재고 목록') } },
            ],
          },
          steps: [
            { n: 1, title: '재고 등록', text: '품목명, 분류, 수량, 단위, 거래처, 메모를 넣습니다.' },
            { n: 2, title: '최소 수량', text: '수량이 이 숫자 이하로 떨어지면 업무 현황의 재고 확인 카드에 부족으로 셉니다.' },
            { n: 3, title: '재고 저장', text: '저장합니다.' },
            { n: 4, title: '재고 목록', text: '품목, 수량, 최소 수량, 거래처입니다.' },
            { n: 5, title: '수정·삭제', text: '품목마다 수정과 삭제(휴지통으로)가 있습니다.' },
          ],
        },
        {
          id: 'vendors',
          title: '협력업체',
          shot: {
            path: OFFICE,
            actions: open('자재·협력업체', '협력업체'),
            marks: [
              { n: 1, target: { text: '협력업체 등록', closest: 'h2' }, place: 'left' },
              { n: 2, target: '협력업체 저장' },
              { n: 3, target: { text: '협력업체 목록', closest: 'h2' }, place: 'left' },
              { n: 4, target: { text: '수정', nth: 0, within: panel('협력업체 목록') } },
            ],
          },
          steps: [
            { n: 1, title: '협력업체 등록', text: '업체명, 담당자, 연락처, 업무 분야, 상태, 메모를 넣습니다.' },
            { n: 2, title: '협력업체 저장', text: '저장합니다.' },
            { n: 3, title: '협력업체 목록', text: '업체명과 업무 분야, 담당자, 연락처, 상태입니다.' },
            { n: 4, title: '수정·삭제', text: '업체마다 수정과 삭제(휴지통으로)가 있습니다.' },
          ],
          tip: '여기 등록한 업체는 견적 작업 페이지의 공정 일정(담당 작업자)과 발주서 업체명에서 고를 수 있습니다.',
        },
      ],
    },
    {
      title: '홈페이지·채널',
      sections: [
        {
          id: 'homepage-basic',
          title: '홈페이지 기본 정보',
          shot: {
            path: OFFICE,
            height: 1300,
            actions: open('홈페이지·채널'),
            marks: [
              { n: 1, target: { text: '기본 정보', nth: 0 } },
              { n: 2, target: { text: '기본 회사 정보' }, place: 'left' },
              { n: 3, target: { text: '홈페이지 미리보기', closest: 'h3' }, place: 'left' },
            ],
          },
          steps: [
            { n: 1, title: '하위 메뉴', text: '기본 정보, 첫 화면, 섹션 문구, 상담/위치, 팝업 관리, Project 관리, 상담 설문으로 나뉩니다.' },
            { n: 2, title: '기본 회사 정보', text: '상담 메일을 받을 이메일, 대표자명, 사업자등록번호, 상단 안심번호, 하단 회사 전화번호, 주소입니다.' },
            { n: 3, title: '홈페이지 미리보기', text: '저장된 실제 홈페이지를 보면서 글이 들어갈 위치를 확인합니다.' },
          ],
          tip: "고친 글은 화면 아래쪽 '홈페이지 설정 저장'을 눌러야 홈페이지에 반영됩니다. 모든 하위 메뉴에 같은 버튼이 있습니다.",
        },
        {
          id: 'homepage-hero',
          title: '첫 화면과 섹션 문구',
          shot: {
            path: OFFICE,
            actions: [...open('홈페이지·채널'), { click: { text: '첫 화면', nth: 0 } }],
            marks: [
              { n: 1, target: { text: '첫 화면', nth: 0 } },
              { n: 2, target: { contains: '배너 이미지 1', nth: 0 }, place: 'left' },
              { n: 3, target: { contains: '첫 화면 큰 문구', closest: 'label' }, place: 'left' },
              { n: 4, target: { text: '섹션 문구', nth: 0 } },
              { n: 5, target: { text: '상담/위치', nth: 0 }, place: 'tr' },
            ],
          },
          steps: [
            { n: 1, title: '첫 화면', text: '홈페이지 맨 위 배너의 사진과 글입니다.' },
            { n: 2, title: '배너 이미지', text: '사진 3장까지 고릅니다. 사진은 고르는 즉시 홈페이지에 저장됩니다.' },
            { n: 3, title: '배너 문구', text: '작은 문구, 큰 문구, 설명, 버튼 문구입니다. 글은 홈페이지 설정 저장을 눌러야 반영됩니다.' },
            { n: 4, title: '섹션 문구', text: '브랜드, Project, 소개, 진행 과정 영역의 제목과 설명입니다.' },
            { n: 5, title: '상담/위치', text: '오시는 길과 상담 영역의 제목과 설명입니다.' },
          ],
        },
        {
          id: 'homepage-popup',
          title: '팝업 관리',
          shot: {
            path: OFFICE,
            height: 1650,
            actions: [...open('홈페이지·채널'), { click: { text: '팝업 관리', nth: 0 } }],
            marks: [
              { n: 1, target: '팝업 추가' },
              { n: 2, target: { contains: '가을 상담 이벤트', nth: 0 } },
              { n: 3, target: { contains: '레이아웃', closest: 'label' }, place: 'left' },
              { n: 4, target: { contains: '노출 시작일', closest: 'label' }, place: 'left' },
              { n: 5, target: { contains: '팝업 제목', closest: 'label' }, place: 'left' },
            ],
          },
          steps: [
            { n: 1, title: '팝업 추가 · 선택 삭제', text: '팝업을 여러 개 만들어 동시에 띄울 수 있습니다.' },
            { n: 2, title: '팝업 목록', text: '팝업을 고르면 오른쪽에서 고칩니다. 노출 / 숨김이 함께 보입니다.' },
            { n: 3, title: '모양', text: '레이아웃(이미지 상단형·이미지로만·좌우 분할형·글 중심형), 위치, 이미지 표시 방법을 고릅니다.' },
            { n: 4, title: '기간 · 크기', text: '노출 시작일과 종료일, 팝업 너비입니다. 기간을 비워 두면 노출 중인 동안 계속 뜹니다.' },
            { n: 5, title: '내용', text: '이미지, 제목, 내용, 버튼 문구와 링크입니다. 링크에 #contact를 넣으면 상담 영역으로 이동합니다.' },
          ],
          tip: "아래쪽 '링크/이미지 요소 배치'에서 상담 버튼, 링크 상자, 이미지를 넣고 미리보기에서 마우스로 위치를 맞춥니다. 팝업도 '홈페이지 설정 저장'을 눌러야 반영됩니다.",
        },
        {
          id: 'homepage-projects',
          title: 'Project 관리',
          shot: {
            path: OFFICE,
            height: 1300,
            actions: [...open('홈페이지·채널'), { click: { text: 'Project 관리', nth: 0 } }],
            marks: [
              { n: 1, target: { text: '현장 폴더 한번에 업로드', closest: 'h2' }, place: 'left' },
              { n: 2, target: { text: '현장 폴더 선택 또는 드래그' } },
              { n: 3, target: 'Project 업로드' },
              { n: 4, target: { text: 'Project 분류 관리', closest: 'h2' }, place: 'left' },
            ],
          },
          steps: [
            { n: 1, title: '현장 폴더 한번에 업로드', text: '현장명 폴더 안에 대표.jpg, 거실1.jpg, 주방1.jpg처럼 이름 붙인 사진을 넣어 두면 Project와 공간별 사진 묶음이 한 번에 만들어집니다.' },
            { n: 2, title: '폴더 선택', text: '분류, 주거 형태, 지역, 평수, 설명을 넣고 폴더를 끌어 놓거나 고릅니다. 대표 사진이 없는 폴더는 건너뜁니다.' },
            { n: 3, title: 'Project 업로드', text: '올린 결과(새로 만듦, 고침, 건너뜀)가 아래에 나옵니다.' },
            { n: 4, title: 'Project 분류 관리', text: 'Project를 골라 대표 사진(올리는 즉시 저장), 이름, 분류, 설명, 노출 순서, 홈페이지 노출 여부를 고치고 Project 정보 저장을 누릅니다.' },
          ],
        },
        {
          id: 'homepage-survey',
          title: '상담 설문',
          shot: {
            path: OFFICE,
            actions: [...open('홈페이지·채널'), { click: { text: '상담 설문', nth: 0 } }, { click: '상담 설문 편집' }],
            marks: [
              { n: 1, target: { text: '1 공간유형' }, place: 'left' },
              { n: 2, target: { text: '질문 문구', nth: 0 }, place: 'left' },
              { n: 3, target: { text: '선택지 추가', nth: 0 } },
              { n: 4, target: '설문 설정 반영' },
            ],
          },
          steps: [
            { n: 1, title: '질문 탭', text: '1 공간유형, 2~4 묶음별 질문, 5 예산, 6 일정, 동의문으로 나뉩니다.' },
            { n: 2, title: '질문 문구', text: '고객에게 보이는 질문을 고칩니다.' },
            { n: 3, title: '선택지', text: '선택지를 더하거나 지웁니다. 2~4번 질문은 첫 질문의 답(아파트, 상가 …)에 따라 다른 묶음을 보여 줍니다.' },
            { n: 4, title: '설문 설정 반영', text: '이 창의 내용을 화면에 반영합니다. 저장은 아닙니다. 닫은 뒤 홈페이지 설정 저장을 눌러야 홈페이지에 나옵니다.' },
          ],
        },
        {
          id: 'integrations',
          title: '외부 채널',
          shot: {
            path: OFFICE,
            height: 1300,
            actions: open('홈페이지·채널', '외부 채널'),
            marks: [
              { n: 1, target: { text: '카카오 비즈니스폼+ 상담 동기화' }, place: 'left' },
              { n: 2, target: '지금 확인' },
              { n: 3, target: '외부 채널 저장' },
              { n: 4, target: { text: '상담 알림 받을 번호', closest: 'h2' }, place: 'left' },
              { n: 5, target: '번호 추가' },
            ],
          },
          steps: [
            { n: 1, title: '카카오 비즈니스폼+ 상담 동기화', text: '카카오 비즈니스폼+로 들어온 상담을 상담 요청에 자동으로 가져옵니다. 같은 상담은 두 번 들어오지 않습니다.', appendix: 'A-5' },
            { n: 2, title: '지금 확인', text: '새 응답을 바로 확인합니다.' },
            { n: 3, title: '채널 링크 · 외부 채널 저장', text: '카카오 채널 관리, 네이버 플레이스, 블로그, 인스타그램 주소를 넣고 저장하면 업무 현황의 외부 채널 카드에서 바로 열립니다.' },
            { n: 4, title: '상담 알림 받을 번호', text: '새 상담 알림톡을 받을 휴대폰 번호입니다(관리자 전용, 최대 5개). 받는 번호 수만큼 비용이 듭니다.' },
            { n: 5, title: '번호 추가 · 삭제', text: '추가하거나 지우면 바로 저장됩니다. 카카오톡을 쓰는 번호만 받을 수 있습니다.' },
          ],
        },
      ],
    },
    {
      title: '계정 권한',
      sections: [
        {
          id: 'accounts',
          title: '계정 만들기와 권한',
          adminOnly: true,
          shot: {
            path: OFFICE,
            height: 1300,
            actions: open('계정 권한'),
            marks: [
              { n: 1, target: { text: '계정 생성', closest: 'h2' }, place: 'left' },
              { n: 2, target: { contains: '역할', closest: 'label' }, place: 'left' },
              { n: 3, target: { text: '접속 권한' }, place: 'left' },
              { n: 4, target: '계정 저장' },
              { n: 5, target: { text: '계정 목록', closest: 'h2' }, place: 'left' },
            ],
          },
          steps: [
            { n: 1, title: '계정 생성', text: '이름, 로그인 이메일, 비밀번호를 넣습니다. 목록에서 수정을 누르면 계정 권한 수정으로 바뀝니다(비밀번호는 바꿀 때만 넣음).' },
            { n: 2, title: '역할', text: '실무 계정 또는 총괄 관리자입니다. 총괄 관리자는 모든 메뉴를 씁니다.' },
            { n: 3, title: '접속 권한', text: '실무 계정이 쓸 메뉴를 체크합니다. 체크하지 않은 메뉴는 그 직원의 왼쪽 메뉴에 나오지 않습니다.', appendix: 'A-1' },
            { n: 4, title: '계정 저장', text: '저장합니다. 사용을 끄면 그 계정으로 로그인할 수 없습니다.' },
            { n: 5, title: '계정 목록', text: '계정마다 역할, 사용 여부, 권한이 보이고 수정과 삭제가 있습니다.' },
          ],
          tip: '바뀐 권한은 그 직원이 다시 로그인하면 적용됩니다. 휴대폰 앱은 1시간 안에 적용됩니다.',
        },
        {
          id: 'devices',
          title: '휴대폰 로그인 기기',
          adminOnly: true,
          shot: {
            path: OFFICE,
            actions: [...open('계정 권한'), { scrollTo: { text: '휴대폰 로그인 기기' } }],
            clip: panel('휴대폰 로그인 기기'),
            marks: [
              { n: 1, target: { text: '휴대폰 로그인 기기', closest: 'h2' }, place: 'left' },
              { n: 2, target: { text: '로그인 끊기', nth: 0 } },
            ],
          },
          steps: [
            { n: 1, title: '휴대폰 로그인 기기', text: '직원 휴대폰 앱(/manager-weve-7519/m)에 로그인한 기기입니다. 로그인은 30일 유지됩니다.' },
            { n: 2, title: '로그인 끊기', text: '휴대폰을 잃어버렸거나 퇴사한 직원의 기기를 끊습니다. 늦어도 1시간 안에 로그아웃됩니다.' },
          ],
        },
      ],
    },
    {
      title: '휴지통',
      sections: [
        {
          id: 'trash',
          title: '휴지통',
          adminOnly: true,
          shot: {
            path: OFFICE,
            actions: [...open('휴지통'), { wait: 800 }],
            marks: [
              { n: 1, target: { contains: '전체', closest: 'button', nth: 0 } },
              { n: 2, target: { text: '복구', nth: 0 } },
              { n: 3, target: { text: '영구 삭제', nth: 0 }, place: 'tr' },
            ],
          },
          steps: [
            { n: 1, title: '종류', text: '전체, 상담, 고객, 현장, 매출, 재고, 협력업체로 나눠 봅니다. 줄마다 지운 날짜와 지운 사람이 나옵니다.', appendix: 'A-4' },
            { n: 2, title: '복구', text: '원래 목록으로 되돌립니다.' },
            { n: 3, title: '영구 삭제', text: '완전히 지웁니다. 되돌릴 수 없으니 한 번 더 확인합니다.' },
          ],
        },
      ],
    },
  ],
  appendix: [
    {
      id: 'A-1',
      title: '메뉴별 권한 표',
      blocks: [
        { p: '총괄 관리자는 모든 메뉴를 씁니다. 실무 계정은 계정 권한에서 체크한 메뉴만 쓰고, 체크하지 않은 메뉴는 왼쪽 메뉴에 나오지 않습니다.' },
        {
          table: {
            head: ['권한', '쓸 수 있는 것'],
            rows: [
              ['업무 현황', '업무 현황 화면과 방문 수. 일일 보고서를 고객 진행 현황에 올리려면 현장 관리 권한도 있어야 합니다.'],
              ['상담 요청', '상담 목록과 상태 바꾸기, 카카오 상담 가져오기, 휴대폰 앱의 새 상담 알림'],
              ['고객 관리', "고객 등록·수정, 알림톡 보내기, '고객 + 현장 등록'"],
              ['현장 관리', '현장 등록·수정, 고객 진행 현황 링크, 할 일·현장 기록'],
              ['견적 작업', '견적 작업 페이지와 견적 작업 설명서, 공정 일정의 업체 연락처'],
              ['매출 관리', '매출 등록·수정, 업무 현황의 금액 카드'],
              ['재고 관리 · 협력업체', '각 화면의 등록·수정'],
              ['홈페이지 · 외부 채널', '홈페이지 설정과 외부 채널 링크(홈페이지 설정 저장은 둘 중 하나만 있어도 됨)'],
              ['총괄 관리자만', '계정 권한, 휴지통(복구·영구 삭제), 상담 알림 받을 번호, 휴대폰 로그인 기기'],
            ],
          },
        },
        { p: '권한을 바꾸면 그 직원이 다시 로그인할 때 적용됩니다(휴대폰 앱은 1시간 안에). 사용을 끈 계정은 바로 로그인할 수 없습니다.' },
      ],
    },
    {
      id: 'A-2',
      title: '고객 진행 현황 링크가 만들어지고 닫히는 규칙',
      blocks: [
        { h: '언제 만들어지나요?' },
        { p: "일일 보고서에서 처음 '고객 진행 현황에 올리기'로 올릴 때, 고객 휴대폰 번호가 있으면 자동으로 만들어집니다. 이미 '완료'인 현장은 만들어지지 않습니다." },
        { h: '언제 닫히나요?' },
        {
          table: {
            head: ['상황', '링크'],
            rows: [
              ["현장 상태를 '완료'로 저장", '자동으로 닫힘'],
              ["직원이 '링크 끄기'", "닫힘. 기록을 올려도 다시 켜지지 않으니 '링크 켜기'로 켭니다."],
              ["'새 링크로 바꾸기'", '예전 링크와 고객 확인 기록이 모두 무효가 되고 새 주소가 생깁니다.'],
            ],
          },
        },
        { h: '고객은 어떻게 들어오나요?' },
        { p: '링크를 열고 휴대폰 번호 뒷자리 4자리를 넣습니다. 한 번 맞히면 그 휴대폰에서는 180일 동안 다시 묻지 않습니다. 연락처나 링크가 바뀌면 다시 확인합니다.' },
        { h: '번호를 여러 번 틀리면?' },
        { p: "5번 틀리면 15분 동안 잠기고, 그다음 잠길 때마다 30분, 1시간 … 최대 24시간까지 늘어납니다. 맞게 넣거나 새 링크로 바꾸면 처음부터 다시 셉니다. 급하면 '새 링크로 바꾸기'로 새 주소를 보내 주세요." },
        { p: '직원 화면에는 고객이 마지막으로 들어온 때와 잠긴 시간만 나오고, 링크 코드나 번호는 나오지 않습니다.' },
      ],
    },
    {
      id: 'A-3',
      title: '일일 보고서를 고객에게 올릴 때',
      blocks: [
        { h: '고객에게 보이는 것' },
        { list: ['보고서 날짜와 담당 디자이너', "'고객에게 보이는 내용' 칸의 글", '체크한 사진(작게 줄여서)', '견적 작업 페이지의 공정 일정: 공정 이름, 날짜, 진행률, 색, 휴일'] },
        { h: '고객에게 절대 보이지 않는 것' },
        { list: ['견적 금액, 단가, 원가, 마진', '협력업체 이름과 연락처, 담당 작업자', '공정 일정의 메모, 할 일·현장 기록', '보고서 이미지 자체와 고객 전화번호'] },
        { h: '알아 둘 것' },
        { list: ['알림톡은 저절로 가지 않습니다. 올릴 때 체크하거나 기록 목록에서 보냅니다.', '같은 내용은 두 번 올라가지 않습니다. 사진, 글, 날짜를 바꾸면 새 기록으로 올라갑니다.', '기록을 지우면 고객 화면에서도 바로 사라지고 사진도 함께 지워집니다.', "'고객에게 보이는 내용'을 고쳐도 보고서 이미지는 바뀌지 않습니다."] },
      ],
    },
    {
      id: 'A-4',
      title: '휴지통과 완전 삭제',
      blocks: [
        { p: "목록의 '삭제'는 기록을 휴지통으로 옮깁니다. 휴지통은 총괄 관리자만 열고, 복구와 영구 삭제도 총괄 관리자만 합니다." },
        {
          table: {
            head: ['무엇을', '어떻게 되나요'],
            rows: [
              ['상담·고객·현장·매출·재고·협력업체', "'삭제'하면 휴지통으로 가고, '복구'하면 원래 목록으로 돌아옵니다."],
              ['영구 삭제', '휴지통에서도 사라지고 되돌릴 수 없습니다.'],
              ['현장을 영구 삭제', '그 현장의 고객 진행 현황 기록과 사진, 할 일·현장 기록도 함께 지워집니다.'],
              ['견적 버전이 있는 현장', '지울 수 없습니다. 견적 작업 페이지에서 견적 버전을 먼저 지웁니다.'],
              ['견적 버전, 홈페이지 Project', '휴지통으로 가지 않습니다. 지우면 바로 사라지니 조심하세요.'],
            ],
          },
        },
      ],
    },
    {
      id: 'A-5',
      title: '새 상담이 들어오면',
      blocks: [
        { h: '홈페이지 상담 신청' },
        { list: ['상담 요청에 바로 저장됩니다.', "'상담 알림 받을 번호'로 알림톡이 가고, 홈페이지 기본 정보의 상담문의 이메일로 메일이 갑니다.", '휴대폰 앱에서 새 상담 알림을 켠 직원에게 알림이 갑니다(이름·번호·내용은 알림에 나오지 않음).'] },
        { h: '카카오 비즈니스폼+' },
        { list: ["10분마다 자동으로 가져오고, 매니저가 열려 있으면 5분마다 한 번 더 확인합니다. 외부 채널의 '지금 확인'은 바로 가져옵니다.", '같은 응답은 두 번 들어오지 않습니다. 휴대폰 앱 알림만 갑니다.'] },
        { h: '장난 신청을 막는 규칙' },
        { p: '같은 번호로 10분 안에 다시 신청하면 저장하지 않고, 한 곳에서 한 시간에 5번까지만 받습니다. 빠르게 자동으로 채운 신청도 막습니다.' },
      ],
    },
  ],
};
