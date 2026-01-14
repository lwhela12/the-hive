import { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { Audio } from 'expo-av';
import { supabase } from '../../lib/supabase';

const NUM_BARS = 20;

interface AudioRecorderProps {
  onComplete: (audioPath: string) => void;
  onCancel: () => void;
}

export function AudioRecorder({ onComplete, onCancel }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(NUM_BARS).fill(0));
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isUnloadedRef = useRef(false);

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

      // Upload to Supabase Storage
      const fileName = `meeting-${Date.now()}.m4a`;

      const response = await fetch(uri);
      const blob = await response.blob();

      const { data, error } = await supabase.storage
        .from('meeting-recordings')
        .upload(fileName, blob, {
          contentType: 'audio/m4a',
        });

      if (error) throw error;
      onComplete(data.path);
    } catch (error) {
      console.error('Failed to stop/upload recording:', error);
      Alert.alert('Error', 'Failed to save recording. Please try again.');
    } finally {
      recordingRef.current = null;
      setUploading(false);
    }
  }, [onComplete]);

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
    setIsRecording(false);
    onCancel();
  }, [onCancel]);

  return (
    <View className="flex-1 bg-white p-6">
      <View className="flex-row justify-between items-center mb-8">
        <Text className="text-xl font-bold text-hive-dark">Record Meeting</Text>
        <Pressable onPress={cancelRecording} disabled={uploading}>
          <Text className="text-gray-500 text-base">Cancel</Text>
        </Pressable>
      </View>

      <View className="flex-1 items-center justify-center">
        {/* Recording indicator */}
        {!isRecording && !uploading && (
          <View className="w-40 h-40 rounded-full items-center justify-center bg-gray-100">
            <Text className="text-5xl">🎙️</Text>
          </View>
        )}

        {uploading && (
          <View className="w-40 h-40 rounded-full items-center justify-center bg-gray-100">
            <Text className="text-gray-600">Uploading...</Text>
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
        <Text className="text-gray-500 mt-2">
          {isRecording
            ? 'Recording...'
            : uploading
            ? 'Saving recording...'
            : 'Ready to record'}
        </Text>
      </View>

      {/* Controls */}
      <View className="mb-8">
        {!isRecording && !uploading ? (
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
