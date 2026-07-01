import { useState, useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

const RESTART_AFTER_END_MS = 300;
const RECOVERABLE_SPEECH_ERRORS = new Set(['aborted', 'no-speech']);

function getSpeechErrorMessage(error?: string) {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access is blocked. Please allow microphone access for HIVE in your browser settings, then try again.';
    case 'no-speech':
      return 'I did not hear anything. Try tapping the mic again and speaking after it turns red.';
    case 'audio-capture':
      return 'I could not find a microphone to listen through.';
    case 'network':
      return 'Voice input could not connect. Please check your connection and try again.';
    default:
      return 'Voice input could not start on this device or browser. You can still use your keyboard dictation mic if your phone shows one.';
  }
}

export function useVoiceInput(
  onTranscript: (text: string) => void,
  onError?: (message: string) => void,
  onInterimTranscript?: (text: string) => void
) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldListenRef = useRef(false);
  const mountedRef = useRef(true);
  const finalResultIndexRef = useRef(0);
  const startRetryCountRef = useRef(0);
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  const onInterimTranscriptRef = useRef(onInterimTranscript);

  const isSupported =
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onInterimTranscriptRef.current = onInterimTranscript;
  }, [onInterimTranscript]);

  const setListeningState = useCallback((listening: boolean) => {
    if (mountedRef.current) setIsListening(listening);
  }, []);

  const clearRestartTimeout = useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
  }, []);

  const startRecognition = useCallback(() => {
    if (!isSupported) {
      shouldListenRef.current = false;
      setListeningState(false);
      onErrorRef.current?.(getSpeechErrorMessage());
      return;
    }

    if (!shouldListenRef.current || recognitionRef.current) return;

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    finalResultIndexRef.current = 0;

    const scheduleRestart = () => {
      clearRestartTimeout();
      if (!shouldListenRef.current) return;

      restartTimeoutRef.current = setTimeout(() => {
        restartTimeoutRef.current = null;
        startRecognition();
      }, RESTART_AFTER_END_MS);
    };

    rec.onstart = () => {
      startRetryCountRef.current = 0;
      setListeningState(true);
    };
    rec.onend = () => {
      if (recognitionRef.current === rec) recognitionRef.current = null;

      if (shouldListenRef.current) {
        onInterimTranscriptRef.current?.('');
        scheduleRestart();
        return;
      }

      setListeningState(false);
      onInterimTranscriptRef.current?.('');
    };
    rec.onerror = (event: any) => {
      const error = event?.error;

      if (RECOVERABLE_SPEECH_ERRORS.has(error) && shouldListenRef.current) {
        onInterimTranscriptRef.current?.('');
        return;
      }

      shouldListenRef.current = false;
      clearRestartTimeout();
      if (recognitionRef.current === rec) recognitionRef.current = null;
      setListeningState(false);
      onInterimTranscriptRef.current?.('');

      if (error !== 'aborted') {
        onErrorRef.current?.(getSpeechErrorMessage(error));
      }
    };
    rec.onresult = (event: any) => {
      const interimSegments: string[] = [];
      const finalSegments: string[] = [];

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0]?.transcript?.trim();
        if (!transcript) continue;

        if (event.results[i].isFinal) {
          if (i >= finalResultIndexRef.current) {
            finalSegments.push(transcript);
            finalResultIndexRef.current = i + 1;
          }
        } else {
          interimSegments.push(transcript);
        }
      }

      const interimTranscript = interimSegments.join(' ').trim();
      onInterimTranscriptRef.current?.(interimTranscript);

      const finalTranscript = finalSegments.join(' ').trim();
      if (finalTranscript) {
        onTranscriptRef.current(finalTranscript);
        onInterimTranscriptRef.current?.('');
      }
    };
    recognitionRef.current = rec;

    try {
      rec.start();
    } catch {
      if (recognitionRef.current === rec) recognitionRef.current = null;

      if (shouldListenRef.current && startRetryCountRef.current < 2) {
        startRetryCountRef.current += 1;
        scheduleRestart();
        return;
      }

      shouldListenRef.current = false;
      setListeningState(false);
      onErrorRef.current?.(getSpeechErrorMessage());
    }
  }, [clearRestartTimeout, isSupported, setListeningState]);

  const start = useCallback(() => {
    if (!isSupported) {
      onErrorRef.current?.(getSpeechErrorMessage());
      return;
    }

    shouldListenRef.current = true;
    startRetryCountRef.current = 0;
    setListeningState(true);
    startRecognition();
  }, [isSupported, setListeningState, startRecognition]);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    startRetryCountRef.current = 0;
    clearRestartTimeout();
    const recognition = recognitionRef.current;
    recognitionRef.current = null;

    try {
      recognition?.stop();
    } catch {
      recognition?.abort?.();
    }

    setListeningState(false);
    onInterimTranscriptRef.current?.('');
  }, [clearRestartTimeout, setListeningState]);

  const toggle = useCallback(() => {
    if (isListening) stop();
    else start();
  }, [isListening, start, stop]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      shouldListenRef.current = false;
      startRetryCountRef.current = 0;
      clearRestartTimeout();
      recognitionRef.current?.abort?.();
      recognitionRef.current = null;
    };
  }, [clearRestartTimeout]);

  return { isListening, toggle, isSupported };
}
