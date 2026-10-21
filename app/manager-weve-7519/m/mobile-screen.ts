// Screen rules of the staff phone app that do not need React: pure helpers shared by the tabs and Node tests.
import { consultationGroup, type ConsultationGroup, type MobileTab } from '../../lib/mobile-overview.ts';

export type ScreenState = { tab: MobileTab; siteId: string | null; reportSiteId: string | null; loadError: string };

// Where the app starts, and where it goes back to on a sign-out, so the next person to log in on this phone does not land
// on the last one's site or report.
export const freshScreen = (): ScreenState => ({ tab: 'today', siteId: null, reportSiteId: null, loadError: '' });

export const REPORT_BUSY_NOTICE = '사진을 올리는 중이에요. 다 올라갈 때까지 기다려 주세요.';
export const LEAVE_REPORT_CONFIRM = '작성 중인 보고가 있어요. 나가면 사진과 글이 사라져요. 나갈까요?';

// Leaving the report tab drops its photos and text, so a written report asks first. While photos go up the tab stays:
// leaving would not stop the upload, and the result would be shown to no one.
export function reportLeaveDecision(state: { tab: MobileTab; reportDirty: boolean; reportBusy: boolean }): 'go' | 'ask' | 'blocked' {
  if (state.tab !== 'report') return 'go';
  if (state.reportBusy) return 'blocked';
  return state.reportDirty ? 'ask' : 'go';
}

export const CONSULTATION_GROUP_LABELS: Record<ConsultationGroup, string> = { new: '신규', open: '진행', done: '끝남' };

// A status change can move the card out of the group on screen; this says where it went (null: it stays in view).
export function movedConsultationNotice(name: string, status: string, shownGroup: ConsultationGroup): string | null {
  const group = consultationGroup(status);
  return group === shownGroup ? null : `${name} 상담을 ${CONSULTATION_GROUP_LABELS[group]} 묶음으로 옮겼어요.`;
}

// The memo box follows a memo that changed elsewhere (a reload after the PC changed it), unless it is being edited.
export function syncedMemoDraft(draft: string, previousSaved: string, nextSaved: string): string {
  return draft.trim() === previousSaved.trim() ? nextSaved : draft;
}

type HistoryLike = Pick<History, 'pushState' | 'back'>;

const GUARD_KEY = 'weveMobileDetail';

// The Android back button (and the iPhone swipe) goes back in the browser history. The site detail is not a page of its
// own, so it gets one history entry while it is open: back closes the detail instead of the app. When the detail is closed
// on screen, that entry is taken back so it does not swallow the next back press.
export function createBackGuard(history: HistoryLike) {
  let pushed = false;
  let ownBacks = 0;
  return {
    sync(open: boolean) {
      if (open && !pushed) {
        history.pushState({ [GUARD_KEY]: true }, '');
        pushed = true;
      } else if (!open && pushed) {
        pushed = false;
        ownBacks += 1;
        history.back();
      }
    },
    // Called on popstate: true when the detail should close.
    onPopState(): boolean {
      if (ownBacks > 0) {
        ownBacks -= 1;
        return false;
      }
      if (!pushed) return false;
      pushed = false;
      return true;
    },
  };
}
