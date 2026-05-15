type TextInputKeyEvent = {
  nativeEvent?: {
    key?: string;
    shiftKey?: boolean;
    isComposing?: boolean;
    preventDefault?: () => void;
    stopPropagation?: () => void;
  };
  key?: string;
  shiftKey?: boolean;
  isComposing?: boolean;
  preventDefault?: () => void;
  stopPropagation?: () => void;
};

export function submitOnEnter(onSubmit: () => void) {
  return (event: TextInputKeyEvent) => {
    const key = event.nativeEvent?.key ?? event.key;
    const shiftKey = event.nativeEvent?.shiftKey ?? event.shiftKey;
    const isComposing = event.nativeEvent?.isComposing ?? event.isComposing;

    if ((key !== 'Enter' && key !== 'NumpadEnter') || shiftKey || isComposing) return;

    event.preventDefault?.();
    event.nativeEvent?.preventDefault?.();
    event.stopPropagation?.();
    event.nativeEvent?.stopPropagation?.();
    onSubmit();
  };
}
