import { Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { SelectedFile } from './filePicker';
import {
  getShortVideoLimitLabel,
  partitionAllowedShortVideos,
  SHORT_VIDEO_MAX_DURATION_SECONDS,
} from './mediaAttachments';

const DEFAULT_VIDEO_MIME_TYPE = 'video/mp4';

export interface PickVideosOptions {
  maxVideos?: number;
}

async function requestVideoPermission() {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (status !== 'granted') {
    Alert.alert(
      'Permission Required',
      'Please allow access to your photo library to attach video clips.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]
    );
    return false;
  }

  return true;
}

function assetToSelectedVideo(asset: ImagePicker.ImagePickerAsset, index: number): SelectedFile {
  return {
    uri: asset.uri,
    name: asset.fileName ?? `video-${Date.now()}-${index + 1}.mp4`,
    size: asset.fileSize,
    mimeType: asset.mimeType ?? DEFAULT_VIDEO_MIME_TYPE,
    file: asset.file,
    duration: asset.duration ?? undefined,
  };
}

function keepAllowedVideos(videos: SelectedFile[]) {
  const { accepted, rejected } = partitionAllowedShortVideos(videos);

  if (rejected.length > 0) {
    Alert.alert(
      'Video Too Long',
      `Please choose short clips: ${getShortVideoLimitLabel()}.`
    );
  }

  return accepted;
}

export async function pickMultipleVideos(options: PickVideosOptions = {}): Promise<SelectedFile[]> {
  const hasPermission = await requestVideoPermission();
  if (!hasPermission) return [];

  const maxVideos = Math.max(1, options.maxVideos ?? 5);
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    allowsMultipleSelection: true,
    selectionLimit: maxVideos,
    orderedSelection: true,
    videoMaxDuration: SHORT_VIDEO_MAX_DURATION_SECONDS,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
  });

  if (result.canceled || !result.assets.length) {
    return [];
  }

  return keepAllowedVideos(result.assets.map(assetToSelectedVideo));
}

export async function takeVideo(): Promise<SelectedFile | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();

  if (status !== 'granted') {
    Alert.alert(
      'Permission Required',
      'Please allow access to your camera to record video clips.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]
    );
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['videos'],
    videoMaxDuration: SHORT_VIDEO_MAX_DURATION_SECONDS,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
  });

  if (result.canceled || !result.assets[0]) {
    return null;
  }

  return keepAllowedVideos([assetToSelectedVideo(result.assets[0], 0)])[0] ?? null;
}
