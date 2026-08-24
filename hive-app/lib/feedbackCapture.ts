import { Platform } from 'react-native';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import type { SelectedImage } from './imagePicker';

export type FeedbackCaptureResult =
  | { status: 'captured'; image: SelectedImage; dispose?: () => void }
  | { status: 'unsupported' | 'declined' | 'failed' };

let nativeCaptureTarget: { current: unknown } | null = null;

export function registerFeedbackCaptureTarget(ref: { current: unknown } | null): void {
  nativeCaptureTarget = ref;
}

async function captureNative(): Promise<FeedbackCaptureResult> {
  if (!nativeCaptureTarget?.current) return { status: 'unsupported' };
  try {
    const uri = await captureRef(nativeCaptureTarget.current as never, {
      format: 'jpg',
      quality: 0.82,
      result: 'tmpfile',
    });
    return {
      status: 'captured',
      image: {
        uri,
        width: 0,
        height: 0,
        fileName: `hive-screenshot-${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
      },
      dispose: () => releaseCapture(uri),
    };
  } catch {
    return { status: 'failed' };
  }
}

async function captureWeb(): Promise<FeedbackCaptureResult> {
  const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (!mediaDevices?.getDisplayMedia || typeof document === 'undefined') {
    return { status: 'unsupported' };
  }

  let stream: MediaStream | null = null;
  try {
    // The browser's own chooser is intentionally unavoidable. It may let the
    // member choose a tab, window, or screen, so the form always previews it.
    stream = await mediaDevices.getDisplayMedia({ video: true, audio: false });
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    if (!video.videoWidth || !video.videoHeight) throw new Error('No video frame');

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas context');
    context.drawImage(video, 0, 0);
    video.pause();
    video.srcObject = null;

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob) throw new Error('Could not encode frame');
    const uri = URL.createObjectURL(blob);
    return {
      status: 'captured',
      image: {
        uri,
        width: canvas.width,
        height: canvas.height,
        fileName: `hive-screenshot-${Date.now()}.jpg`,
        fileSize: blob.size,
        mimeType: 'image/jpeg',
      },
      dispose: () => URL.revokeObjectURL(uri),
    };
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    return { status: name === 'NotAllowedError' || name === 'AbortError' ? 'declined' : 'failed' };
  } finally {
    // A one-frame capture must never leave the screen-sharing indicator/tracks on.
    stream?.getTracks().forEach((track) => track.stop());
  }
}

export async function captureFeedbackScreenshot(): Promise<FeedbackCaptureResult> {
  return Platform.OS === 'web' ? captureWeb() : captureNative();
}
