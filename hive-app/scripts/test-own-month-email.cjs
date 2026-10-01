const assert = require('node:assert/strict');
const { test } = require('node:test');
const { isOwnMonthEmailPreview, wasOwnMonthEmailSent } = require('../lib/ownMonthEmail.ts');

const surveyId = 'current-month-survey';
const period = '2026-09';
const preview = { survey_id: surveyId, mode: 'self_only', members: 1,
  answered: 1, would_reach: 1, review_period: period, meeting_now: false };

test('owner preview accepts one address even when its prior check-in is answered', () => {
  assert.equal(isOwnMonthEmailPreview(preview, surveyId, period), true);
});

test('owner preview refuses a campaign, a second recipient, a prior receipt, or another period', () => {
  for (const change of [
    { mode: 'all_eligible' }, { members: 2 }, { would_reach: 2 },
    { would_reach: 0 }, { review_period: '2026-10' },
    { survey_id: 'different-survey' }, { meeting_now: true },
  ]) assert.equal(isOwnMonthEmailPreview({ ...preview, ...change }, surveyId, period), false);
});

test('send confirmation requires exactly one real email and its receipt', () => {
  const result = { survey_id: surveyId, mode: 'self_only', review_period: period, emailed: 1, claimed: 1 };
  assert.equal(wasOwnMonthEmailSent(result, surveyId, period), true);
  for (const change of [
    { mode: 'all_eligible' }, { emailed: 0 }, { emailed: 2 },
    { claimed: 0 }, { claimed: 2 }, { review_period: '2026-10' },
    { survey_id: 'different-survey' },
  ]) assert.equal(wasOwnMonthEmailSent({ ...result, ...change }, surveyId, period), false);
});
