import type { SelectedImage } from './imagePicker';

export type FeedbackCaptureNotice = 'unsupported' | 'declined' | 'failed' | null;

export function validFeedbackCaptureNotice(value: unknown): FeedbackCaptureNotice {
  return value === 'unsupported' || value === 'declined' || value === 'failed' ? value : null;
}

export type FeedbackDraft = {
  originLabel: string | null;
  screenshot: SelectedImage;
  /** Releases a web blob URL. Native captures do not need it. */
  dispose?: () => void;
};

let pending: FeedbackDraft | null = null;

/** Private process-memory handoff. Never route, persist, log, or analyse its URI. */
export function handOffFeedbackDraft(next: FeedbackDraft): void {
  pending?.dispose?.();
  pending = next;
}

/** One-shot: ownership (including disposal) transfers to the feedback screen. */
export function consumeFeedbackDraft(): FeedbackDraft | null {
  const draft = pending;
  pending = null;
  return draft;
}

export function clearFeedbackDraft(): void {
  pending?.dispose?.();
  pending = null;
}
