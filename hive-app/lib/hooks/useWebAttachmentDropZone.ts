import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import type { SelectedFile } from '../filePicker';
import type { SelectedImage } from '../imagePicker';
import { getShortVideoLimitLabel, partitionAllowedShortVideos } from '../mediaAttachments';
import { fileToSelectedFile, fileToSelectedImage, isImageFile, partitionWebAttachments } from '../webFileAttachments';

const DEFAULT_MAX_IMAGES = 5;
const DEFAULT_MAX_FILES = 5;

interface UseWebAttachmentDropZoneOptions {
  selectedImages: SelectedImage[];
  selectedFiles?: SelectedFile[];
  onImagesChange: (images: SelectedImage[]) => void;
  onFilesChange?: (files: SelectedFile[]) => void;
  maxImages?: number;
  maxFiles?: number;
  maxAttachments?: number;
  captureDocumentDrops?: boolean;
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

/**
 * A macOS screenshot copied with Command-Shift-4/5 is an image `File` in the
 * browser clipboard, rather than text. Browsers do not all put that file in
 * the same place: Chromium exposes `clipboardData.files`, while some expose
 * it only through the clipboard items. Read both, without treating a normal
 * text paste as an attachment.
 */
function pastedImageFiles(event: any): File[] {
  const clipboardData = event?.clipboardData;
  if (!clipboardData) return [];

  const files = Array.from(clipboardData.files ?? []) as File[];
  const itemFiles = Array.from(clipboardData.items ?? [])
    .filter((item: any) => item.kind === 'file' && item.type?.startsWith('image/'))
    .map((item: any) => item.getAsFile?.())
    .filter((file: File | null): file is File => !!file);

  // The same clipboard image may appear in both lists. A File object's identity
  // is stable through this one paste event, so this keeps one preview per image.
  return Array.from(new Set([...files, ...itemFiles])).filter(isImageFile);
}

export function useWebAttachmentDropZone({
  selectedImages,
  selectedFiles = [],
  onImagesChange,
  onFilesChange,
  maxImages = DEFAULT_MAX_IMAGES,
  maxFiles = DEFAULT_MAX_FILES,
  maxAttachments,
  captureDocumentDrops = false,
  disabled = false,
}: UseWebAttachmentDropZoneOptions) {
  const [isDragActive, setIsDragActive] = useState(false);
  const dragDepthRef = useRef(0);
  const inputFocusedRef = useRef(false);

  const attachDroppedFiles = useCallback(async (files: File[]) => {
    if (disabled || files.length === 0) return;

    const totalSlots = Math.max(0, (maxAttachments ?? Number.POSITIVE_INFINITY) - selectedImages.length - selectedFiles.length);
    const imageSlots = Math.max(0, Math.min(maxImages - selectedImages.length, totalSlots));
    const fileSlots = onFilesChange ? Math.max(0, maxFiles - selectedFiles.length) : 0;
    const { imageFiles: droppedImages, documentFiles: droppedFiles } = partitionWebAttachments(
      files,
      imageSlots,
      fileSlots,
      totalSlots,
    );

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
    maxAttachments,
    onFilesChange,
    onImagesChange,
    selectedFiles,
    selectedImages,
  ]);

  const claimFileDropEvent = useCallback((event: any) => {
    if (!dataTransferHasFiles(event)) return false;
    event.preventDefault?.();
    event.stopPropagation?.();
    if (event.dataTransfer) event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
    return true;
  }, [disabled]);

  const handleDropEvent = useCallback(async (event: any) => {
    if (!claimFileDropEvent(event)) return;
    if (event.__hiveAttachmentDropHandled) return;
    event.__hiveAttachmentDropHandled = true;
    dragDepthRef.current = 0;
    setIsDragActive(false);
    if (disabled) return;
    await attachDroppedFiles(Array.from(event.dataTransfer?.files ?? []));
  }, [attachDroppedFiles, claimFileDropEvent, disabled]);

  const handlePasteEvent = useCallback((event: any) => {
    if (disabled || event.__hiveAttachmentPasteHandled) return;
    const images = pastedImageFiles(event);
    if (images.length === 0) return;

    // Do not let the browser try to insert a clipboard screenshot into the
    // textarea. Text-only pastes deliberately fall through to their normal
    // native behavior.
    event.__hiveAttachmentPasteHandled = true;
    event.preventDefault?.();
    event.stopPropagation?.();
    void attachDroppedFiles(images);
  }, [attachDroppedFiles, disabled]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !captureDocumentDrops || typeof document === 'undefined') return;

    const handleDocumentDragEnter = (event: DragEvent) => {
      if (!claimFileDropEvent(event)) return;
      if (!disabled) setIsDragActive(true);
    };
    const handleDocumentDragOver = (event: DragEvent) => {
      if (!claimFileDropEvent(event)) return;
      if (!disabled) setIsDragActive(true);
    };
    const handleDocumentDragLeave = (event: DragEvent) => {
      if (!dataTransferHasFiles(event)) return;
      const leavingWindow =
        event.clientX <= 0 ||
        event.clientY <= 0 ||
        event.clientX >= window.innerWidth ||
        event.clientY >= window.innerHeight;
      if (leavingWindow) {
        dragDepthRef.current = 0;
        setIsDragActive(false);
      }
    };
    const handleDocumentDrop = (event: DragEvent) => {
      void handleDropEvent(event);
    };

    document.addEventListener('dragenter', handleDocumentDragEnter, true);
    document.addEventListener('dragover', handleDocumentDragOver, true);
    document.addEventListener('dragleave', handleDocumentDragLeave, true);
    document.addEventListener('drop', handleDocumentDrop, true);

    return () => {
      document.removeEventListener('dragenter', handleDocumentDragEnter, true);
      document.removeEventListener('dragover', handleDocumentDragOver, true);
      document.removeEventListener('dragleave', handleDocumentDragLeave, true);
      document.removeEventListener('drop', handleDocumentDrop, true);
    };
  }, [attachDroppedFiles, captureDocumentDrops, claimFileDropEvent, disabled, handleDropEvent]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !captureDocumentDrops || typeof document === 'undefined') return;

    // `TextInput` is a React Native abstraction. On some web builds it keeps a
    // DOM `paste` handler from reaching the underlying textarea, so listen at
    // the document capture phase instead. The focus guard makes this belong to
    // the composer being typed in, not every attachment-enabled field on page.
    const handleDocumentPaste = (event: ClipboardEvent) => {
      if (!inputFocusedRef.current) return;
      handlePasteEvent(event);
    };

    document.addEventListener('paste', handleDocumentPaste, true);
    return () => document.removeEventListener('paste', handleDocumentPaste, true);
  }, [captureDocumentDrops, handlePasteEvent]);

  const dragDropProps = Platform.OS === 'web'
    ? ({
        onDragEnter: (event: any) => {
          if (!claimFileDropEvent(event) || disabled) return;
          dragDepthRef.current += 1;
          setIsDragActive(true);
        },
        onDragOver: (event: any) => {
          if (!claimFileDropEvent(event) || disabled) return;
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
          await handleDropEvent(event);
        },
      } as any)
    : {};

  return {
    attachDroppedFiles,
    dragDropProps,
    isDragActive,
    inputFocusProps: Platform.OS === 'web'
      ? ({
          onFocus: () => { inputFocusedRef.current = true; },
          onBlur: () => { inputFocusedRef.current = false; },
        } as any)
      : {},
    pasteProps: Platform.OS === 'web' ? ({ onPaste: handlePasteEvent } as any) : {},
  };
}
