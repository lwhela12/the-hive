import { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, Pressable, Alert, AppState, AppStateStatus, Platform } from 'react-native';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { useKeepAwake } from 'expo-keep-awake';
import { supabase } from '../../lib/supabase';

const NUM_BARS = 20;
const RECORDING_BUCKET = 'meeting-recordings';

interface AudioRecorderProps {
  onComplete: (audioPath: string) => void | Promise<void>;
  onCancel: () => void;
}

export function AudioRecorder({ onComplete, onCancel }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(NUM_BARS).fill(0));
  const [wentToBackground, setWentToBackground] = useState(false);
  const [pendingUploadUri, setPendingUploadUri] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isUnloadedRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Prevent screen from sleeping while recording
  useKeepAwake();

  // Web: Use Screen Wake Lock API to prevent computer sleep
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch {
        // Wake Lock not supported or denied
      }
    };

    requestWakeLock();

    // Re-acquire wake lock when tab regains visibility (browser releases it on hide)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !wakeLockRef.current) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, []);

  // Track app state changes during recording
  useEffect(() => {
    if (!isRecording) return;

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        setWentToBackground(true);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [isRecording]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (meterRef.current) {
        clearInterval(meterRef.current);
        meterRef.current = null;
      }
      // Only try to unload if we haven't already
      if (recordingRef.current && !isUnloadedRef.current) {
        isUnloadedRef.current = true;
        recordingRef.current.stopAndUnloadAsync().catch(() => {
          // Ignore errors during cleanup - recording may already be stopped
        });
      }
    };
  }, []);

  // Poll for audio levels while recording
  useEffect(() => {
    if (isRecording && recordingRef.current) {
      meterRef.current = setInterval(async () => {
        try {
          const status = await recordingRef.current?.getStatusAsync();
          if (status?.isRecording && status.metering !== undefined) {
            // metering is in dB, typically -160 to 0
            // Convert to 0-1 range, with some smoothing
            const db = status.metering;
            const normalized = Math.max(0, Math.min(1, (db + 60) / 60));

            setAudioLevels((prev) => {
              const newLevels = [...prev.slice(1), normalized];
              return newLevels;
            });
          }
        } catch {
          // Ignore errors during metering
        }
      }, 100);

      return () => {
        if (meterRef.current) {
          clearInterval(meterRef.current);
          meterRef.current = null;
        }
      };
    } else {
      // Reset levels when not recording
      setAudioLevels(Array(NUM_BARS).fill(0));
    }
  }, [isRecording]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getExtensionFromUri = (uri: string, fallback = 'm4a') => {
    const cleanUri = uri.split('?')[0];
    const match = cleanUri.match(/\.([a-zA-Z0-9]+)$/);
    return match?.[1]?.toLowerCase() || fallback;
  };

  const getExtensionFromMimeType = (mimeType?: string | null) => {
    if (!mimeType) return null;
    if (mimeType.includes('webm')) return 'webm';
    if (mimeType.includes('mpeg')) return 'mp3';
    if (mimeType.includes('wav')) return 'wav';
    if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
    return null;
  };

  const getAudioContentType = (extension: string, detectedType?: string | null) => {
    if (detectedType) return detectedType;

    switch (extension) {
      case 'webm':
        return 'audio/webm';
      case 'mp3':
        return 'audio/mpeg';
      case 'wav':
        return 'audio/wav';
      case 'caf':
        return 'audio/x-caf';
      case 'mp4':
      case 'm4a':
      default:
        return 'audio/mp4';
    }
  };

  const uploadWebRecording = useCallback(async (uri: string) => {
    const response = await fetch(uri);
    const blob = await response.blob();
    const extension = getExtensionFromMimeType(blob.type) ?? 'webm';
    const fileName = `meeting-${Date.now()}.${extension}`;

    const { data, error } = await supabase.storage
      .from(RECORDING_BUCKET)
      .upload(fileName, blob, {
        contentType: getAudioContentType(extension, blob.type),
      });

    if (error) throw error;
    return data.path;
  }, []);

  const uploadNativeRecording = useCallback(async (uri: string) => {
    const extension = getExtensionFromUri(uri);
    const fileName = `meeting-${Date.now()}.${extension}`;
    const fileInfo = await FileSystem.getInfoAsync(uri);

    if (!fileInfo.exists) {
      throw new Error('Recording file is no longer available on this device.');
    }

    const { data: signedUpload, error: signedUploadError } = await supabase.storage
      .from(RECORDING_BUCKET)
      .createSignedUploadUrl(fileName);

    if (signedUploadError) throw signedUploadError;

    const uploadResult = await FileSystem.uploadAsync(signedUpload.signedUrl, uri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
      headers: {
        'content-type': getAudioContentType(extension),
        'cache-control': 'max-age=3600',
      },
    });

    if (uploadResult.status < 200 || uploadResult.status >= 300) {
      throw new Error(`Upload failed with status ${uploadResult.status}: ${uploadResult.body}`);
    }

    return signedUpload.path;
  }, []);

  const uploadRecording = useCallback(async (uri: string) => {
    if (Platform.OS === 'web') {
      return uploadWebRecording(uri);
    }

    return uploadNativeRecording(uri);
  }, [uploadNativeRecording, uploadWebRecording]);

  const saveRecordingUri = useCallback(async (uri: string) => {
    setUploading(true);

    try {
      const audioPath = await uploadRecording(uri);
      await onComplete(audioPath);
      setPendingUploadUri(null);
    } catch (error) {
      console.error('Failed to upload recording:', error);
      Alert.alert(
        'Save Failed',
        'The recording is still on this device for now. Keep the app open and tap Retry Save when your connection is steady.'
      );
    } finally {
      recordingRef.current = null;
      setUploading(false);
    }
  }, [onComplete, uploadRecording]);

  const startRecording = useCallback(async () => {
    // Prevent starting if already recording or if a recording exists
    if (recordingRef.current || isRecording) {
      console.log('Recording already in progress');
      return;
    }

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Please grant microphone permission to record meetings.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        shouldDuckAndroid: false,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
        undefined,
        100 // Enable metering updates every 100ms
      );

      recordingRef.current = newRecording;
      isUnloadedRef.current = false;
      setIsRecording(true);
      setDuration(0);
      setWentToBackground(false);

      // Start timer after state is set
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording. Please try again.');
      recordingRef.current = null;
      setIsRecording(false);
    }
  }, [isRecording]);

  const stopRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording || isUnloadedRef.current) return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (meterRef.current) {
      clearInterval(meterRef.current);
      meterRef.current = null;
    }

    setIsRecording(false);
    setUploading(true);

    try {
      isUnloadedRef.current = true;
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();

      if (!uri) {
        throw new Error('No recording URI');
      }

      setPendingUploadUri(uri);
      await saveRecordingUri(uri);
    } catch (error) {
      console.error('Failed to stop/upload recording:', error);
      Alert.alert('Error', 'Failed to stop the recording. Please try again.');
    } finally {
      if (!pendingUploadUri) {
        recordingRef.current = null;
      }
    }
  }, [pendingUploadUri, saveRecordingUri]);

  const retrySave = useCallback(async () => {
    if (!pendingUploadUri || uploading) return;
    await saveRecordingUri(pendingUploadUri);
  }, [pendingUploadUri, saveRecordingUri, uploading]);

  const cancelRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (recording && !isUnloadedRef.current) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (meterRef.current) {
        clearInterval(meterRef.current);
        meterRef.current = null;
      }
      try {
        isUnloadedRef.current = true;
        await recording.stopAndUnloadAsync();
      } catch {
        // Ignore errors - recording may already be stopped
      }
      recordingRef.current = null;
    }
    if (pendingUploadUri && Platform.OS !== 'web') {
      await FileSystem.deleteAsync(pendingUploadUri, { idempotent: true }).catch(() => {
        // Best-effort cleanup only.
      });
    }
    setPendingUploadUri(null);
    setIsRecording(false);
    onCancel();
  }, [onCancel, pendingUploadUri]);

  return (
    <View className="flex-1 bg-white p-6">
      <View className="flex-row justify-between items-center mb-8">
        <Text className="text-xl font-bold text-hive-dark">Record Meeting</Text>
        <Pressable onPress={cancelRecording} disabled={uploading}>
          <Text className="text-label text-base">Cancel</Text>
        </Pressable>
      </View>

      <View className="flex-1 items-center justify-center">
        {/* Recording indicator */}
        {!isRecording && !uploading && !pendingUploadUri && (
          <View className="w-40 h-40 rounded-full items-center justify-center bg-gray-100">
            <Text className="text-5xl">🎙️</Text>
          </View>
        )}

        {uploading && (
          <View className="w-40 h-40 rounded-full items-center justify-center bg-gray-100">
            <Text className="text-gray-600">Uploading...</Text>
          </View>
        )}

        {pendingUploadUri && !uploading && !isRecording && (
          <View className="w-40 h-40 rounded-full items-center justify-center bg-amber-100">
            <Text className="text-4xl">!</Text>
          </View>
        )}

        {/* Audio level visualization - shows when recording */}
        {isRecording && (
          <View className="items-center">
            {/* Waveform bars */}
            <View className="flex-row items-center justify-center h-32 gap-1">
              {audioLevels.map((level, index) => (
                <View
                  key={index}
                  className="w-2 bg-red-500 rounded-full"
                  style={{
                    height: Math.max(8, level * 100),
                    opacity: 0.5 + level * 0.5,
                  }}
                />
              ))}
            </View>

            {/* Recording dot indicator */}
            <View className="flex-row items-center mt-4">
              <View className="w-3 h-3 rounded-full bg-red-500 mr-2" />
              <Text className="text-red-500 font-medium">REC</Text>
            </View>
          </View>
        )}

        {/* Duration */}
        <Text className="text-4xl font-mono mt-8 text-hive-dark">
          {formatDuration(duration)}
        </Text>

        {/* Status */}
        <Text className="text-label mt-2">
          {isRecording
            ? 'Recording...'
            : uploading
            ? 'Saving recording...'
            : pendingUploadUri
            ? 'Recording saved locally. Retry upload to finish.'
            : 'Ready to record'}
        </Text>

        {!uploading && (
          <View className="mt-4 bg-honey-50 border border-honey-100 rounded-xl px-4 py-3 max-w-md">
            <Text className="text-honey-800 text-sm text-center font-medium">
              Built for full HIVE meetings
            </Text>
            <Text className="text-gray-600 text-xs text-center mt-1">
              Record the full 2 hour meeting. When you stop, Clive saves the audio,
              keeps the transcript, and pulls out action items.
            </Text>
          </View>
        )}

        {/* Background warning */}
        {wentToBackground && isRecording && (
          <View className="mt-4 bg-amber-100 px-4 py-2 rounded-lg">
            <Text className="text-amber-800 text-sm text-center">
              ⚠️ App went to background - recording may be affected.
              {Platform.OS === 'web' ? ' Keep this tab visible and active.' : ''}
            </Text>
          </View>
        )}

        {/* Keep screen on notice */}
        {isRecording && !wentToBackground && Platform.OS !== 'web' && (
          <Text className="text-softink text-xs mt-4 text-center">
            Screen will stay on while recording
          </Text>
        )}
      </View>

      {/* Controls */}
      <View className="mb-8">
        {!isRecording && !uploading && pendingUploadUri ? (
          <View className="gap-3">
            <Pressable
              onPress={retrySave}
              className="bg-honey-500 py-4 rounded-xl items-center active:bg-honey-600"
            >
              <Text className="text-white text-lg font-semibold">
                Retry Save
              </Text>
            </Pressable>
            <Pressable
              onPress={cancelRecording}
              className="bg-gray-100 py-3 rounded-xl items-center active:bg-gray-200"
            >
              <Text className="text-gray-700 text-base font-semibold">
                Discard Recording
              </Text>
            </Pressable>
          </View>
        ) : !isRecording && !uploading ? (
          <Pressable
            onPress={startRecording}
            className="bg-red-500 py-4 rounded-xl items-center active:bg-red-600"
          >
            <Text className="text-white text-lg font-semibold">
              Start Recording
            </Text>
          </Pressable>
        ) : isRecording ? (
          <Pressable
            onPress={stopRecording}
            className="bg-gray-800 py-4 rounded-xl items-center active:bg-gray-900"
          >
            <Text className="text-white text-lg font-semibold">
              Stop & Save
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
