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
import type { MentionReach } from '../../lib/mentions';
import { FIELD_LOOK, fieldLookFor } from './Input';
import { usePageSkin } from '../../lib/pageSkin';
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
 *   variant="form"        a labelled prose box. text · mic on one line.
 *   variant="inlineEdit"  edit-in-place. Same box, plus Cancel and Save.
 *
 * A React Native TextInput cannot have children, so the mic sits BESIDE the
 * field in a row rather than literally inside it — same bordered container,
 * same line. It used to live on a footer strip under the field, which is the
 * wrong axis and which people read as a second box: Lucas tried to type in it
 * (Nat, 2026-09-02, on where the mic goes — *"the answer is: inline"*).
 *
 * A box with no attachments, no counter and no Save button now has no footer at
 * all. One box, one place to type, nothing under it.
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
  /** Combined image + file cap. */
  maxAttachments?: number;
  /** Let a drop anywhere on the page land in this composer. */
  captureDocumentDrops?: boolean;

  /** Pass members to turn "@" tagging on. */
  mentionMembers?: Pick<Profile, 'id' | 'name'>[];
  mentionsLoading?: boolean;
  currentUserId?: string;
  /**
   * How far what is written here can travel — build it with `useMentionReach()`
   * on the screen that knows: the room's reach, the board's reach, the wish's
   * share scope.
   *
   * It decides which whole-group rows the picker offers and what the "you
   * tagged everyone" pill says. Left out, both settle on the one group that
   * cannot leak — everyone who can already see this — so a screen that is not
   * sure passes nothing rather than a guess.
   */
  mentionReach?: MentionReach | null;

  containerClassName?: string;
  fieldClassName?: string;
  /**
   * Which page this box is sitting on. Defaults to the page you are actually
   * on, so a field at HIVE-Wide stops being a white rectangle on the night sky
   * (Nat 2026-08-05). A cream panel that happens to be open while you are at
   * HIVE-Wide should pass 'light' and say so.
   */
  tone?: 'light' | 'dark';
}

