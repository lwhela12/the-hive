import * as DocumentPicker from 'expo-document-picker';

export interface SelectedFile {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
  file?: File;
  duration?: number;
}

const MAX_FILES = 5;

export async function pickMultipleFiles(maxFiles = MAX_FILES): Promise<SelectedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: true,
  });

  if (result.canceled || !result.assets?.length) return [];

  return result.assets.slice(0, maxFiles).map((asset) => ({
    uri: asset.uri,
    name: asset.name,
    size: asset.size,
    mimeType: asset.mimeType,
    file: asset.file,
  }));
}
