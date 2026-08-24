import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addFeedbackAttachmentBytes,
  FeedbackAttachmentValidationError,
  feedbackAttachmentsHtml,
  feedbackAttachmentStoragePath,
  MAX_FEEDBACK_ATTACHMENT_BYTES,
  MAX_FEEDBACK_ATTACHMENT_TOTAL_BYTES,
  validateFeedbackAttachmentList,
  type FeedbackAttachment,
} from './feedbackAttachments.ts';

const origin = 'https://project.supabase.co';
const userId = 'user-123';
const ownedUrl = `${origin}/storage/v1/object/public/attachments/${userId}/shot.jpg`;

test('accepts only a private attachment object in the authenticated member folder', () => {
  assert.equal(feedbackAttachmentStoragePath(ownedUrl, userId, origin), `${userId}/shot.jpg`);
  assert.equal(feedbackAttachmentStoragePath(ownedUrl, 'someone-else', origin), null);
  assert.equal(feedbackAttachmentStoragePath(`https://evil.example/storage/v1/object/public/attachments/${userId}/shot.jpg`, userId, origin), null);
  assert.equal(feedbackAttachmentStoragePath(`${origin}/storage/v1/object/public/attachments/${userId}/../other/shot.jpg`, userId, origin), null);
  assert.equal(feedbackAttachmentStoragePath(`${origin}/not-storage/storage/v1/object/public/attachments/${userId}/shot.jpg`, userId, origin), null);
});

test('rejects a seventh attachment and per-file or combined oversize bytes', () => {
  assert.equal(validateFeedbackAttachmentList(Array(6).fill({})).length, 6);
  assert.throws(() => validateFeedbackAttachmentList(Array(7).fill({})), FeedbackAttachmentValidationError);
  assert.equal(addFeedbackAttachmentBytes(1, 2), 3);
  assert.throws(
    () => addFeedbackAttachmentBytes(MAX_FEEDBACK_ATTACHMENT_BYTES + 1, 0),
    FeedbackAttachmentValidationError,
  );
  assert.throws(
    () => addFeedbackAttachmentBytes(1, MAX_FEEDBACK_ATTACHMENT_TOTAL_BYTES),
    FeedbackAttachmentValidationError,
  );
});

test('owner email markup names byte attachments without public or signed storage URLs', () => {
  const attachment: FeedbackAttachment = {
    id: 'one',
    url: `${ownedUrl}?token=secret`,
    filename: '<screenshot>.jpg',
    size: 12,
    mime_type: 'image/jpeg',
  };
  const html = feedbackAttachmentsHtml([attachment]);
  assert.match(html, /Attached to this email/);
  assert.match(html, /&lt;screenshot&gt;\.jpg/);
  assert.doesNotMatch(html, /supabase|token=|https?:|<img|cid:/i);
});