export function ComposerBar({
  tone,
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
  maxAttachments,
  captureDocumentDrops = false,
  mentionMembers = NO_MEMBERS,
  mentionsLoading = false,
  mentionReach = null,
  currentUserId,
  containerClassName = '',
  fieldClassName = '',
}: ComposerBarProps) {
  // The page decides how a field is drawn unless the caller knows better.
  const pageSkin = usePageSkin();
  const look = fieldLookFor(tone ?? (pageSkin.dark ? 'dark' : 'light'));
  const FIELD_BORDER = look.border;
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
    reach: mentionReach,
  });
  const mentionsOn = mentionMembers.length > 0 || mentionsLoading;

  const { dragDropProps, isDragActive } = useWebAttachmentDropZone({
    selectedImages,
    selectedFiles,
    onImagesChange: onImagesChange ?? (() => {}),
    onFilesChange,
    maxImages,
    maxFiles,
    maxAttachments,
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
      tone={tone}
      onTranscript={dictation.onTranscript}
      onInterimTranscript={dictation.onInterimTranscript}
    />
  );

  /**
   * The box, so the shelf under it can hand the cursor back.
   *
   * Nat, 2026-09-02, watching Lucas fill in his first check-in: *"the
   * talk-to-text microphone, he felt like it was in a weird spot. He kept
   * trying to tap next to it. When it tagged Infiniti he didn't know to tap
   * after Infiniti to be able to type."*
   *
   * The footer is inside the field's own border so the two read as one box —
   * and a person who reads them as one box taps the empty half of the shelf
   * expecting to type there. It did nothing. A dead tap in the middle of
   * something that looks like an input is the app saying "not here" without
   * saying where.
   */
  const inputRef = useRef<TextInput>(null);
  const handBackTheCursor = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const textInputNode = (
    <TextInput
      ref={inputRef}
      value={value}
      onChangeText={mentionsOn ? mention.textInputMentionProps.onChangeText : setText}
      onSelectionChange={mentionsOn ? mention.textInputMentionProps.onSelectionChange : undefined}
      selection={mentionsOn ? mention.textInputMentionProps.selection : undefined}
      placeholder={placeholder}
      placeholderTextColor={look.placeholder}
      selectionColor={look.ink}
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
        { fontFamily: look.font, color: look.ink, outlineStyle: 'none', caretColor: look.ink } as any,
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
            style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: look.pillFill }}
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

  // Who a whole-group tag actually reaches, in words. This pill used to read
  // "Tagged everyone in HIVE" no matter what — which named nobody once there
  // was more than one HIVE, and was flatly wrong in a two-person chat. The
  // sentence now comes from the same reach the picker offered from, so the pill
  // and the row you tapped say the same thing.
  const groupMentionLabel = mention.groupMentionLabel;

  const taggedPills = mentionsOn && (groupMentionLabel || mention.mentionedMembers.length > 0) ? (
    <View className={`flex-row flex-wrap ${isChat ? 'mb-2' : 'mt-2'}`} style={{ gap: 6 }}>
      {groupMentionLabel ? (
        <View className="bg-blue-50 border border-blue-200 rounded-full px-3 py-1">
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-blue-700 text-xs">
            {groupMentionLabel}
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
      reach={mentionReach}
      tone={tone}
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

        {/* The pill takes its colour from the page, like the ink does.
            It was hard-coded `bg-cream` while the text followed the skin, so on
            a dark page you got cream-white letters on a cream pill and typing
            looked like nothing was happening at all (Nat 2026-08-05: "this text
            box isnt working"). It was working; it was invisible. */}
        <View
          className="flex-row items-end rounded-2xl px-3 py-2 border"
          style={{
            backgroundColor: isDragActive
              ? (look === FIELD_LOOK ? 'rgba(189,147,72,0.1)' : 'rgba(255,226,166,0.16)')
              : look.pillFill,
            borderColor: isDragActive ? '#bd9348' : 'transparent',
          }}
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
              maxAttachments={maxAttachments}
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
            tone={tone}
            style={{ marginLeft: 6 }}
            onTranscript={dictation.onTranscript}
            onInterimTranscript={dictation.onInterimTranscript}
          />
        </View>

        {showCounter && (
          <Text
            style={{
              fontFamily: 'Lato_400Regular',
              color: remaining <= 100 ? '#ef4444' : look.placeholder,
            }}
            className="mt-1 text-right text-xs"
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
  /**
   * The shelf now holds only things that are not the mic.
   *
   * With the mic on the text line, a box with no attachments, no counter and no
   * Save button has no footer at all — which is Quick Add, the check-in prose
   * fields, and most of the app. One box, one place to type, nothing under it.
   */
  const showFooter = showAttach || showCounter || isInlineEdit;

  return (
    <View className={containerClassName} {...dragDropProps}>
      {header}
      {label ? (
        <Text style={{ fontFamily: 'Lato_700Bold', color: look.ink }} className="mb-2">
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
          backgroundColor: isDragActive ? (look === FIELD_LOOK ? '#fdf3dc' : 'rgba(255,226,166,0.16)') : look.fill,
        }}
        {...enterCaptureProps}
      >
        {/**
          * The mic sits ON the line you are typing, not under it.
          *
          * Nat, 2026-09-02, after watching Lucas: *"the answer is: inline."*
          * The footer strip was inside the field's border so the two would read
          * as one box, and they did not — they read as two, and he tapped the
          * lower one to type. Giving the empty half of the shelf a focus
          * handler patched the symptom; this removes the second box.
          *
          * It is what this file's own opening note always said: *"the mic is a
          * thing you do TO the line you are typing, so it belongs on that line,
          * not on a shelf below it."* The chat pill has always had it right.
          * Form boxes now do too.
          *
          * `items-end` because a prose box grows downward — the mic stays with
          * the last line you wrote rather than floating beside the first.
          */}
        <View className="flex-row items-end">
          <View className="flex-1">{textInputNode}</View>
          {isDictationSupported() ? (
            /**
             * The whole column hands the cursor back, not just the button.
             *
             * `items-end` keeps the mic with the last line you wrote, which
             * leaves the space ABOVE it — 44 points wide by the height of a
             * 200-point board composer — belonging to nothing. That is the same
             * dead tap inside a field that this file spent the morning removing
             * from the shelf below, moved to the other axis. The mic's own
             * Pressable still wins where it actually sits.
             */
            <Pressable
              onPress={handBackTheCursor}
              accessibilityLabel="Keep typing"
              className="pr-2 pb-2 pl-1 self-stretch justify-end"
            >
              {micNode}
            </Pressable>
          ) : null}
        </View>

        {showFooter && (
          <View
            className="flex-row items-center px-2 py-1.5"
            style={{
              gap: 8,
              borderTopWidth: 1,
              borderTopColor: FIELD_BORDER,
              // Tinted so it reads as a shelf of tools rather than a second
              // place to type. The border alone made two boxes of one.
              // `look`, not `tone` — tone is optional and resolves against the
              // page skin above, so asking `tone === 'light'` would tint an
              // unspecified light field as if it were dark. Same test the drag
              // banner a few lines up uses.
              backgroundColor: look === FIELD_LOOK ? 'rgba(154,128,96,0.05)' : 'rgba(255,255,255,0.04)',
            }}
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
                maxAttachments={maxAttachments}
                disabled={submitting || !editable}
              />
            )}
            {/* Tapping the shelf still gives the cursor back — it is a smaller
                shelf now, but a dead tap inside something that looks like a
                field is the app saying "not here" without saying where. */}
            <Pressable
              onPress={handBackTheCursor}
              // A place to click, never a thing to land on. react-native-web
              // gives every Pressable a tabIndex, so without this, tabbing out
              // of the box stopped on an invisible element announced as "Keep
              // typing" before it ever reached Cancel or Save.
              focusable={false}
              importantForAccessibility="no"
              className="flex-1 self-stretch"
            />
            {showCounter && (
              <Text style={{ fontFamily: 'Lato_400Regular', color: look.placeholder }} className="text-xs">
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
