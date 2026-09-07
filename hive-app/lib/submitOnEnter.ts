type TextInputKeyEvent = {
  nativeEvent?: {
    key?: string;
    shiftKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    isComposing?: boolean;
    preventDefault?: () => void;
    stopPropagation?: () => void;
  };
  key?: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
  preventDefault?: () => void;
  stopPropagation?: () => void;
};

export type WebSubmitKeyMode = 'disabled' | 'plain' | 'modified';

/**
 * What Enter means in one of HIVE's shared fields on a computer.
 *
 * Single-line fields still submit because there is nowhere for a newline to
 * go. Multiline fields follow the member's preference: ordinary Enter either
 * posts immediately or behaves like a document, with Command/Ctrl + Enter as
 * the shortcut that posts without reaching for the button.
 */
export function getWebSubmitKeyMode({
  enabled,
  multiline,
  enterSendsOnWeb,
}: {
  enabled: boolean;
  multiline: boolean;
  enterSendsOnWeb: boolean;
}): WebSubmitKeyMode {
  if (!enabled) return 'disabled';
  return !multiline || enterSendsOnWeb ? 'plain' : 'modified';
}

export function submitOnEnter(
  onSubmit: () => void,
  options: { requireModifier?: boolean } = {}
) {
  return (event: TextInputKeyEvent) => {
    const key = event.nativeEvent?.key ?? event.key;
    const shiftKey = event.nativeEvent?.shiftKey ?? event.shiftKey;
    const ctrlKey = event.nativeEvent?.ctrlKey ?? event.ctrlKey;
    const metaKey = event.nativeEvent?.metaKey ?? event.metaKey;
    const isComposing = event.nativeEvent?.isComposing ?? event.isComposing;
    const hasSubmitModifier = !!ctrlKey || !!metaKey;

    if (
      (key !== 'Enter' && key !== 'NumpadEnter')
      || shiftKey
      || isComposing
      || (!!options.requireModifier && !hasSubmitModifier)
    ) return;

    event.preventDefault?.();
    event.nativeEvent?.preventDefault?.();
    event.stopPropagation?.();
    event.nativeEvent?.stopPropagation?.();
    onSubmit();
  };
}
