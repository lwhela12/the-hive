import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Platform, Pressable, TextInput, View, Text, useWindowDimensions } from 'react-native';
import { headerForSection } from '../../lib/newsletterHeaders';
import { MentionSuggestions } from '../ui/MentionSuggestions';
import { useMentionInput } from '../../lib/hooks/useMentionInput';
import { getMentionedMembers, getMentionTargetHandle } from '../../lib/mentions';
import type { Profile } from '../../types';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/**
 * One line, double-click (web) or double-tap (native) to edit in place.
 *
 * Nat, 2026-08-24, first attempt: a manual "two `onPress` calls within
 * 400ms" timer on `Pressable`. She reported it did nothing — and the
 * reason is real, not a fluke: React Native Web's `Pressable` doesn't
 * forward `onDoubleClick` to the DOM at all (`forwardedProps/index.js` has
 * no such key), and its own press-responder collapses a fast double
 * click into a single `onPress` more often than not. A real `dblclick`
 * listener attached straight to the underlying DOM node, found via `ref`,
 * is what a browser actually fires on a genuine double click — that's
 * the primary path here. The `onPress` timer stays as the fallback for
 * the iOS app, where there is no DOM and no `dblclick` event at all.
 */
function EditableLine({
  editable,
  editing,
  draftText,
  onChangeDraft,
  onCommit,
  onCancel,
  onRequestEdit,
  inputStyle,
  children,
  className,
  style,
  mentionMembers,
}: {
  editable: boolean;
  editing: boolean;
  draftText: string;
  onChangeDraft: (text: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onRequestEdit: () => void;
  inputStyle: object;
  children: ReactNode;
  className?: string;
  style?: object;
  /**
   * Turns on "@" to reassign, for a duty line only. Nat, 2026-08-24: "just
   * doing the @ thing is the cleanest and easiest" — the same tag-someone
   * picker the rest of the app already has, not a separate Reassign button.
   * Typing "@Meg" here and blurring is what SummarySections.tsx reads as a
   * real reassignment, not just a text edit.
   */
  mentionMembers?: Pick<Profile, 'id' | 'name'>[];
}) {
  const nodeRef = useRef<unknown>(null);
  const lastPressRef = useRef(0);
  const mention = useMentionInput({
    value: draftText,
    onChangeText: onChangeDraft,
    members: mentionMembers ?? [],
  });

  useEffect(() => {
    if (!editable || Platform.OS !== 'web') return;
    const node = nodeRef.current as (EventTarget & { addEventListener?: unknown }) | null;
    if (!node || typeof node.addEventListener !== 'function') return;
    const handler = (event: Event) => {
      event.preventDefault();
      onRequestEdit();
    };
    node.addEventListener('dblclick', handler);
    return () => node.removeEventListener?.('dblclick', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable]);

  if (editing) {
    return (
      <View>
        <TextInput
          value={draftText}
          multiline
          autoFocus
          textAlignVertical="top"
          onBlur={onCommit}
          onKeyPress={(event) => {
            if (event.nativeEvent.key === 'Escape') onCancel();
          }}
          style={inputStyle}
          {...(mentionMembers ? mention.textInputMentionProps : { onChangeText: onChangeDraft })}
        />
        {mentionMembers ? (
          <MentionSuggestions
            suggestions={mention.mentionSuggestions}
            onSelect={mention.selectMention}
            query={mention.mentionQuery}
            active={mention.mentionQuery !== null}
            tone="light"
          />
        ) : null}
      </View>
    );
  }

  return (
    <Pressable
      ref={nodeRef as never}
      onPress={() => {
        if (!editable) return;
        const now = Date.now();
        if (now - lastPressRef.current < 400) {
          lastPressRef.current = 0;
          onRequestEdit();
        } else {
          lastPressRef.current = now;
        }
      }}
      accessibilityHint={editable ? 'Double tap to edit' : undefined}
      className={className}
      style={style}
    >
      {children}
    </Pressable>
  );
}

export interface SummarySection {
  title: string;
  lines?: string[];
  intro?: string;
  groups?: SummaryGroup[];
  tone?: 'default' | 'warm' | 'warning';
  /** Stored audit provenance, shown quietly at the foot of each working section. */
  source_label?: string;
}

export interface MeetingConflictReview {
  kind: 'action_item_owner' | 'record_correction';
  conflict_id: string;
  action_item_id?: string;
  task_description?: string;
  current_owner_id?: string;
  current_owner_name?: string;
  /** Exact generated duty line, used to update only that line after review. */
  summary_line?: string;
}

export interface SummaryGroup {
  title: string;
  lines: string[];
  meta?: string;
  review?: MeetingConflictReview;
}

const MEETING_SECTION_ICONS: Record<string, string> = {
  'Roll Call': '🐝',
  'How We Arrived': '⚡',
  'News from Nat': '📣',
  Treasurer: '🍯',
  'Plan the Meet Ups': '🗓️',
  'HummDinger Sesh': '💛',
  'Wrap-Up': '✨',
  'Needs Review': '⚠️',
};

/**
 * The house style for "here's what you missed" — used by the meeting summary
 * and the newsletter draft, which are the same artifact pointed at different
 * dates. Each section is a paper card: a small letterspaced serif heading over
 * a gold hairline, then quiet body text where only the thing that NAMES the
 * line carries weight, so the eye lands on names instead of fighting a wall of
 * bold (Nat 2026-07-25).
 *
 * A line indented with four spaces hangs under the line above it — that's how
 * POP labels and hang dates stay attached to the person or heading they belong
 * to without needing a nested data shape.
 *
 * `art` turns on Nat's hand-made section headers (lib/newsletterHeaders.ts).
 * It is off by default because this component also draws the meeting summary,
 * which is a working document — "Community Wins" in gold over a set of action
 * items would be dressing up a to-do list. The newsletter passes it.
 */
export interface DutyMeta {
  action_item_ids: string[];
  owner_ids: (string | null)[];
}

/**
 * A duty line's real, stable identity — the actual `action_items` rows it
 * is, not the position it happens to render at. Nat, 2026-08-24, after a
 * rebuild silently moved a duty to a new position: a correction keyed by
 * `group 3, line 3` doesn't mean anything once the duty at that position
 * is a different one. The set of underlying row ids does not move.
 */
function dutyKey(meta: DutyMeta): string {
  return `duty:${[...meta.action_item_ids].sort().join(',')}`;
}

export function SummarySections({
  sections,
  art = false,
  renderReview,
  lineCorrections,
  editable = false,
  onSaveLine,
  dutyIndex,
  hiddenLines,
  mentionMembers,
  onReassignByMention,
  onDeleteDuty,
}: {
  sections: SummarySection[];
  /** Use the drawn headers. Newsletter yes, meeting summary no. */
  art?: boolean;
  /** Meeting summaries may resolve a source conflict inside its own card. */
  renderReview?: (review: MeetingConflictReview, group: SummaryGroup) => ReactNode;
  /** A human rewrite of one line. A duty line is keyed by `dutyKey()` (stable across rebuilds); anything else by position. Wins over the generated line, in place — the rest of the card is untouched. */
  lineCorrections?: Record<string, string>;
  /** Double-click/double-tap to edit any line. Meeting summaries only — never the newsletter. */
  editable?: boolean;
  /** Persists one line's correction (empty text clears it back to the generated version). */
  onSaveLine?: (key: string, text: string) => Promise<void> | void;
  /** Which real `action_items` row(s) a duty line actually is, keyed by its position THIS render (`section::g<i>::<j>`) — used to resolve the stable `dutyKey()` and to detect a real reassign. */
  dutyIndex?: Record<string, DutyMeta>;
  /** Duty keys archived away — the line no longer renders at all. */
  hiddenLines?: Record<string, true>;
  /** Turns on "@" reassign on every duty line. */
  mentionMembers?: Pick<Profile, 'id' | 'name'>[];
  /** A duty line was double-clicked, "@Someone" typed, and blurred — the real reassignment, not just a text edit. */
  onReassignByMention?: (key: string, member: Pick<Profile, 'id' | 'name'>, actionItemIds: string[], cleanedText: string) => Promise<void> | void;
  /** A duty line was double-clicked, cleared to empty, and blurred — delete, not "revert to generated" (which would be pointless — the generated text is the thing being deleted). */
  onDeleteDuty?: (key: string, lineText: string, actionItemIds: string[]) => void;
}) {
  const { width } = useWindowDimensions();
  const [expandedMeetingSections, setExpandedMeetingSections] = useState<Set<string>>(() => new Set());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');

  const commitEdit = async (key: string, original: string, dutyMeta?: DutyMeta) => {
    if (editingKey !== key) return;
    setEditingKey(null);
    const text = draftText;
    if (text === original) return;

    if (dutyMeta) {
      if (!text.trim() && onDeleteDuty) {
        onDeleteDuty(key, original, dutyMeta.action_item_ids);
        return;
      }
      const mentioned = mentionMembers ? getMentionedMembers(text, mentionMembers) : [];
      if (mentioned.length > 0 && onReassignByMention) {
        const member = mentioned[0];
        const cleaned = text
          .replace(new RegExp(`@${escapeRegExp(getMentionTargetHandle(member))}\\s*`, 'i'), '')
          .trim();
        const finalText = /—\s*[^—]+$/.test(cleaned)
          ? cleaned.replace(/—\s*[^—]+$/, `— ${firstNameOf(member.name)}`)
          : `${cleaned} — ${firstNameOf(member.name)}`;
        await onReassignByMention(key, member, dutyMeta.action_item_ids, finalText);
        return;
      }
    }

    await onSaveLine?.(key, text);
  };

  if (!sections || sections.length === 0) return null;

  // The summary follows the Meeting Helper instead of turning every source into
  // one undifferentiated bullet stream. Slides become warm working cards;
  // people and decisions retain a second level of hierarchy inside each card.
  if (!art) {
    return (
      <View style={{ gap: 16 }}>
        {sections.map((section) => {
          const canCollapse = section.title === 'How We Arrived';
          const expanded = !canCollapse || expandedMeetingSections.has(section.title);
          const warning = section.tone === 'warning';
          return (
            <View
              key={section.title}
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: warning ? '#efc7a7' : '#eadfcf',
                backgroundColor: warning ? '#fff8f1' : section.tone === 'warm' ? '#fffaf0' : '#fffdf9',
                overflow: 'hidden',
              }}
            >
              <View style={{ paddingHorizontal: 18, paddingTop: 17, paddingBottom: expanded ? 12 : 17 }}>
                {canCollapse ? (
                  <Pressable
                    onPress={() => setExpandedMeetingSections((current) => {
                      const next = new Set(current);
                      if (next.has(section.title)) next.delete(section.title);
                      else next.add(section.title);
                      return next;
                    })}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    accessibilityLabel={`${expanded ? 'Hide' : 'Read'} ${section.title}`}
                    className="flex-row items-center"
                  >
                    <Text style={{ fontSize: 22, marginRight: 10 }}>{MEETING_SECTION_ICONS[section.title] ?? '✦'}</Text>
                    <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 19, lineHeight: 26, color: '#2d2d2d', flex: 1 }}>
                      {section.title}
                    </Text>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#8a6a2f' }}>
                      {expanded ? 'Hide' : 'Read'}
                    </Text>
                  </Pressable>
                ) : (
                  <View className="flex-row items-center">
                    <Text style={{ fontSize: 22, marginRight: 10 }}>{MEETING_SECTION_ICONS[section.title] ?? '✦'}</Text>
                    <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 19, lineHeight: 26, color: warning ? '#8b4b24' : '#2d2d2d', flex: 1 }}>
                      {section.title}
                    </Text>
                  </View>
                )}
                {expanded && section.intro ? (
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14.5, lineHeight: 21, color: '#6f6559', marginTop: 8 }}>
                    {section.intro}
                  </Text>
                ) : null}
              </View>

              {expanded ? (
                <View style={{ paddingHorizontal: 18, paddingBottom: 16, gap: 10 }}>
                  {(section.groups ?? []).map((group, groupIndex) => (
                    <View
                      key={`${section.title}-${group.title}-${groupIndex}`}
                      style={{
                        borderRadius: 13,
                        backgroundColor: warning ? '#fffdf9' : '#ffffff',
                        borderWidth: 1,
                        borderColor: warning ? '#f0d7c1' : '#eee6da',
                        padding: 13,
                      }}
                    >
                      <View className="flex-row items-start">
                        <View className="flex-1">
                          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, lineHeight: 21, color: warning ? '#8b4b24' : '#3b342b' }}>
                            {group.title}
                          </Text>
                          {group.meta ? (
                            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, lineHeight: 17, color: '#9a8060', marginTop: 2 }}>
                              {group.meta}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      <View style={{ marginTop: 7, gap: 6 }}>
                        {group.lines.map((line, lineIndex) => {
                          const positionalKey = `${section.title}::g${groupIndex}::${lineIndex}`;
                          const dutyMeta = dutyIndex?.[positionalKey];
                          // A duty's real identity is the row(s) it is, not where it landed
                          // this render — everything else has no such identity, so it keeps
                          // the positional key, which is the best available.
                          const key = dutyMeta ? dutyKey(dutyMeta) : positionalKey;
                          if (hiddenLines?.[key]) return null;
                          const effectiveLine = lineCorrections?.[key] ?? line;
                          const duty = effectiveLine.startsWith('Confirmed duty:');
                          const clean = duty ? effectiveLine.replace(/^Confirmed duty:\s*/, '') : effectiveLine;
                          const isEditingThis = editingKey === key;
                          return (
                            <View key={lineIndex}>
                              <EditableLine
                                editable={editable && !!onSaveLine}
                                editing={isEditingThis}
                                draftText={draftText}
                                onChangeDraft={setDraftText}
                                onCommit={() => void commitEdit(key, effectiveLine, dutyMeta)}
                                onCancel={() => setEditingKey(null)}
                                onRequestEdit={() => {
                                  setDraftText(effectiveLine);
                                  setEditingKey(key);
                                }}
                                className="flex-row items-start"
                                inputStyle={{
                                  backgroundColor: '#ffffff',
                                  borderWidth: 1,
                                  borderColor: '#bd9348',
                                  borderRadius: 8,
                                  padding: 8,
                                  fontFamily: 'Lato_400Regular',
                                  fontSize: 14.5,
                                  lineHeight: 21,
                                  color: '#453f37',
                                }}
                                mentionMembers={duty && dutyMeta ? mentionMembers : undefined}
                              >
                                <Text style={{ color: duty ? '#bd9348' : '#c7a76b', fontSize: 13, lineHeight: 21, marginRight: 8 }}>
                                  {duty ? '✓' : '•'}
                                </Text>
                                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14.5, lineHeight: 21, color: '#453f37', flex: 1 }}>
                                  {duty ? <Text style={{ fontFamily: 'Lato_700Bold', color: '#6d5427' }}>Confirmed duty: </Text> : null}
                                  {clean}
                                </Text>
                              </EditableLine>
                            </View>
                          );
                        })}
                      </View>
                      {group.review && renderReview ? renderReview(group.review, group) : null}
                    </View>
                  ))}

                  {(section.lines ?? []).map((line, index) => {
                    const key = `${section.title}::s${index}`;
                    const effectiveLine = lineCorrections?.[key] ?? line;
                    const indented = effectiveLine.startsWith('    ');
                    const text = effectiveLine.trim();
                    return (
                      <EditableLine
                        key={index}
                        editable={editable && !!onSaveLine}
                        editing={editingKey === key}
                        draftText={draftText}
                        onChangeDraft={setDraftText}
                        onCommit={() => void commitEdit(key, effectiveLine)}
                        onCancel={() => setEditingKey(null)}
                        onRequestEdit={() => {
                          setDraftText(effectiveLine);
                          setEditingKey(key);
                        }}
                        className="flex-row"
                        style={{ paddingLeft: indented ? 18 : 0 }}
                        inputStyle={{
                          backgroundColor: '#ffffff',
                          borderWidth: 1,
                          borderColor: '#bd9348',
                          borderRadius: 8,
                          padding: 8,
                          marginLeft: indented ? 18 : 0,
                          fontFamily: 'Lato_400Regular',
                          fontSize: 14.5,
                          lineHeight: 21,
                          color: '#3f3a33',
                        }}
                      >
                        {!indented ? <Text style={{ color: '#b58a39', fontSize: 14, lineHeight: 22, marginRight: 9 }}>•</Text> : null}
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: indented ? 14 : 15, lineHeight: 22, color: '#3f3a33', flex: 1 }}>
                          {text}
                        </Text>
                      </EditableLine>
                    );
                  })}

                  {section.source_label ? (
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11.5, lineHeight: 17, color: '#9a8060', marginTop: 2 }}>
                      Source: {section.source_label}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    );
  }

  // The art is a wide band; it has to know how much room it actually has or it
  // either overflows the card or floats in a box three times its height.
  const artWidth = Math.min(width - 72, 560);

  return (
    <View>
      {sections.map((section) => {
        const header = art ? headerForSection(section.title) : null;
        return (
        <View
          key={section.title}
          className="mb-4 bg-paper rounded-2xl border border-gold/20 px-5 pt-4 pb-3"
        >
          {header ? (
            <View style={{ alignItems: 'center', marginTop: 2, marginBottom: 10 }}>
              <Image
                source={header.source}
                accessibilityLabel={header.alt}
                style={{ width: artWidth, height: artWidth / header.ratio }}
                resizeMode="contain"
              />
            </View>
          ) : (
            <>
              {/* No art for this one — draw a heading out of the same parts the
                  art is made of (gold serif, a sparkle, a hairline) so a new
                  section reads as part of the same publication rather than as
                  the one that didn't get a picture. */}
              <View style={{ alignItems: 'center', marginTop: 4 }}>
                <Text style={{ fontSize: 13, color: '#dcbf7e', marginBottom: 2 }}>✦</Text>
                <Text
                  style={{
                    fontFamily: 'LibreBaskerville_400Regular',
                    fontSize: 17,
                    lineHeight: 25,
                    color: '#c2952f',
                    textAlign: 'center',
                  }}
                >
                  {section.title}
                </Text>
                {section.source_label ? (
                  <Text
                    style={{
                      fontFamily: 'Lato_400Regular',
                      fontSize: 11,
                      lineHeight: 16,
                      color: '#9a8060',
                      textAlign: 'center',
                      marginTop: 4,
                    }}
                  >
                    {section.source_label}
                  </Text>
                ) : null}
              </View>
            </>
          )}
          <View
            style={{
              height: 1,
              backgroundColor: '#bd934826',
              marginTop: header ? 0 : 8,
              marginBottom: 12,
            }}
          />
          {(section.lines ?? []).map((line, index) => {
            const indented = line.startsWith('    ');
            const text = line.trim();
            // A person's name opens their block — give it air above.
            const startsBlock = !indented
              && index > 0
              && (section.lines ?? [])[index - 1]?.startsWith('    ');
            if (indented) {
              const [label, ...rest] = text.split(': ');
              const body = rest.join(': ');
              return (
                <View key={index} style={{ paddingLeft: 20, marginBottom: 5 }}>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21, color: '#6f6559' }}>
                    {body ? (
                      <>
                        <Text style={{ fontFamily: 'Lato_700Bold', color: '#a08347' }}>{label}: </Text>
                        {body}
                      </>
                    ) : text}
                  </Text>
                </View>
              );
            }
            // "Sara: Europe is happening" — the name leads, the rest reads.
            const lead = text.match(/^([^:]{1,32}):\s+(.+)$/);
            return (
              <View
                key={index}
                className="flex-row"
                style={{ marginBottom: 9, marginTop: startsBlock ? 14 : 0 }}
              >
                <Text style={{ color: '#c9a76a', fontSize: 13, lineHeight: 22, marginRight: 10 }}>◆</Text>
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14.5, lineHeight: 22, color: '#3f3a33', flex: 1 }}>
                  {lead ? (
                    <>
                      <Text style={{ fontFamily: 'Lato_700Bold', color: '#2d2d2d' }}>{lead[1]}: </Text>
                      {lead[2]}
                    </>
                  ) : text}
                </Text>
              </View>
            );
          })}
        </View>
        );
      })}
    </View>
  );
}
