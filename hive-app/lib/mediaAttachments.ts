import type { SelectedFile } from './filePicker';
import type { Attachment } from '../types';

export const SHORT_VIDEO_MAX_DURATION_SECONDS = 60;
export const SHORT_VIDEO_MAX_DURATION_MS = SHORT_VIDEO_MAX_DURATION_SECONDS * 1000;
export const SHORT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

type MediaCandidate = {
  duration?: number | null;
  filename?: string | null;
  mimeType?: string | null;
  mime_type?: string | null;
  name?: string | null;
  size?: number | null;
  type?: string | null;
};

const VIDEO_EXTENSION_PATTERN = /\.(avi|m4v|mkv|mov|mp4|mpeg|mpg|webm)$/i;

export function formatFileSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return '';

  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`;
}

export function getShortVideoLimitLabel() {
  return `${SHORT_VIDEO_MAX_DURATION_SECONDS} sec / ${formatFileSize(SHORT_VIDEO_MAX_BYTES)} max`;
}

export function isVideoMimeType(mimeType?: string | null) {
  return !!mimeType && mimeType.toLowerCase().startsWith('video/');
}

export function isVideoFileName(name?: string | null) {
  return !!name && VIDEO_EXTENSION_PATTERN.test(name);
}

export function isVideoCandidate(candidate: MediaCandidate) {
  return (
    isVideoMimeType(candidate.mimeType) ||
    isVideoMimeType(candidate.mime_type) ||
    isVideoMimeType(candidate.type) ||
    isVideoFileName(candidate.name) ||
    isVideoFileName(candidate.filename)
  );
}

export function isSelectedVideoFile(file: SelectedFile) {
  return isVideoCandidate(file);
}

export function isVideoAttachment(attachment: Attachment) {
  return isVideoCandidate(attachment);
}

export function getShortVideoRejectionReason(candidate: MediaCandidate) {
  if (!isVideoCandidate(candidate)) return null;

  if (typeof candidate.duration === 'number' && candidate.duration > SHORT_VIDEO_MAX_DURATION_MS) {
    return `Video clips need to be ${SHORT_VIDEO_MAX_DURATION_SECONDS} seconds or shorter.`;
  }

  if (typeof candidate.size === 'number' && candidate.size > SHORT_VIDEO_MAX_BYTES) {
    return `Video clips need to be ${formatFileSize(SHORT_VIDEO_MAX_BYTES)} or smaller.`;
  }

  return null;
}

export function partitionAllowedShortVideos<T extends MediaCandidate>(items: T[]) {
  const accepted: T[] = [];
  const rejected: T[] = [];

  items.forEach((item) => {
    const reason = getShortVideoRejectionReason(item);
    if (reason) {
      rejected.push(item);
    } else {
      accepted.push(item);
    }
  });

  return { accepted, rejected };
}

export function getSelectedFileSubtitle(file: SelectedFile) {
  if (isSelectedVideoFile(file)) {
    const size = formatFileSize(file.size);
    return size ? `Video clip - ${size}` : 'Video clip';
  }

  return file.mimeType || 'File';
}
