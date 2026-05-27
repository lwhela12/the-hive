import { useCallback, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import type { SelectedFile } from '../filePicker';
import type { SelectedImage } from '../imagePicker';
import { getShortVideoLimitLabel, partitionAllowedShortVideos } from '../mediaAttachments';
import { fileToSelectedFile, fileToSelectedImage, isImageFile } from '../webFileAttachments';

const DEFAULT_MAX_IMAGES = 5;
const DEFAULT_MAX_FILES = 5;

interface UseWebAttachmentDropZoneOptions {
  selectedImages: SelectedImage[];
  selectedFiles?: SelectedFile[];
  onImagesChange: (images: SelectedImage[]) => void;
  onFilesChange?: (files: SelectedFile[]) => void;
  maxImages?: number;
  maxFiles?: number;
  disabled?: boolean;
}

function dataTransferHasFiles(event: any) {
  const types = event?.dataTransfer?.types;
  if (!types) return true;

  if (typeof types.contains === 'function') {
    return types.contains('Files');
  }

  return Array.from(types).includes('Files');
}

export function useWebAttachmentDropZone({
  selectedImages,
  selectedFiles = [],
  onImagesChange,
  onFilesChange,
  maxImages = DEFAULT_MAX_IMAGES,
  maxFiles = DEFAULT_MAX_FILES,
  disabled = false,
}: UseWebAttachmentDropZoneOptions) {
  const [isDragActive, setIsDragActive] = useState(false);
  const dragDepthRef = useRef(0);

  const attachDroppedFiles = useCallback(async (files: File[]) => {
    if (disabled || files.length === 0) return;

    const imageSlots = Math.max(0, maxImages - selectedImages.length);
    const fileSlots = Math.max(0, maxFiles - selectedFiles.length);
    const droppedImages = files.filter(isImageFile).slice(0, imageSlots);
    const droppedFiles = onFilesChange
      ? files.filter((file) => !isImageFile(file)).slice(0, fileSlots)
      : [];

    if (droppedImages.length > 0) {
      const images = await Promise.all(droppedImages.map(fileToSelectedImage));
      onImagesChange([...selectedImages, ...images].slice(0, maxImages));
    }

    if (droppedFiles.length > 0 && onFilesChange) {
      const fileAttachments = droppedFiles.map(fileToSelectedFile);
      const { accepted, rejected } = partitionAllowedShortVideos(fileAttachments);
      if (rejected.length > 0) {
        Alert.alert('Video Too Large', `Please choose short clips: ${getShortVideoLimitLabel()}.`);
      }
      if (accepted.length > 0) {
        onFilesChange([...selectedFiles, ...accepted].slice(0, maxFiles));
      }
    }
  }, [
    disabled,
    maxFiles,
    maxImages,
    onFilesChange,
    onImagesChange,
    selectedFiles,
    selectedImages,
  ]);

  const dragDropProps = Platform.OS === 'web'
    ? ({
        onDragEnter: (event: any) => {
          if (disabled || !dataTransferHasFiles(event)) return;
          event.preventDefault?.();
          event.stopPropagation?.();
          dragDepthRef.current += 1;
          setIsDragActive(true);
        },
        onDragOver: (event: any) => {
          if (disabled || !dataTransferHasFiles(event)) return;
          event.preventDefault?.();
          event.stopPropagation?.();
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
          setIsDragActive(true);
        },
        onDragLeave: (event: any) => {
          if (!dataTransferHasFiles(event)) return;
          event.preventDefault?.();
          event.stopPropagation?.();
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) {
            setIsDragActive(false);
          }
        },
        onDrop: async (event: any) => {
          if (!dataTransferHasFiles(event)) return;
          event.preventDefault?.();
          event.stopPropagation?.();
          dragDepthRef.current = 0;
          setIsDragActive(false);
          await attachDroppedFiles(Array.from(event.dataTransfer?.files ?? []));
        },
      } as any)
    : {};

  return {
    attachDroppedFiles,
    dragDropProps,
    isDragActive,
  };
}
