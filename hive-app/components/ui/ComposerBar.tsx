import { useCallback, useRef, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { SelectedImage } from '../../lib/imagePicker';
import type { SelectedFile } from '../../lib/filePicker';
import type { Profile } from '../../types';
import { submitOnEnter } from '../../lib/submitOnEnter';
import { useDictation } from '../../lib/hooks/useDictation';
import { useMentionInput } from '../../lib/hooks/useMentionInput';
import { useWebAttachmentDropZone } from '../../lib/hooks/useWebAttachmentDropZone';
import { FIELD_LOOK } from './Input';
import { AttachmentPicker } from './AttachmentPicker';
import { MentionSuggestions } from './MentionSuggestions';
import { SelectedFilePreview } from './SelectedFilePreview';
import { VoiceMicButton } from './VoiceMicButton';

/**
 * The one message bar. Every box you write into is this.
 *
 * There were four of these — Clive's chat bar, the board reply bar, the new
 * thread modal and the new board modal — and each had been touched on a
 * different day, so they had drifted into four different answers to the same
 * questions. Different padding. Different character caps. Enter sent in three
 * of them and did nothing in the fourth. The mic sat inside the pill in two and
 * in a welded-on strip UNDER the box in the others, which is the wrong axis:
 * the mic is a thing you do TO the line you are typing, so it belongs on that
 * line, not on a shelf below it.
 *
 * Clive's bar was the one that was right, so this is Clive's bar generalised.
 * The three shapes the app actually needs:
 *
 *   variant="chat"        the pill. attach · text · send · mic, all one line.
 *                         Enter sends, Shift+Enter starts a new line.
 *   variant="form"        a labelled prose box. The mic lives on a footer strip
 *                         INSIDE the box's own border, with the counter.
 *   variant="inlineEdit"  edit-in-place. Same box, plus Cancel and Save.
 *
 * A React Native TextInput cannot have children, which is why the mic in the
 * form and inline-edit boxes is a footer row inside the SAME bordered container
 * as the field rather than literally inside the field. To the eye it is one box.
 *
 * Everything a call site used to hand-roll lives here now: mentions, dictation,
 * drafts (pass a draft-backed setter), attachments, drag-and-drop, the character
 * counter. Losing any one of those would make this worse than the four copies
 * it replaces, so none of them are optional-by-accident — you turn each on by
 * passing what it needs.
 */

export type ComposerVariant = 'chat' | 'form' | 'inlineEdit';

/**
 * The hairline every field in the app wears.
 *
 * Written down once, in `Input.tsx`'s `FIELD_LOOK`, and read from there — this
 * file and that one both used to declare it, which is two places for one truth
 * and the exact way a look drifts apart again.
 */
const FIELD_BORDER = FIELD_LOOK.border;
/** Below this many characters left, the chat bar starts counting down. */
const CHAT_LIMIT_WARNING = 1000;

const NO_IMAGES: SelectedImage[] = [];
const NO_FILES: SelectedFile[] = [];
const NO_MEMBERS: Pick<Profile, 'id' | 'name'>[] = [];

/**
 * Whether talking instead of typing is possible at all here.
 *
 * Speech recognition is a browser thing. On a phone the keyboard has its own
 * dictation key an inch below, so we draw nothing rather than an inert button —
 * and a footer strip holding only an invisible mic would be an empty bordered
 * shelf, which is why this is exported rather than left inside VoiceMicButton.
 */
export function isDictationSupported() {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
  );
}

export interface ComposerBarProps {
  variant?: ComposerVariant;

  value: string;
  /**
   * Takes a string OR an updater, so a plain `useState` setter and a
   * `usePersistentTextDraft` setter both drop straight in. Dictation needs the
   * updater form — it has to read what the box already said to append to it.
   */
  onChangeText: (next: string | ((previous: string) => string)) => void;

  placeholder?: string;
  /** Bold label above the box (form variant). */
  label?: string;
  /** Anything to show above the suggestions — e.g. a "Replying to Nat" chip. */
  header?: ReactNode;

  multiline?: boolean;
  minHeight?: number;
  maxHeight?: number;
  maxLength?: number;
  /**
   * 'auto' counts DOWN, and only once you are near the cap (the chat bar).
   * 'count' always shows "120/200" (the form boxes). 'none' shows nothing.
   */
  counter?: 'auto' | 'count' | 'none';
  editable?: boolean;
  autoFocus?: boolean;

