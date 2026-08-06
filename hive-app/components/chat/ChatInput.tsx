import { useState, memo } from 'react';
import { SelectedImage } from '../../lib/imagePicker';
import { SelectedFile } from '../../lib/filePicker';
import { useMentionableMembers } from '../../lib/hooks/useMentionableMembers';
import { usePersistentTextDraft } from '../../lib/hooks/usePersistentTextDraft';
import { ComposerBar } from '../ui/ComposerBar';
import type { MentionReach } from '../../lib/mentions';
import type { Profile } from '../../types';

const DRAFT_KEY = 'clive-message';
const MAX_IMAGES = 5;
const MAX_FILES = 5;
const DEFAULT_MESSAGE_MAX_LENGTH = 12000;

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
  /**
   * How far what is typed here travels, from `useMentionReach()`. It names the
   * group rows in the "@" picker. Left out, the picker offers the group it can
   * always be sure of — everyone who can already see this.
   */
  mentionReach?: MentionReach | null;
  messageMaxLength?: number;
}

/**
 * Clive's message bar — now just the shared one, wearing chat clothes.
 *
 * This file used to BE the bar: pill, attachments, mentions, dictation, the
 * lot. Three other screens then copied it by hand and drifted. All of that
 * moved to `components/ui/ComposerBar.tsx`, and what is left here is the bit
 * that is genuinely Clive's — what a sent message means, and where the draft
 * lives.
 */
export const ChatInput = memo(function ChatInput({
  onSend,
  isLoading,
  placeholder = 'Message...',
  draftKey = DRAFT_KEY,
  communityId,
  currentUserId,
  mentionableMembers = [],
  mentionReach = null,
  messageMaxLength = DEFAULT_MESSAGE_MAX_LENGTH,
}: ChatInputProps) {
  const [inputText, setInputText, clearInputDraft] = usePersistentTextDraft(draftKey);
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const { members: activeMentionableMembers, loading: mentionMembersLoading } = useMentionableMembers(
    communityId,
    mentionableMembers
  );

  const hasContent = inputText.trim().length > 0 || selectedImages.length > 0 || selectedFiles.length > 0;

  const handleSend = () => {
    if (!hasContent || isLoading) return;
    const attachments =
      selectedImages.length > 0 || selectedFiles.length > 0
        ? { images: selectedImages, files: selectedFiles }
        : undefined;
    onSend(inputText.trim(), attachments);
    clearInputDraft();
    setSelectedImages([]);
    setSelectedFiles([]);
  };

  return (
    <ComposerBar
      variant="chat"
      containerClassName="px-4 py-3 bg-white"
      value={inputText}
      onChangeText={setInputText}
      placeholder={placeholder}
      maxLength={messageMaxLength}
      onSubmit={handleSend}
      // Not `submitting` — while Clive is thinking you can still type your next
      // message, which is why only the send button greys out.
      canSubmit={hasContent && !isLoading}
      attachments="compact"
      selectedImages={selectedImages}
      onImagesChange={setSelectedImages}
      selectedFiles={selectedFiles}
      onFilesChange={setSelectedFiles}
      maxImages={MAX_IMAGES}
      maxFiles={MAX_FILES}
      captureDocumentDrops
      mentionMembers={activeMentionableMembers}
      mentionsLoading={mentionMembersLoading}
      mentionReach={mentionReach}
      currentUserId={currentUserId}
    />
  );
});
