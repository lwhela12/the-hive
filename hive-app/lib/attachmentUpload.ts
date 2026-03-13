import { Platform } from 'react-native';
import { supabase } from './supabase';
import { Attachment } from '../types';
import { SelectedImage, getImageExtension, getContentType } from './imagePicker';

// Generate a UUID v4
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface UploadProgress {
  current: number;
  total: number;
}

export interface UploadResult {
  success: boolean;
  attachments: Attachment[];
  errors: string[];
}

/**
 * Upload a single image to Supabase Storage
 */
export async function uploadSingleImage(
  userId: string,
  image: SelectedImage
): Promise<Attachment | null> {
  try {
    const id = generateUUID();
    const ext = getImageExtension(image.uri, image.mimeType);
    const fileName = `${userId}/${id}.${ext}`;
    const contentType = getContentType(ext);

    let uploadBody: Blob | FormData;
    let fileSize = image.fileSize ?? 0;

    if (Platform.OS !== 'web') {
      // On native iOS/Android, use FormData with the file URI directly.
      // fetch(fileUri).blob() can return empty data on iOS.
      const formData = new FormData();
      formData.append('file', {
        uri: image.uri,
        name: `${id}.${ext}`,
        type: contentType,
      } as any);
      uploadBody = formData;
    } else {
      // On web, fetch and convert to blob works fine
      const response = await fetch(image.uri);
      const blob = await response.blob();
      fileSize = fileSize || blob.size;
      uploadBody = blob;
    }

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(fileName, uploadBody, {
        cacheControl: '3600',
        upsert: false,
        contentType: Platform.OS !== 'web' ? contentType : undefined,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return null;
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('attachments')
      .getPublicUrl(fileName);

    const url = urlData.publicUrl;

    return {
      id,
      url,
      filename: image.fileName ?? `image.${ext}`,
      size: fileSize,
      mime_type: contentType,
      width: image.width,
      height: image.height,
    };
  } catch (error) {
    console.error('Error uploading image:', error);
    return null;
  }
}

/**
 * Upload multiple images to Supabase Storage
 * Returns an array of successfully uploaded attachments
 */
export async function uploadMultipleImages(
  userId: string,
  images: SelectedImage[],
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  const attachments: Attachment[] = [];
  const errors: string[] = [];

  for (let i = 0; i < images.length; i++) {
    onProgress?.({ current: i + 1, total: images.length });

    const attachment = await uploadSingleImage(userId, images[i]);

    if (attachment) {
      attachments.push(attachment);
    } else {
      errors.push(`Failed to upload image ${i + 1}`);
    }
  }

  return {
    success: errors.length === 0,
    attachments,
    errors,
  };
}

/**
 * Delete an attachment from Supabase Storage
 */
export async function deleteAttachment(
  userId: string,
  attachment: Attachment
): Promise<boolean> {
  try {
    // Extract path from URL
    // URL format: https://xxx.supabase.co/storage/v1/object/public/attachments/userId/fileId.ext?t=...
    const urlWithoutParams = attachment.url.split('?')[0];
    const pathMatch = urlWithoutParams.match(/\/attachments\/(.+)$/);

    if (!pathMatch) {
      console.error('Could not extract path from URL');
      return false;
    }

    const filePath = pathMatch[1];

    // Verify the file belongs to this user
    if (!filePath.startsWith(userId)) {
      console.error('Cannot delete another user\'s attachment');
      return false;
    }

    const { error } = await supabase.storage
      .from('attachments')
      .remove([filePath]);

    if (error) {
      console.error('Delete error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error deleting attachment:', error);
    return false;
  }
}

/**
 * Delete multiple attachments from Supabase Storage
 */
export async function deleteMultipleAttachments(
  userId: string,
  attachments: Attachment[]
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;

  for (const attachment of attachments) {
    const success = await deleteAttachment(userId, attachment);
    if (success) {
      deleted++;
    } else {
      failed++;
    }
  }

  return { deleted, failed };
}
