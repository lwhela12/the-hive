import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearFeedbackDraft,
  consumeFeedbackDraft,
  handOffFeedbackDraft,
  validFeedbackCaptureNotice,
} from '../../../lib/feedbackDraft.ts';

const screenshot = {
  uri: 'blob:private-screenshot',
  width: 100,
  height: 50,
  fileName: 'shot.jpg',
  mimeType: 'image/jpeg',
};

test('feedback draft is consumed exactly once', () => {
  clearFeedbackDraft();
  handOffFeedbackDraft({ originLabel: 'Boards', screenshot });
  assert.equal(consumeFeedbackDraft()?.originLabel, 'Boards');
  assert.equal(consumeFeedbackDraft(), null);
});

test('replacing or clearing a pending draft releases its private screenshot', () => {
  clearFeedbackDraft();
  let disposed = 0;
  handOffFeedbackDraft({ originLabel: 'Home', screenshot, dispose: () => { disposed += 1; } });
  handOffFeedbackDraft({ originLabel: 'Messages', screenshot, dispose: () => { disposed += 1; } });
  assert.equal(disposed, 1);
  clearFeedbackDraft();
  assert.equal(disposed, 2);
});

test('capture fallback notices accept only truthful known states', () => {
  assert.equal(validFeedbackCaptureNotice('declined'), 'declined');
  assert.equal(validFeedbackCaptureNotice('made-up'), null);
  assert.equal(validFeedbackCaptureNotice(['failed']), null);
});
