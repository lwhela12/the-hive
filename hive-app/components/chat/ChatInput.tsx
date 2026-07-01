import { useState, memo, useRef } from 'react';
import { View, TextInput, Pressable, Text, Image as RNImage, ScrollView, Platform } from 'react-native';
import { SelectedImage } from '../../lib/imagePicker';
import { SelectedFile } from '../../lib/filePicker';
import { VoiceMicButton } from '../ui/VoiceMicButton';
import { submitOnEnter } from '../../lib/submitOnEnter';
import { AttachmentPicker } from '../ui/AttachmentPicker';
import { Ionicons } from '@expo/vector-icons';
import { useMentionableMembers } from '../../lib/hooks/useMentionableMembers';
import { useMentionInput } from '../../lib/hooks/useMentionInput';
import { usePersistentTextDraft } from '../../lib/hooks/usePersistentTextDraft';
import { MentionSuggestions } from '../ui/MentionSuggestions';
import { useWebAttachmentDropZone } from '../../lib/hooks/useWebAttachmentDropZone';
import type { Profile } from '../../types';
import { SelectedFilePreview } from '../ui/SelectedFilePreview';

const DRAFT_KEY = 'clive-message';
const MAX_IMAGES = 5;
const MAX_FILES = 5;
const DEFAULT_MESSAGE_MAX_LENGTH = 12000;
const CHARACTER_LIMIT_WARNING_THRESHOLD = 1000;

export interface ChatInputAttachments {
  images?: SelectedImage[];
  files?: SelectedFile[];
}

interface ChatInputProps {
  onSend: (message: string, attachments?: ChatInputAttachments) => void;
  isLoading: boolean;
  placeholder?: string;
  /** Override the draft storage key (e.g. per-conversation) */
  draftKey?: string | null;
  communityId?: string | null;
  currentUserId?: string;
  mentionableMembers?: Pick<Profile, 'id' | 'name'>[];
  messageMaxLength?: number;
}

export const ChatInput = memo(function ChatInput({
  onSend,
  isLoading,
  placeholder = 'Message...',
  draftKey = DRAFT_KEY,
  communityId,
  currentUserId,
  mentionableMembers = [],
  messageMaxLength = DEFAULT_MESSAGE_MAX_LENGTH,
}: ChatInputProps) {
  const [inputText, setInputText, clearInputDraft] = usePersistentTextDraft(draftKey);
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const voiceBaseTextRef = useRef<string | null>(null);
  const { members: activeMentionableMembers, loading: mentionMembersLoading } = useMentionableMembers(
    communityId,
    mentionableMembers
  );

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
    clearInputDraft();
    setSelectedImages([]);
    setSelectedFiles([]);
    voiceBaseTextRef.current = null;
    mentionInput.resetMentionSelection();
  };

  const handleTextChange = (text: string) => {
    setInputText(text);
  };

  const mentionInput = useMentionInput({
    value: inputText,
    onChangeText: handleTextChange,
    members: activeMentionableMembers,
    currentUserId,
  });

  const handleKeyPress = submitOnEnter(handleSend);
  const enterToSubmitCaptureProps = Platform.OS === 'web'
    ? ({ onKeyDownCapture: submitOnEnter(handleSend) } as any)
    : {};
  const { dragDropProps, isDragActive } = useWebAttachmentDropZone({
    selectedImages,
    selectedFiles,
    onImagesChange: setSelectedImages,
    onFilesChange: setSelectedFiles,
    maxImages: MAX_IMAGES,
    maxFiles: MAX_FILES,
    captureDocumentDrops: true,
  });

  const hasContent = inputText.trim().length > 0 || selectedImages.length > 0 || selectedFiles.length > 0;
  const remainingCharacters = messageMaxLength - inputText.length;
  const showCharacterLimit = remainingCharacters <= CHARACTER_LIMIT_WARNING_THRESHOLD;

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
            <SelectedFilePreview
              key={`${file.uri}-${index}`}
              file={file}
              onRemove={() => handleRemoveFile(index)}
            />
          ))}
        </ScrollView>
      )}

      {isDragActive && (
        <View className="mb-2 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2">
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-sm">
            Drop photos, videos, or files to attach
          </Text>
        </View>
      )}

      <MentionSuggestions
        active={mentionInput.mentionQuery !== null}
        query={mentionInput.mentionQuery}
        loading={mentionMembersLoading}
        suggestions={mentionInput.mentionSuggestions}
        onSelect={mentionInput.selectMention}
        placement="above"
      />
      {mentionInput.mentionedMembers.length > 0 && (
        <View className="flex-row flex-wrap mb-2" style={{ gap: 6 }}>
          {mentionInput.mentionedMembers.map((member) => (
            <View key={member.id} className="bg-blue-50 border border-blue-200 rounded-full px-3 py-1">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-blue-700 text-xs">
                Tagged {member.name.split(/\s+/)[0]}
              </Text>
            </View>
          ))}
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
        />
        <TextInput
          value={inputText}
          onChangeText={mentionInput.textInputMentionProps.onChangeText}
          onSelectionChange={mentionInput.textInputMentionProps.onSelectionChange}
          selection={mentionInput.textInputMentionProps.selection}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          selectionColor="#313130"
          multiline
          blurOnSubmit={Platform.OS === 'web'}
          submitBehavior={Platform.OS === 'web' ? 'submit' : 'newline'}
          returnKeyType="send"
          enterKeyHint="send"
          onKeyPress={handleKeyPress}
          maxLength={messageMaxLength}
          className="flex-1 max-h-32 text-base text-charcoal py-1 px-1"
          style={{ fontFamily: 'Lato_400Regular', outlineStyle: 'none', caretColor: '#313130' } as any}
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
            handleTextChange(merged);
            voiceBaseTextRef.current = null;
          }}
          onInterimTranscript={(text) => {
            if (!text) {
              voiceBaseTextRef.current = null;
              return;
            }
            setInputText((prev) => {
              if (voiceBaseTextRef.current === null) voiceBaseTextRef.current = prev;
              const merged = mergeTranscript(voiceBaseTextRef.current, text);
              return merged;
            });
          }}
        />
      </View>

      {showCharacterLimit && (
        <Text
          style={{ fontFamily: 'Lato_400Regular' }}
          className={`mt-1 text-right text-xs ${remainingCharacters <= 100 ? 'text-red-500' : 'text-charcoal/45'}`}
        >
          {remainingCharacters.toLocaleString()} characters left
        </Text>
      )}
    </View>
  );
});
