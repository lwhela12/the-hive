import { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * The one menu, reachable from every screen.
 *
 * NavigationDrawer has existed for a while but nothing ever rendered it — Clive
 * mounts its own conversations drawer, and no other screen mounted anything. So
 * everything that lived "in the menu" (Admin, Honey Pot, Switch HIVE, The Buzz)
 * was unreachable, which is how Admin disappeared when it moved there
 * (Nat 2026-08-02).
 *
 * Now the app layout mounts it once, above the tabs, and any header can open it.
 */
type AppDrawerValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
};

export const AppDrawerContext = createContext<AppDrawerValue>({
  isOpen: false,
  open: () => {},
  close: () => {},
});

export function AppDrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);
  return <AppDrawerContext.Provider value={value}>{children}</AppDrawerContext.Provider>;
}

export function useAppDrawer() {
  return useContext(AppDrawerContext);
}