  onSubmit?: () => void;
  /** Enter sends, Shift+Enter makes a new line. On by default. */
  submitOnEnterKey?: boolean;
  submitting?: boolean;
  /** Override "is there anything to send" — e.g. a form that also needs a title. */
  canSubmit?: boolean;
  submitLabel?: string;
  onCancel?: () => void;
  cancelLabel?: string;

  attachments?: 'none' | 'compact';
  selectedImages?: SelectedImage[];
  onImagesChange?: (images: SelectedImage[]) => void;
  selectedFiles?: SelectedFile[];
  onFilesChange?: (files: SelectedFile[]) => void;
  maxImages?: number;
  maxFiles?: number;
  /** Let a drop anywhere on the page land in this composer. */
  captureDocumentDrops?: boolean;

  /** Pass members to turn "@" tagging on. */
  mentionMembers?: Pick<Profile, 'id' | 'name'>[];
  mentionsLoading?: boolean;
  currentUserId?: string;

  containerClassName?: string;
  fieldClassName?: string;
}

export function ComposerBar({
  variant = 'chat',
  value,
  onChangeText,
  placeholder,
  label,
  header,
  multiline = true,
  minHeight,
  maxHeight,
  maxLength,
  counter,
  editable = true,
  autoFocus = false,
  onSubmit,
  submitOnEnterKey = true,
  submitting = false,
  canSubmit,
  submitLabel = 'Save',
  onCancel,
  cancelLabel = 'Cancel',
  attachments = 'none',
  selectedImages = NO_IMAGES,
  onImagesChange,
  selectedFiles = NO_FILES,
  onFilesChange,
  maxImages = 5,
  maxFiles = 5,
  captureDocumentDrops = false,
  mentionMembers = NO_MEMBERS,
  mentionsLoading = false,
  currentUserId,
  containerClassName = '',
  fieldClassName = '',
}: ComposerBarProps) {
  const isChat = variant === 'chat';
  const isInlineEdit = variant === 'inlineEdit';
  const showAttach = attachments === 'compact' && !!onImagesChange;

  const setText = useCallback((text: string) => onChangeText(text), [onChangeText]);
  // Dictation writes with the raw setter, not through the mention tracker:
  // mention tracking is about somebody typing "@", and speech never produces one.
  const dictation = useDictation(onChangeText);

  const mention = useMentionInput({
    value,
    onChangeText: setText,
    members: mentionMembers,
    currentUserId,
  });
  const mentionsOn = mentionMembers.length > 0 || mentionsLoading;

  const { dragDropProps, isDragActive } = useWebAttachmentDropZone({
    selectedImages,
    selectedFiles,
    onImagesChange: onImagesChange ?? (() => {}),
    onFilesChange,
    maxImages,
    maxFiles,
    captureDocumentDrops: showAttach && captureDocumentDrops,
    disabled: !showAttach || submitting || !editable,
  });

  const hasAttachments = selectedImages.length > 0 || selectedFiles.length > 0;
  const readyToSend = canSubmit ?? (value.trim().length > 0 || hasAttachments);
  const canFire = !!onSubmit && readyToSend && !submitting;

  // One press of Enter can reach us twice on web — once through the wrapper's
  // capture handler and once as the input's own submit event. The old copies
  // each got away with it for their own reasons; a shared bar cannot rely on
  // that, and sending the same message twice is the worst possible bug here.
  const lastSubmitAtRef = useRef(0);

  const handleSubmit = () => {
    if (!canFire) return;
    const now = Date.now();
    if (now - lastSubmitAtRef.current < 150) return;
    lastSubmitAtRef.current = now;
    onSubmit?.();
    mention.resetMentionSelection();
  };

  // Two belts for one pair of trousers, on purpose. `onKeyPress` is what React
  // Native gives us; the capture handler on the wrapper is what actually beats
  // the browser's own newline on web.
  const enterCaptureProps = submitOnEnterKey && onSubmit && Platform.OS === 'web'
    ? ({ onKeyDownCapture: submitOnEnter(handleSubmit) } as any)
    : {};

  const counterMode = counter ?? (isChat ? 'auto' : maxLength ? 'count' : 'none');
  const remaining = maxLength ? maxLength - value.length : Number.POSITIVE_INFINITY;
  const showCounter = counterMode === 'count'
    ? !!maxLength
    : counterMode === 'auto' && !!maxLength && remaining <= CHAT_LIMIT_WARNING;
  const counterText = counterMode === 'count'
    ? `${value.length}/${maxLength}`
    : `${Number.isFinite(remaining) ? remaining.toLocaleString() : ''} characters left`;

  const micNode = (
    <VoiceMicButton
      size={20}
      onTranscript={dictation.onTranscript}
      onInterimTranscript={dictation.onInterimTranscript}
    />
  );

  const textInputNode = (
    <TextInput
      value={value}
      onChangeText={mentionsOn ? mention.textInputMentionProps.onChangeText : setText}
      onSelectionChange={mentionsOn ? mention.textInputMentionProps.onSelectionChange : undefined}
      selection={mentionsOn ? mention.textInputMentionProps.selection : undefined}
      placeholder={placeholder}
      placeholderTextColor={FIELD_LOOK.placeholder}
      selectionColor={FIELD_LOOK.ink}
      multiline={multiline}
      // Enter never takes the cursor away from you on the web.
      //
      // This was `Platform.OS === 'web'` flat. react-native-web honours it for
      // MULTILINE boxes too, so on every prose field in this sweep, pressing
      // Enter inserted the newline and then threw you out of the box — two
      // sentences into your monthly tune-up, hit return for a new paragraph,
      // and you are typing into nothing. Two agents hit this independently
      // while converting and neither owned this file; both were right.
      //
      // It is false rather than "only when Enter sends", because the fields
      // where Enter DOES send are the ones you use repeatedly — add a to-do,
      // log a HIVE Help, send a message — and losing the cursor after each one
      // means clicking back in to write the next. Native keeps its own default,
      // where Return closing the keyboard on a single-line field is expected.
      blurOnSubmit={Platform.OS === 'web' ? false : undefined}
      submitBehavior={Platform.OS === 'web' ? 'submit' : 'newline'}
      returnKeyType="send"
      enterKeyHint="send"
      onSubmitEditing={submitOnEnterKey ? handleSubmit : undefined}
      onKeyPress={submitOnEnterKey && onSubmit ? submitOnEnter(handleSubmit) : undefined}
      maxLength={maxLength}
      editable={editable && !submitting}
      autoFocus={autoFocus}
      textAlignVertical={multiline ? 'top' : 'center'}
      className={
        isChat
          ? `flex-1 text-base text-charcoal py-1 px-1 ${fieldClassName || 'max-h-32'}`
          : `text-charcoal px-4 py-3 ${fieldClassName}`
      }
      style={[
        { fontFamily: FIELD_LOOK.font, outlineStyle: 'none', caretColor: FIELD_LOOK.ink } as any,
        minHeight ? { minHeight } : null,
        maxHeight ? { maxHeight } : null,
      ]}
    />
  );

  const attachmentPreviews = hasAttachments ? (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="mb-2"
      contentContainerStyle={{ gap: 8 }}
    >
      {selectedImages.map((image, index) => (
        <View key={image.uri} className="relative">
          <Image
            source={{ uri: image.uri }}
            style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: '#f3f4f6' }}
            contentFit="cover"
          />
          <Pressable
            onPress={() => onImagesChange?.(selectedImages.filter((_, i) => i !== index))}
            className="absolute -top-1 -right-1 bg-charcoal rounded-full w-5 h-5 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Remove photo"
          >
            <Ionicons name="close" size={12} color="white" />
          </Pressable>
        </View>
      ))}
      {selectedFiles.map((file, index) => (
        <SelectedFilePreview
          key={`${file.uri}-${index}`}
          file={file}
          onRemove={() => onFilesChange?.(selectedFiles.filter((_, i) => i !== index))}
          className="bg-white border border-gold/20"
          widthClassName="w-44"
        />
      ))}
    </ScrollView>
  ) : null;

  const dropBanner = isDragActive ? (
    <View className="mb-2 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2">
      <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-sm">
        Drop photos, videos, or files to attach
      </Text>
    </View>
  ) : null;

  const taggedPills = mentionsOn && (mention.mentionsEveryone || mention.mentionedMembers.length > 0) ? (
    <View className={`flex-row flex-wrap ${isChat ? 'mb-2' : 'mt-2'}`} style={{ gap: 6 }}>
      {mention.mentionsEveryone ? (
        <View className="bg-blue-50 border border-blue-200 rounded-full px-3 py-1">
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-blue-700 text-xs">
            Tagged everyone in HIVE
          </Text>
        </View>
      ) : (
        mention.mentionedMembers.map((member) => (
          <View key={member.id} className="bg-blue-50 border border-blue-200 rounded-full px-3 py-1">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-blue-700 text-xs">
              Tagged {member.name.split(/\s+/)[0]}
            </Text>
          </View>
        ))
      )}
    </View>
  ) : null;

  const suggestionsNode = mentionsOn ? (
    <MentionSuggestions
      active={mention.mentionQuery !== null}
      query={mention.mentionQuery}
      loading={mentionsLoading}
      suggestions={mention.mentionSuggestions}
      onSelect={mention.selectMention}
      placement={isChat ? 'above' : 'below'}
    />
  ) : null;

  // ---- the pill -----------------------------------------------------------
  if (isChat) {
    return (
      <View className={containerClassName} {...dragDropProps}>
        {header}
        {attachmentPreviews}
        {dropBanner}
        {suggestionsNode}
        {taggedPills}

        <View
          className={`flex-row items-end rounded-2xl px-3 py-2 border ${
            isDragActive ? 'bg-gold/10 border-gold' : 'bg-cream border-transparent'
          }`}
          {...enterCaptureProps}
        >
          {showAttach && (
            <AttachmentPicker
              compact
              selectedImages={selectedImages}
              onImagesChange={onImagesChange!}
              selectedFiles={selectedFiles}
              onFilesChange={onFilesChange}
              maxImages={maxImages}
              maxFiles={maxFiles}
              disabled={submitting || !editable}
            />
          )}
          {textInputNode}
          <Pressable
            onPress={handleSubmit}
            disabled={!canFire}
            className={`w-8 h-8 rounded-full items-center justify-center ml-2 ${
              canFire ? 'bg-gold active:opacity-80' : 'bg-[#ddd3b6]'
            }`}
            accessibilityRole="button"
            accessibilityLabel="Send"
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fffdf5" />
            ) : (
              <Text className="text-sm text-white" style={{ marginTop: -1 }}>↑</Text>
            )}
          </Pressable>
          <VoiceMicButton
            size={20}
            style={{ marginLeft: 6 }}
            onTranscript={dictation.onTranscript}
            onInterimTranscript={dictation.onInterimTranscript}
          />
        </View>

        {showCounter && (
          <Text
            style={{ fontFamily: 'Lato_400Regular' }}
            className={`mt-1 text-right text-xs ${remaining <= 100 ? 'text-red-500' : 'text-charcoal/45'}`}
          >
            {counterText}
          </Text>
        )}
      </View>
    );
  }

  // ---- the box (form + inline edit) ---------------------------------------
  // The footer only exists if it has something to hold. On a phone the mic is
  // not drawn at all, so without this the box would grow an empty shelf.
  const showFooter = isDictationSupported() || showAttach || showCounter || isInlineEdit;

  return (
    <View className={containerClassName} {...dragDropProps}>
      {header}
      {label ? (
        <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">
          {label}
        </Text>
      ) : null}

      {attachmentPreviews}
      {dropBanner}

      <View
        className="rounded-xl overflow-hidden"
        style={{
          borderWidth: 1,
          borderColor: isDragActive ? '#bd9348' : FIELD_BORDER,
          backgroundColor: isDragActive ? '#fdf3dc' : FIELD_LOOK.fill,
        }}
        {...enterCaptureProps}
      >
        {textInputNode}

        {showFooter && (
          <View
            className="flex-row items-center px-2 py-1.5"
            style={{ gap: 8, borderTopWidth: 1, borderTopColor: FIELD_BORDER }}
          >
            {showAttach && (
              <AttachmentPicker
                compact
                selectedImages={selectedImages}
                onImagesChange={onImagesChange!}
                selectedFiles={selectedFiles}
                onFilesChange={onFilesChange}
                maxImages={maxImages}
                maxFiles={maxFiles}
                disabled={submitting || !editable}
              />
            )}
            {micNode}
            <View className="flex-1" />
            {showCounter && (
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/40 text-xs">
                {counterText}
              </Text>
            )}
            {isInlineEdit && (
              <>
                {onCancel && (
                  <Pressable onPress={onCancel} className="px-3 py-1.5 rounded-lg active:opacity-60">
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/60 text-sm">
                      {cancelLabel}
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={handleSubmit}
                  disabled={!canFire}
                  className={`px-4 py-1.5 rounded-lg ${canFire ? 'bg-gold active:opacity-80' : 'bg-cream'}`}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#bd9348" />
                  ) : (
                    <Text
                      style={{ fontFamily: 'Lato_700Bold' }}
                      className={`text-sm ${canFire ? 'text-white' : 'text-charcoal/30'}`}
                    >
                      {submitLabel}
                    </Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        )}
      </View>

      {suggestionsNode}
      {taggedPills}
    </View>
  );
}
