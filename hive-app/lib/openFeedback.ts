import { useCallback, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { captureFeedbackScreenshot } from './feedbackCapture';
import { clearFeedbackDraft, handOffFeedbackDraft, type FeedbackCaptureNotice } from './feedbackDraft';
import { feedbackLabelForPath } from './feedbackOrigin';

export type OpenFeedbackOptions = {
  pathname?: string | null;
  label?: string | null;
  captureRequested?: boolean;
};

/** Every in-app feedback door comes through this capture-before-navigation path. */
export function useOpenFeedback() {
  const currentPathname = usePathname();
  const router = useRouter();
  const openingRef = useRef(false);

  return useCallback((options: OpenFeedbackOptions = {}) => {
    if (openingRef.current) return;
    openingRef.current = true;
    // A route must never consume a screenshot left by an interrupted older open.
    clearFeedbackDraft();
    const originLabel = options.label ?? feedbackLabelForPath(options.pathname ?? currentPathname);

    const navigate = (captureNotice: FeedbackCaptureNotice = null) => {
      router.push({
        pathname: '/app-feedback',
        params: {
          ...(originLabel ? { originLabel } : {}),
          ...(captureNotice ? { captureNotice } : {}),
        },
      } as never);
      openingRef.current = false;
    };

    const captureThenNavigate = async () => {
      const result = await captureFeedbackScreenshot();
      if (result.status === 'captured') {
        handOffFeedbackDraft({ originLabel, screenshot: result.image, dispose: result.dispose });
        navigate();
      } else {
        navigate(result.status);
      }
    };

    if (options.captureRequested === false) {
      navigate();
      return;
    }

    const title = 'Include a screenshot?';
    const message = Platform.OS === 'web'
      ? 'Your browser will ask what tab, window, or screen to share. HIVE takes one frame, stops sharing immediately, and shows it before anything is sent.'
      : 'HIVE can take a picture of the app page you are on now. You will see it and can remove it before anything is sent.';

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`${title}\n\n${message}`)) void captureThenNavigate();
      else navigate();
      return;
    }

    Alert.alert(title, message, [
      { text: 'No screenshot', style: 'cancel', onPress: () => navigate() },
      { text: 'Include screenshot', onPress: () => void captureThenNavigate() },
    ]);
  }, [currentPathname, router]);
}
