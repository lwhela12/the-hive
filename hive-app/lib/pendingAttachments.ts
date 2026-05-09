import type { SelectedImage } from './imagePicker';

// Module-level store for images picked in the floating Clive bubble.
// The bubble stores them here before navigating to the chat page,
// and ChatInput picks them up on mount then clears this store.

let _pending: SelectedImage[] = [];

export function setPendingAttachments(images: SelectedImage[]) {
  _pending = images;
}

export function takePendingAttachments(): SelectedImage[] {
  const imgs = _pending;
  _pending = [];
  return imgs;
}
