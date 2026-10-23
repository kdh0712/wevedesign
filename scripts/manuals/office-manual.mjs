// 통합 매니저 사용 설명서의 내용 (spec 2026-10-23 §3.1). Each section is one page: what to open (shot), where the red
// numbers go (marks) and what each number means (steps). Targets are visible text or { selector }; see build-manuals.mjs.

const OFFICE = '/manager-weve-7519';

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
            { n: 3, title: '로그인', text: '누르면 업무 현황 화면이 열립니다. 로그인은 이 브라우저 탭에서만 8시간 유지되고, 창을 닫으면 다시 로그인합니다.' },
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
            { n: 1, title: '왼쪽 메뉴', text: '업무 묶음(업무 현황, 고객·현장, 견적 관리 …)을 고릅니다. 내 계정에 권한이 있는 메뉴만 보입니다.' },
            { n: 2, title: '머리글', text: '어느 메뉴에 있든 위쪽에 항상 보입니다.' },
            { n: 3, title: '접속자·자동 갱신', text: '홈페이지 방문자 수와 마지막 갱신 시각입니다. 화면은 30초마다 새 상담과 바뀐 내용을 스스로 불러옵니다.' },
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
  ],
  appendix: [],
};
