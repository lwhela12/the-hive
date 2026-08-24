import { useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { clearFeedbackDraft } from './feedbackDraft';
import { feedbackLabelForPath, feedbackReturnPathForPath } from './feedbackOrigin';

export type OpenFeedbackOptions = {
  pathname?: string | null;
  label?: string | null;
};

/**
 * Every App Feedback door opens the form directly.
 *
 * Screenshots and files stay optional controls inside the form; opening the
 * page must never interrupt somebody with a browser/native capture prompt.
 * The origin rides along as both context and a real way back.
 */
export function useOpenFeedback() {
  const currentPathname = usePathname();
  const router = useRouter();
  const openingRef = useRef(false);

  return useCallback((options: OpenFeedbackOptions = {}) => {
    if (openingRef.current) return;
    openingRef.current = true;
    // A route must never consume a screenshot left by an interrupted older open.
    clearFeedbackDraft();
    const sourcePath = options.pathname ?? currentPathname;
    const originLabel = options.label ?? feedbackLabelForPath(sourcePath);
    const originPath = feedbackReturnPathForPath(sourcePath);

    router.push({
      pathname: '/app-feedback',
      params: {
        ...(originLabel ? { originLabel } : {}),
        ...(originPath ? { originPath } : {}),
      },
    } as never);
    openingRef.current = false;
  }, [currentPathname, router]);
}
