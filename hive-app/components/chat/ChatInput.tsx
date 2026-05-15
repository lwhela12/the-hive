import { useState, memo, useRef } from 'react';
import { View, TextInput, Pressable, Text, Image as RNImage, ScrollView, Platform } from 'react-native';
import { SelectedImage } from '../../lib/imagePicker';
import { SelectedFile } from '../../lib/filePicker';
import { VoiceMicButton } from '../ui/VoiceMicButton';
import { getDraft, setDraft, clearDraft } from '../../lib/draftStore';
import { submitOnEnter } from '../../lib/submitOnEnter';
import { AttachmentPicker } from '../ui/AttachmentPicker';
import { Ionicons } from '@expo/vector-icons';

const DRAFT_KEY = 'clive-message';
const MAX_IMAGES = 5;
const MAX_FILES = 5;

const isImageFile = (file: File) =>
  file.type.startsWith('image/') || /\.(gif|jpe?g|png|webp)$/i.test(file.name);

const getFallbackImageMimeType = (file: File) => {
  if (file.type) return file.type;
  if (/\.png$/i.test(file.name)) return 'image/png';
  if (/\.gif$/i.test(file.name)) return 'image/gif';
  if (/\.webp$/i.test(file.name)) return 'image/webp';
  return 'image/jpeg';
};

const readImageSize = (uri: string): Promise<{ width: number; height: number }> => {
  if (Platform.OS !== 'web' || typeof globalThis.Image === 'undefined') {
    return Promise.resolve({ width: 0, height: 0 });
  }

  return new Promise((resolve) => {
    const image = new globalThis.Image();
    image.onload = () => resolve({ width: image.naturalWidth || image.width || 0, height: image.naturalHeight || image.height || 0 });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = uri;
  });
};

const fileToSelectedImage = async (file: File): Promise<SelectedImage> => {
  const uri = URL.createObjectURL(file);
  const { width, height } = await readImageSize(uri);
  return {
    uri,
    width,
    height,
    fileName: file.name,
    fileSize: file.size,
    mimeType: getFallbackImageMimeType(file),
  };
};

const fileToSelectedFile = (file: File): SelectedFile => ({
  uri: URL.createObjectURL(file),
  name: file.name || 'attachment',
  size: file.size,
  mimeType: file.type || 'application/octet-stream',
  file,
});

export interface ChatInputAttachments {
  images?: SelectedImage[];
  files?: SelectedFile[];
}

interface ChatInputProps {
  onSend: (message: string, attachments?: ChatInputAttachments) => void;
  isLoading: boolean;
  placeholder?: string;
  /** Override the draft storage key (e.g. per-conversation) */
  draftKey?: string;
}

