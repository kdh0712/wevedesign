import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACQUISITION_OTHER_EMPTY_MESSAGE,
  ACQUISITION_OTHER_TOO_LONG_MESSAGE,
  ACQUISITION_PICK_MESSAGE,
  DEFAULT_ACQUISITION_OPTIONS,
  OTHER_OPTION_ID,
  OTHER_OPTION_LABEL,
  acquisitionAnswerText,
  cleanOtherText,
  needsAcquisitionSurvey,
  normalizeAcquisitionOptions,
  parseAcquisitionChoice,
  readSiteAcquisition,
  showAcquisitionSurvey,
  surveyOptions,
} from '../app/lib/acquisition.ts';

const ids = () => {
  let n = 0;
  return () => `opt-new${++n}`;
};
const answered = (overrides = {}) => ({ status: 'answered', optionId: 'instagram', label: '인스타그램', by: 'customer', at: '2026-10-23T05:00:00.000Z', ...overrides });

test('the starting options are the channels the company advertises on, then the other ways people come', () => {
  assert.deepEqual(
    DEFAULT_ACQUISITION_OPTIONS.map((option) => option.label),
    ['네이버 플레이스', '홈페이지·검색', '블로그', '인스타그램', '유튜브', '당근마켓', '집닥', '카카오톡', '지인 소개', '예전 고객', '지나가다 봤어요'],
  );
  assert.deepEqual(
    DEFAULT_ACQUISITION_OPTIONS.map((option) => option.id),
    ['naver-place', 'homepage', 'blog', 'instagram', 'youtube', 'daangn', 'zipdoc', 'kakaotalk', 'friend', 'returning', 'walk-in'],
  );
  assert.equal(OTHER_OPTION_ID, 'other');
  assert.equal(OTHER_OPTION_LABEL, '기타');
});

test('normalizeAcquisitionOptions trims labels, keeps valid ids and hidden, and gives the rest new ids', () => {
  const result = normalizeAcquisitionOptions(
    [
      { id: 'instagram', label: '  인스타그램 ', hidden: true },
      { id: 'Bad Id!', label: '유튜브' },
      { label: '전단지' },
      { id: 'instagram', label: '인스타 광고' },
    ],
    ids(),
  );
  assert.deepEqual(result, {
    ok: true,
    options: [
      { id: 'instagram', label: '인스타그램', hidden: true },
      { id: 'opt-new1', label: '유튜브' },
      { id: 'opt-new2', label: '전단지' },
      { id: 'opt-new3', label: '인스타 광고' },
    ],
  });
});

test('normalizeAcquisitionOptions refuses bad labels, duplicates, 기타, too many options and bad input', () => {
  const error = (input) => normalizeAcquisitionOptions(input, ids());
  assert.deepEqual(error([{ label: '   ' }]), { ok: false, error: '보기 이름은 1-12자로 적어 주세요.' });
  assert.deepEqual(error([{ label: '열세글자짜리보기이름입니다' }]), { ok: false, error: '보기 이름은 1-12자로 적어 주세요.' });
  assert.equal(error([{ label: '열두글자짜리보기이름이에' }]).ok, true, '12 characters fit');
  assert.deepEqual(error([{ label: '인스타그램' }, { label: '인스타 그램' }]), { ok: false, error: "'인스타 그램' 보기가 이미 있어요." });
  assert.deepEqual(error([{ label: ' 기 타 ' }]), { ok: false, error: "'기타'는 따로 둘 수 없어요. 맨 아래에 항상 있어요." });
  assert.deepEqual(error([{ id: 'other', label: '기타 채널' }]), { ok: false, error: "'기타'는 따로 둘 수 없어요. 맨 아래에 항상 있어요." });
  assert.deepEqual(error(Array.from({ length: 21 }, (_, index) => ({ label: `보기${index}` }))), { ok: false, error: '보기는 최대 20개까지 둘 수 있어요.' });
  assert.equal(error(Array.from({ length: 20 }, (_, index) => ({ label: `보기${index}` }))).ok, true);
  assert.deepEqual(error('not a list'), { ok: false, error: '보기 목록 형식이 올바르지 않습니다.' });
  assert.deepEqual(error([null]), { ok: false, error: '보기 목록 형식이 올바르지 않습니다.' });
});

test('surveyOptions leaves out hidden options and always ends with 기타', () => {
  assert.deepEqual(
    surveyOptions([
      { id: 'a', label: '가' },
      { id: 'b', label: '나', hidden: true },
      { id: 'c', label: '다' },
    ]),
    [
      { id: 'a', label: '가' },
      { id: 'c', label: '다' },
      { id: 'other', label: '기타' },
    ],
  );
});

