import { useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';

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
  onError?: (message: string) => void
) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const isSupported =
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const start = useCallback(() => {
    if (!isSupported) {
      onError?.(getSpeechErrorMessage());
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onstart = () => setIsListening(true);
    rec.onend = () => setIsListening(false);
    rec.onerror = (event: any) => {
      setIsListening(false);
      onError?.(getSpeechErrorMessage(event?.error));
    };
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      onTranscript(transcript);
    };
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      setIsListening(false);
      onError?.(getSpeechErrorMessage());
    }
  }, [isSupported, onError, onTranscript]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (isListening) stop();
    else start();
  }, [isListening, start, stop]);

  return { isListening, toggle, isSupported };
}
