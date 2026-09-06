/**
 * The bar between the panes of the deck — native fallback.
 *
 * The real one is `DeckSplit.web.tsx`. It is web only on purpose: dragging a
 * divider needs a pointer, and a phone shows one pane at a time anyway, so
 * there is nothing there to split. The deck's side panes collapse on small
 * screens (`stackVideo`), which is the same decision made a different way.
 *
 * It renders nothing rather than an empty box, so a stacked layout has no
 * mystery gap down the middle of it.
 */
export type DeckSplitProps = {
  width: number;
  onResize: (width: number) => void;
  fromEnd?: boolean;
  min: number;
  max: number;
  storageKey: string;
  label: string;
  accent: string;
  softBorder: string;
};

export function DeckSplit(_props: DeckSplitProps) {
  return null;
}
