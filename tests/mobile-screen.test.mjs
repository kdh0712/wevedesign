import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REPORT_BUSY_NOTICE,
  createBackGuard,
  freshScreen,
  movedConsultationNotice,
  reportLeaveDecision,
  syncedMemoDraft,
} from '../app/manager-weve-7519/m/mobile-screen.ts';

test('a sign-out starts the next login on a clean screen', () => {
  assert.deepEqual(freshScreen(), { tab: 'today', siteId: null, reportSiteId: null, loadError: '' });
  const a = freshScreen();
  a.siteId = 'x';
  assert.equal(freshScreen().siteId, null, 'each call is a new object');
});

test('leaving the report tab: free when empty, asked when written, blocked while uploading', () => {
  assert.equal(reportLeaveDecision({ tab: 'today', reportDirty: true, reportBusy: true }), 'go');
  assert.equal(reportLeaveDecision({ tab: 'report', reportDirty: false, reportBusy: false }), 'go');
  assert.equal(reportLeaveDecision({ tab: 'report', reportDirty: true, reportBusy: false }), 'ask');
  assert.equal(reportLeaveDecision({ tab: 'report', reportDirty: true, reportBusy: true }), 'blocked');
  assert.equal(reportLeaveDecision({ tab: 'report', reportDirty: false, reportBusy: true }), 'blocked');
  assert.match(REPORT_BUSY_NOTICE, /올리는 중/);
});

test('a status change that moves the card to another group says where it went', () => {
  assert.equal(movedConsultationNotice('홍길동', '신규', 'new'), null);
  assert.equal(movedConsultationNotice('홍길동', '상담중', 'new'), '홍길동 상담을 진행 묶음으로 옮겼어요.');
  assert.equal(movedConsultationNotice('홍길동', '계약', 'open'), '홍길동 상담을 끝남 묶음으로 옮겼어요.');
  assert.equal(movedConsultationNotice('홍길동', '견적', 'open'), null);
  assert.equal(movedConsultationNotice('홍길동', '신규', 'done'), '홍길동 상담을 신규 묶음으로 옮겼어요.');
});

test('a reloaded memo replaces the draft only when the draft was not being edited', () => {
  assert.equal(syncedMemoDraft('옛 메모', '옛 메모', '새 메모'), '새 메모');
  assert.equal(syncedMemoDraft('옛 메모 ', '옛 메모', '새 메모'), '새 메모', 'spaces alone are not an edit');
  assert.equal(syncedMemoDraft('쓰는 중', '옛 메모', '새 메모'), '쓰는 중');
  assert.equal(syncedMemoDraft('', '', 'PC에서 쓴 메모'), 'PC에서 쓴 메모');
});

function fakeHistory() {
  const entries = [{ state: null }];
  let index = 0;
  const pending = [];
  return {
    get length() {
      return entries.length;
    },
    get state() {
      return entries[index].state;
    },
    pushState(state) {
      entries.splice(index + 1);
      entries.push({ state });
      index += 1;
    },
    back() {
      pending.push(() => {
        index -= 1;
      });
    },
    // The browser runs back() later and then fires popstate.
    flush(onPop) {
      while (pending.length > 0) {
        pending.shift()();
        onPop();
      }
    },
    // The Android back button: the browser goes back and fires popstate.
    pressBack(onPop) {
      index -= 1;
      onPop();
    },
    get index() {
      return index;
    },
  };
}

test('the site detail gets a history entry, so the back button closes it instead of the app', () => {
  const history = fakeHistory();
  const guard = createBackGuard(history);
  guard.sync(true);
  assert.equal(history.index, 1);
  guard.sync(true);
  assert.equal(history.index, 1, 'one entry however often the screen redraws');
  let closed = 0;
  history.pressBack(() => {
    if (guard.onPopState()) closed += 1;
  });
  assert.equal(closed, 1);
  assert.equal(history.index, 0);
  guard.sync(false);
  assert.equal(history.index, 0, 'the entry is already gone');
});

test('closing the detail on screen takes its history entry back without closing anything twice', () => {
  const history = fakeHistory();
  const guard = createBackGuard(history);
  guard.sync(true);
  guard.sync(false);
  let closed = 0;
  history.flush(() => {
    if (guard.onPopState()) closed += 1;
  });
  assert.equal(history.index, 0);
  assert.equal(closed, 0);
  // A back press now leaves the app as usual: no entry is left behind.
  guard.sync(true);
  assert.equal(history.index, 1);
});

test('a popstate that is not ours is left alone', () => {
  const history = fakeHistory();
  const guard = createBackGuard(history);
  assert.equal(guard.onPopState(), false);
});