test('readSiteAcquisition accepts only a well-formed answer or skip', () => {
  for (const value of [undefined, null, 'x', {}, { status: 'answered' }, { status: 'weird', by: 'customer', at: 'x' }, { status: 'skipped', by: 'robot', at: 'x' }]) {
    assert.equal(readSiteAcquisition(value), null, JSON.stringify(value));
  }
  assert.deepEqual(readSiteAcquisition(answered()), answered());
  const skipped = { status: 'skipped', by: 'customer', at: '2026-10-23T05:00:00.000Z' };
  assert.deepEqual(readSiteAcquisition(skipped), skipped);
});

test('needsAcquisitionSurvey asks only while the site has no answer and no skip', () => {
  assert.equal(needsAcquisitionSurvey({}), true);
  assert.equal(needsAcquisitionSurvey({ acquisition: null }), true);
  assert.equal(needsAcquisitionSurvey({ acquisition: { status: 'skipped', by: 'customer', at: '2026-10-23T05:00:00.000Z' } }), false);
  assert.equal(needsAcquisitionSurvey({ acquisition: answered({ by: 'staff', staffId: 'kim' }) }), false);
});

test('cleanOtherText makes one tidy line', () => {
  assert.equal(cleanOtherText('  친구\n추천\t받음  '), '친구 추천 받음');
  assert.equal(cleanOtherText('a\u0000b\u007fc'), 'abc');
  assert.equal(cleanOtherText(42), '');
});

test('parseAcquisitionChoice checks the option and the 기타 text', () => {
  const options = [...DEFAULT_ACQUISITION_OPTIONS.map((option) => (option.id === 'walk-in' ? { ...option, hidden: true } : option))];
  assert.deepEqual(parseAcquisitionChoice({ optionId: 'instagram' }, options, { allowHidden: false }), {
    ok: true,
    choice: { optionId: 'instagram', label: '인스타그램' },
  });
  assert.deepEqual(parseAcquisitionChoice({ optionId: 'walk-in' }, options, { allowHidden: false }), { ok: false, error: ACQUISITION_PICK_MESSAGE });
  assert.deepEqual(parseAcquisitionChoice({ optionId: 'walk-in' }, options, { allowHidden: true }), {
    ok: true,
    choice: { optionId: 'walk-in', label: '지나가다 봤어요' },
  });
  assert.deepEqual(parseAcquisitionChoice({ optionId: 'nope' }, options, { allowHidden: true }), { ok: false, error: ACQUISITION_PICK_MESSAGE });
  assert.deepEqual(parseAcquisitionChoice('instagram', options, { allowHidden: true }), { ok: false, error: ACQUISITION_PICK_MESSAGE });
  assert.deepEqual(parseAcquisitionChoice({ optionId: 'other', other: '  ' }, options, { allowHidden: false }), { ok: false, error: ACQUISITION_OTHER_EMPTY_MESSAGE });
  assert.deepEqual(parseAcquisitionChoice({ optionId: 'other', other: '가'.repeat(41) }, options, { allowHidden: false }), {
    ok: false,
    error: ACQUISITION_OTHER_TOO_LONG_MESSAGE,
  });
  assert.deepEqual(parseAcquisitionChoice({ optionId: 'other', other: ` ${'가'.repeat(40)}\n` }, options, { allowHidden: false }), {
    ok: true,
    choice: { optionId: 'other', label: '기타', other: '가'.repeat(40) },
  });
  assert.equal(ACQUISITION_PICK_MESSAGE, '보기를 다시 골라 주세요.');
  assert.equal(ACQUISITION_OTHER_EMPTY_MESSAGE, "'기타' 내용을 적어 주세요.");
  assert.equal(ACQUISITION_OTHER_TOO_LONG_MESSAGE, "'기타' 내용은 40자 이내로 적어 주세요.");
});

test('acquisitionAnswerText follows renames, falls back to the stored label and spells out 기타 and 건너뜀', () => {
  const options = [{ id: 'instagram', label: '인스타그램' }];
  assert.equal(acquisitionAnswerText(answered({ label: '인스타' }), options), '인스타그램');
  assert.equal(acquisitionAnswerText(answered({ optionId: 'gone', label: '전단지' }), options), '전단지');
  assert.equal(acquisitionAnswerText(answered({ optionId: 'other', label: '기타', other: '친구 추천' }), options), '기타 · 친구 추천');
  assert.equal(acquisitionAnswerText({ status: 'skipped', by: 'customer', at: 'x' }, options), '건너뜀');
});

test('showAcquisitionSurvey lets a customer see the progress first when saving the answer keeps failing', () => {
  assert.equal(showAcquisitionSurvey({}, undefined), true);
  assert.equal(showAcquisitionSurvey({}, '1'), false, '?later=1 skips the question for this visit');
  assert.equal(showAcquisitionSurvey({}, ['1']), true, 'only a plain later=1 counts');
  assert.equal(showAcquisitionSurvey({ acquisition: { status: 'skipped', by: 'customer', at: 'x' } }, undefined), false);
});
