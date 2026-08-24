export const MAX_FEEDBACK_ATTACHMENTS = 6;
export const MAX_FEEDBACK_ATTACHMENT_BYTES = 10 * 1024 * 1024;
// Resend caps the Base64-encoded attachments at 40MB. 25MiB of source bytes
// expands to about 33.4MiB, leaving room instead of failing after the row saves.
export const MAX_FEEDBACK_ATTACHMENT_TOTAL_BYTES = 25 * 1024 * 1024;

export type FeedbackAttachment = {
  id: string;
  url: string;
  filename: string;
  size: number;
  mime_type: string;
  width?: number;
  height?: number;
};

export class FeedbackAttachmentValidationError extends Error {}

/** Convert the app's legacy public-shaped URL into a private bucket object key. */
export function feedbackAttachmentStoragePath(
  rawUrl: unknown,
  userId: string,
  supabaseUrl: string,
): string | null {
  if (typeof rawUrl !== 'string' || !supabaseUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (url.origin !== new URL(supabaseUrl).origin) return null;

    const marker = '/storage/v1/object/public/attachments/';
    if (!url.pathname.startsWith(marker)) return null;

    const path = decodeURIComponent(url.pathname.slice(marker.length));
    const segments = path.split('/');
    const [owner, ...rest] = segments;
    if (
      owner !== userId ||
      rest.length === 0 ||
      segments.some((segment) => !segment || segment === '.' || segment === '..' || /[\\\0]/.test(segment))
    ) {
      return null;
    }
    return path;
  } catch {
    return null;
  }
}

export function validateFeedbackAttachmentList(raw: unknown): unknown[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw new FeedbackAttachmentValidationError('Attachments must be a list');
  }
  if (raw.length > MAX_FEEDBACK_ATTACHMENTS) {
    throw new FeedbackAttachmentValidationError(`You can attach up to ${MAX_FEEDBACK_ATTACHMENTS} things`);
  }
  return raw;
}

export function addFeedbackAttachmentBytes(size: number, totalSoFar: number): number {
  const nextTotal = totalSoFar + size;
  if (size > MAX_FEEDBACK_ATTACHMENT_BYTES || nextTotal > MAX_FEEDBACK_ATTACHMENT_TOTAL_BYTES) {
    throw new FeedbackAttachmentValidationError('The attachments are too large');
  }
  return nextTotal;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Email mentions only attached bytes; it never embeds a storage URL. */
export function feedbackAttachmentsHtml(attachments: FeedbackAttachment[]): string {
  if (attachments.length === 0) return '';
  const items = attachments
    .map((attachment) => `<li style="margin:6px 0;">📎 ${escapeHtml(attachment.filename)}</li>`)
    .join('');
  return `
    <p style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#8e7a5e;margin:20px 0 0;">
      Attached to this email
    </p>
    <ul style="padding-left:20px;margin:8px 0 0;font-size:13px;color:#313130;">${items}</ul>`;
}
