import { Platform } from 'react-native';
import type { SelectedFile } from './filePicker';
import type { SelectedImage } from './imagePicker';

export const isImageFile = (file: File) =>
  file.type.startsWith('image/') || /\.(gif|jpe?g|png|webp)$/i.test(file.name);

export const isVideoFile = (file: File) =>
  file.type.startsWith('video/') || /\.(avi|m4v|mkv|mov|mp4|mpeg|mpg|webm)$/i.test(file.name);

const getFallbackImageMimeType = (file: File) => {
  if (file.type) return file.type;
  if (/\.png$/i.test(file.name)) return 'image/png';
  if (/\.gif$/i.test(file.name)) return 'image/gif';
  if (/\.webp$/i.test(file.name)) return 'image/webp';
  return 'image/jpeg';
};

const readImageSize = (uri: string): Promise<{ width: number; height: number }> => {
  if (Platform.OS !== 'web' || typeof globalThis.Image === 'undefined') {
    return Promise.resolve({ width: 0, height: 0 });
  }

  return new Promise((resolve) => {
    const image = new globalThis.Image();
    image.onload = () => resolve({
      width: image.naturalWidth || image.width || 0,
      height: image.naturalHeight || image.height || 0,
    });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = uri;
  });
};

export const fileToSelectedImage = async (file: File): Promise<SelectedImage> => {
  const uri = URL.createObjectURL(file);
  const { width, height } = await readImageSize(uri);
  return {
    uri,
    width,
    height,
    fileName: file.name,
    fileSize: file.size,
    mimeType: getFallbackImageMimeType(file),
  };
};

export const fileToSelectedFile = (file: File): SelectedFile => ({
  uri: URL.createObjectURL(file),
  name: file.name || 'attachment',
  size: file.size,
  mimeType: file.type || 'application/octet-stream',
  file,
});

export const isTouchWebDevice = () => {
  if (Platform.OS !== 'web') return false;

  const maxTouchPoints = typeof navigator !== 'undefined'
    ? navigator.maxTouchPoints ?? 0
    : 0;
  const coarsePointer = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false;

  return maxTouchPoints > 0 || coarsePointer;
};
