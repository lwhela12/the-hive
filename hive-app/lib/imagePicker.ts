import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking, Platform } from 'react-native';

export interface SelectedImage {
  uri: string;
  width: number;
  height: number;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
}

export interface PickImagesOptions {
  maxImages?: number;
  quality?: number;
  allowsEditing?: boolean;
}

const MAX_IMAGES = 5;
const DEFAULT_QUALITY = 0.8;

/**
 * Request permission to access the media library
 * Returns true if permission was granted
 */
export async function requestMediaLibraryPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (status !== 'granted') {
    Alert.alert(
      'Permission Required',
      'Please allow access to your photo library to attach images.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]
    );
    return false;
  }

  return true;
}

/**
 * Pick a single image from the library
 */
export async function pickSingleImage(
  options: Pick<PickImagesOptions, 'quality' | 'allowsEditing'> = {}
): Promise<SelectedImage | null> {
  const hasPermission = await requestMediaLibraryPermission();
  if (!hasPermission) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: options.allowsEditing ?? false,
    quality: options.quality ?? DEFAULT_QUALITY,
  });

  if (result.canceled || !result.assets[0]) {
    return null;
  }

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    fileName: asset.fileName ?? undefined,
    fileSize: asset.fileSize ?? undefined,
    mimeType: asset.mimeType ?? undefined,
  };
}

/**
 * Pick multiple images from the library
 * Allows selecting up to maxImages (default 5)
 */
export async function pickMultipleImages(
  options: PickImagesOptions = {}
): Promise<SelectedImage[]> {
  const hasPermission = await requestMediaLibraryPermission();
  if (!hasPermission) return [];

  const maxImages = Math.min(options.maxImages ?? MAX_IMAGES, MAX_IMAGES);

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: maxImages,
    quality: options.quality ?? DEFAULT_QUALITY,
    orderedSelection: true,
  });

  if (result.canceled || !result.assets.length) {
    return [];
  }

  return result.assets.map((asset) => ({
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    fileName: asset.fileName ?? undefined,
    fileSize: asset.fileSize ?? undefined,
    mimeType: asset.mimeType ?? undefined,
  }));
}

/**
 * Take a photo using the camera
 */
export async function takePhoto(
  options: Pick<PickImagesOptions, 'quality' | 'allowsEditing'> = {}
): Promise<SelectedImage | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();

  if (status !== 'granted') {
    Alert.alert(
      'Permission Required',
      'Please allow access to your camera to take photos.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]
    );
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: options.allowsEditing ?? false,
    quality: options.quality ?? DEFAULT_QUALITY,
  });

  if (result.canceled || !result.assets[0]) {
    return null;
  }

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    fileName: asset.fileName ?? undefined,
    fileSize: asset.fileSize ?? undefined,
    mimeType: asset.mimeType ?? undefined,
  };
}

/**
 * Get file extension from URI or mime type
 */
export function getImageExtension(uri: string, mimeType?: string): string {
  if (mimeType) {
    const ext = mimeType.split('/')[1];
    if (ext === 'jpeg') return 'jpg';
    if (['jpg', 'png', 'gif', 'webp'].includes(ext)) return ext;
  }

  const ext = uri.split('.').pop()?.toLowerCase();
  if (ext && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
    return ext === 'jpeg' ? 'jpg' : ext;
  }

  return 'jpg';
}

/**
 * Get content type from extension
 */
export function getContentType(extension: string): string {
  const types: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  return types[extension.toLowerCase()] ?? 'image/jpeg';
}