export const ChatInput = memo(function ChatInput({
  onSend,
  isLoading,
  placeholder = 'Message...',
  draftKey = DRAFT_KEY,
}: ChatInputProps) {
  const [inputText, setInputText] = useState(() => getDraft(draftKey));
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const voiceBaseTextRef = useRef<string | null>(null);
  const dragDepthRef = useRef(0);

  const handleRemoveImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const mergeTranscript = (baseText: string, transcript: string) => {
    const cleanBase = baseText.trimEnd();
    const cleanTranscript = transcript.trim();
    if (!cleanTranscript) return cleanBase;
    return cleanBase ? `${cleanBase} ${cleanTranscript}` : cleanTranscript;
  };

  const handleSend = () => {
    if ((!inputText.trim() && selectedImages.length === 0 && selectedFiles.length === 0) || isLoading) return;
    const attachments =
      selectedImages.length > 0 || selectedFiles.length > 0
        ? { images: selectedImages, files: selectedFiles }
        : undefined;
    onSend(inputText.trim(), attachments);
    setInputText('');
    clearDraft(draftKey);
    setSelectedImages([]);
    setSelectedFiles([]);
    voiceBaseTextRef.current = null;
  };

  const handleTextChange = (text: string) => {
    setInputText(text);
    setDraft(draftKey, text);
  };

  const handleKeyPress = submitOnEnter(handleSend);
  const enterToSubmitCaptureProps = Platform.OS === 'web'
    ? ({ onKeyDownCapture: submitOnEnter(handleSend) } as any)
    : {};

  const attachDroppedFiles = async (files: File[]) => {
    if (isLoading || files.length === 0) return;

    const imageSlots = Math.max(0, MAX_IMAGES - selectedImages.length);
    const fileSlots = Math.max(0, MAX_FILES - selectedFiles.length);
    const droppedImages = files.filter(isImageFile).slice(0, imageSlots);
    const droppedFiles = files.filter((file) => !isImageFile(file)).slice(0, fileSlots);

    if (droppedImages.length > 0) {
      const images = await Promise.all(droppedImages.map(fileToSelectedImage));
      setSelectedImages((prev) => [...prev, ...images].slice(0, MAX_IMAGES));
    }

    if (droppedFiles.length > 0) {
      const fileAttachments = droppedFiles.map(fileToSelectedFile);
      setSelectedFiles((prev) => [...prev, ...fileAttachments].slice(0, MAX_FILES));
    }
  };

  const dragDropProps = Platform.OS === 'web'
    ? ({
        onDragEnter: (event: any) => {
          if (isLoading) return;
          event.preventDefault?.();
          event.stopPropagation?.();
          dragDepthRef.current += 1;
          setIsDragActive(true);
        },
        onDragOver: (event: any) => {
          if (isLoading) return;
          event.preventDefault?.();
          event.stopPropagation?.();
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
          setIsDragActive(true);
        },
        onDragLeave: (event: any) => {
          event.preventDefault?.();
          event.stopPropagation?.();
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) {
            setIsDragActive(false);
          }
        },
        onDrop: async (event: any) => {
          event.preventDefault?.();
          event.stopPropagation?.();
          dragDepthRef.current = 0;
          setIsDragActive(false);
          await attachDroppedFiles(Array.from(event.dataTransfer?.files ?? []));
        },
      } as any)
    : {};

  const hasContent = inputText.trim().length > 0 || selectedImages.length > 0 || selectedFiles.length > 0;

  return (
    <View className="px-4 py-3 bg-white" {...dragDropProps}>
      {/* Attachment previews */}
      {(selectedImages.length > 0 || selectedFiles.length > 0) && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-2"
          contentContainerStyle={{ gap: 8 }}
        >
          {selectedImages.map((image, index) => (
            <View key={image.uri} className="relative">
              <RNImage
                source={{ uri: image.uri }}
                className="w-14 h-14 rounded-lg bg-gray-100"
                resizeMode="cover"
              />
              <Pressable
                onPress={() => handleRemoveImage(index)}
                className="absolute -top-1 -right-1 bg-charcoal rounded-full w-5 h-5 items-center justify-center"
              >
                <Ionicons name="close" size={12} color="white" />
              </Pressable>
            </View>
          ))}
          {selectedFiles.map((file, index) => (
            <View key={`${file.uri}-${index}`} className="relative bg-cream border border-gold/20 rounded-lg px-3 py-2 w-48">
              <View className="flex-row items-center">
                <Ionicons name="document-attach-outline" size={20} color="#bd9348" />
                <View className="ml-2 flex-1">
                  <Text
                    className="text-charcoal text-xs"
                    style={{ fontFamily: 'Lato_700Bold' }}
                    numberOfLines={1}
                  >
                    {file.name}
                  </Text>
                  <Text
                    className="text-charcoal/45 text-[10px]"
                    style={{ fontFamily: 'Lato_400Regular' }}
                    numberOfLines={1}
                  >
                    {file.mimeType || 'File'}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => handleRemoveFile(index)}
                className="absolute -top-1 -right-1 bg-charcoal rounded-full w-5 h-5 items-center justify-center"
              >
                <Ionicons name="close" size={12} color="white" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      {isDragActive && (
        <View className="mb-2 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2">
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-sm">
            Drop images or files to attach
          </Text>
        </View>
      )}

      <View
        className={`flex-row items-end rounded-2xl px-3 py-2 border ${
          isDragActive ? 'bg-gold/10 border-gold' : 'bg-cream border-transparent'
        }`}
        {...enterToSubmitCaptureProps}
      >
        <AttachmentPicker
          compact
          selectedImages={selectedImages}
          onImagesChange={setSelectedImages}
          selectedFiles={selectedFiles}
          onFilesChange={setSelectedFiles}
          disabled={isLoading}
        />
        <TextInput
          value={inputText}
          onChangeText={handleTextChange}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          selectionColor="#313130"
          multiline
          blurOnSubmit={Platform.OS === 'web'}
          submitBehavior={Platform.OS === 'web' ? 'submit' : 'newline'}
          returnKeyType="send"
          enterKeyHint="send"
          onKeyPress={handleKeyPress}
          maxLength={2000}
          className="flex-1 max-h-32 text-base text-charcoal py-1 px-1"
          style={{ fontFamily: 'Lato_400Regular', outlineStyle: 'none', caretColor: '#313130' } as any}
          editable={!isLoading}
        />
        <Pressable
          onPress={handleSend}
          disabled={!hasContent || isLoading}
          className={`w-7 h-7 rounded-full items-center justify-center ml-2 ${
            hasContent && !isLoading
              ? 'bg-gold active:opacity-80'
              : 'bg-gray-300'
          }`}
        >
          <Text className="text-sm text-white" style={{ marginTop: -1 }}>↑</Text>
        </Pressable>

        <VoiceMicButton
          size={20}
          style={{ marginLeft: 6 }}
          onTranscript={(text) => {
            const merged = mergeTranscript(voiceBaseTextRef.current ?? inputText, text);
            setInputText(merged);
            setDraft(draftKey, merged);
            voiceBaseTextRef.current = null;
          }}
          onInterimTranscript={(text) => {
            if (!text) {
              voiceBaseTextRef.current = null;
              return;
            }
            setInputText((prev) => {
              if (voiceBaseTextRef.current === null) voiceBaseTextRef.current = prev;
              return mergeTranscript(voiceBaseTextRef.current, text);
            });
          }}
        />
      </View>
    </View>
  );
});
