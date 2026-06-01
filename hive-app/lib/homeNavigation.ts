type HomeResetListener = () => void;

const homeResetListeners = new Set<HomeResetListener>();

export function addHomeResetListener(listener: HomeResetListener) {
  homeResetListeners.add(listener);
  return () => {
    homeResetListeners.delete(listener);
  };
}

export function resetHomeNavigationState() {
  homeResetListeners.forEach((listener) => listener());
}
