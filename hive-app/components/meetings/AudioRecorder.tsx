import { useState, useRef, useEffect } from 'react';
import { View, Text, Pressable, Alert, Platform } from 'react-native';
import { Audio } from 'expo-av';
import { supabase } from '../../lib/supabase';

interface AudioRecorderProps {
  onComplete: (audioPath: string) => void;
  onCancel: () => void;
}

export function AudioRecorder({ onComplete, onCancel }: AudioRecorderProps) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (recording) {
        recording.stopAndUnloadAsync();
      }
    };
  }, [recording]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
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
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setIsRecording(false);
    setUploading(true);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();

      if (!uri) {
        throw new Error('No recording URI');
      }

      // Upload to Supabase Storage
      const fileName = `meeting-${Date.now()}.m4a`;

      if (Platform.OS === 'web') {
        const response = await fetch(uri);
        const blob = await response.blob();

        const { data, error } = await supabase.storage
          .from('meeting-recordings')
          .upload(fileName, blob, {
            contentType: 'audio/m4a',
          });

        if (error) throw error;
        onComplete(data.path);
      } else {
        const response = await fetch(uri);
        const blob = await response.blob();

        const { data, error } = await supabase.storage
          .from('meeting-recordings')
          .upload(fileName, blob, {
            contentType: 'audio/m4a',
          });

        if (error) throw error;
        onComplete(data.path);
      }
    } catch (error) {
      console.error('Failed to stop/upload recording:', error);
      Alert.alert('Error', 'Failed to save recording. Please try again.');
    } finally {
      setRecording(null);
      setUploading(false);
    }
  };

  const cancelRecording = async () => {
    if (recording) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      await recording.stopAndUnloadAsync();
      setRecording(null);
    }
    setIsRecording(false);
    onCancel();
  };

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
        <View
          className={`w-40 h-40 rounded-full items-center justify-center ${
            isRecording ? 'bg-red-100' : 'bg-gray-100'
          }`}
        >
          {isRecording && (
            <View className="w-20 h-20 rounded-full bg-red-500 animate-pulse" />
          )}
          {!isRecording && !uploading && (
            <Text className="text-5xl">🎙️</Text>
          )}
          {uploading && (
            <Text className="text-gray-600">Uploading...</Text>
          )}
        </View>

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
