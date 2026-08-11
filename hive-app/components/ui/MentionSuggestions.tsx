import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getGroupMentionSuggestions,
  getMentionTargetHandle,
  type MentionReach,
  type MentionTarget,
} from '../../lib/mentions';
import { accentOnDark, HIVE_GOLD } from '../../lib/hiveBrand';
import { HIVE_SKIN, SPACE_SKIN, usePageSkin } from '../../lib/pageSkin';
import { HiveMark } from './HiveMark';
import { WorldMark } from './WorldMark';

/**
 * The list that drops out of a composer when you type "@".
 *
 * Two things it has to get right, both learned the hard way:
 *
 * 1. **Every group row names who it reaches.** "Everyone in HIVE" was written
 *    when there was one HIVE and now means two things at once (Nat, 2026-08-06).
 *    Rows say "Everyone in OG HIVE" or "Everyone HIVE-Wide", and there are only
 *    ever the two of them — this HIVE, and every HIVE. `lib/mentions.ts` holds
 *    that reasoning. "Everyone HIVE-Wide" always shows up, even where this
 *    thing cannot actually travel that far, but greyed out and unpressable —
 *    `member.disabled` — with `description` explaining why instead of the row
 *    quietly doing nothing (Nat, 2026-08-11).
 * 2. **It wears the page's colours.** This was a hard-coded white panel with
 *    charcoal text, which on HIVE-Wide's night sky was a bright white slab
 *    sitting on black. Same trap as the cream composer pill: the ink followed
 *    the skin and the surface underneath it did not.
 */

interface MentionSuggestionsProps {
  suggestions: MentionTarget[];
  onSelect: (member: MentionTarget) => void;
  placement?: 'above' | 'below';
  active?: boolean;
  query?: string | null;
  loading?: boolean;
  /**
   * A light sheet can be open while the reader is standing in HIVE-Wide.
   * In that case the sheet, not the page behind it, owns the contrast.
   */
  tone?: 'light' | 'dark';
  /**
   * How far this composer's writing travels, and which HIVEs it may name.
   * Build it with `useMentionReach()`. Left out, the picker offers the one
   * group it can be sure of — everyone who can already see this.
   */
  reach?: MentionReach | null;
}

export function MentionSuggestions({
  suggestions,
  onSelect,
  placement = 'below',
  active = suggestions.length > 0,
  query = null,
  loading = false,
  reach = null,
  tone,
}: MentionSuggestionsProps) {
  const pageSkin = usePageSkin();
  const skin = tone === 'light' ? HIVE_SKIN : tone === 'dark' ? SPACE_SKIN : pageSkin;

  // Nat: "a little arrow to collapse this whole thing" — the list can run to
  // 240px right above the input, and on a phone that's most of the visible
  // room. Reopens on its own each time a fresh "@" is typed (`active` going
  // false-to-true), so collapsing once does not stick for the rest of the
  // conversation — only for this one lookup (2026-08-08).
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  // The group rows are derived here when a composer has told us its reach, so
  // the labels are right even for screens that hand their suggestions in from a
  // hook that never heard about HIVEs. One function makes them either way.
  const groupRows = getGroupMentionSuggestions(query, reach);
  const peopleRows = suggestions.filter((row) => !row.isBroadcast);
  const visibleSuggestions = reach
    ? [...groupRows, ...peopleRows]
    : suggestions.length > 0
      ? suggestions
      : groupRows;

  if (!active && visibleSuggestions.length === 0) return null;

  const emptyLabel = loading
    ? 'Loading people...'
    : query
      ? `No match for @${query}`
      : 'Type a name after @ to tag someone';

  return (
    <View
      style={{
        backgroundColor: skin.card,
        borderWidth: 1,
        borderColor: skin.border,
        borderRadius: 12,
        overflow: 'hidden',
        marginTop: placement === 'above' ? 0 : 8,
        marginBottom: placement === 'above' ? 8 : 0,
        // A long list on a small phone would push the composer off the screen,
        // so it caps and scrolls instead (Nat 2026-07-25).
        zIndex: 100,
        elevation: 20,
        maxHeight: 240,
      }}
    >
      {visibleSuggestions.length === 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 }}>
          <Ionicons
            name={loading ? 'hourglass-outline' : 'person-add-outline'}
            size={17}
            color={skin.dark ? skin.gold : '#8a6b30'}
          />
          <Text
            style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: skin.dark ? skin.inkSoft : '#7f715f', marginLeft: 8 }}
          >
            {emptyLabel}
          </Text>
        </View>
      ) : (
        <>
          <Pressable
            onPress={() => setOpen((current) => !current)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={open ? 'Tag someone, or a whole HIVE, open' : 'Tag someone, or a whole HIVE, shut'}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 12,
              paddingVertical: 6,
              backgroundColor: skin.dark ? 'rgba(255,255,255,0.06)' : 'rgba(189,147,72,0.1)',
            }}
          >
            <Text
              style={{
                fontFamily: 'Lato_700Bold',
                fontSize: 11,
                textTransform: 'uppercase',
                color: skin.dark ? skin.gold : '#8a6b30',
              }}
            >
              Tag someone, or a whole HIVE
            </Text>
            <Ionicons
              name={open ? 'chevron-up' : 'chevron-down'}
              size={15}
              color={skin.dark ? skin.gold : '#8a6b30'}
            />
          </Pressable>
          {open && (
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {visibleSuggestions.map((member, index) => {
              const handle = getMentionTargetHandle(member);
              const isLast = index === visibleSuggestions.length - 1;
              // Tech's blue is unreadable on the HIVE-Wide page, so a HIVE's
              // colour is lifted before it is used as ink or a mark on dark.
              const accent = member.accent || HIVE_GOLD;
              const markColour = skin.dark ? accentOnDark(accent) : accent;
              // "Everyone HIVE-Wide" shows up even where this thing can't
              // actually reach that far — Nat, 2026-08-11, wanted it greyed
              // out rather than hidden, with a reason in place of the row's
              // normal description, so tapping it does nothing instead of
              // quietly sending nobody a notification.
              const disabled = !!member.disabled;
              const dimOpacity = disabled ? 0.45 : 1;

              return (
                <Pressable
                  key={member.id}
                  onPress={disabled ? undefined : () => onSelect(member)}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityState={{ disabled }}
                  accessibilityLabel={
                    member.description ? `${member.name}. ${member.description}` : member.name
                  }
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    backgroundColor: !disabled && pressed ? skin.cardPressed : 'transparent',
                    borderBottomWidth: isLast ? 0 : 1,
                    borderBottomColor: skin.border,
                  })}
                >
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      marginRight: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      opacity: dimOpacity,
                      backgroundColor:
                        member.group === 'hive_wide'
                          ? 'transparent'
                          : skin.dark
                            ? 'rgba(255,255,255,0.09)'
                            : 'rgba(189,147,72,0.15)',
                    }}
                  >
                    {member.group === 'hive_wide' ? (
                      // The same Earth the HIVE-Wide page is a photograph of,
                      // so "goes everywhere" looks the same here as on a badge.
                      <WorldMark size={28} />
                    ) : member.group === 'hive' ? (
                      <HiveMark size={16} colour={markColour} />
                    ) : member.isBroadcast ? (
                      <Ionicons name="people-outline" size={16} color={skin.gold} />
                    ) : (
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: skin.gold }}>
                        {member.name.charAt(0)}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1, opacity: dimOpacity }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: skin.ink }}>
                      {member.name}
                    </Text>
                    {member.description && (
                      <Text
                        style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: skin.dark ? skin.inkSoft : '#7f715f' }}
                      >
                        {member.description}
                      </Text>
                    )}
                  </View>
                  {!disabled && (
                    <Text
                      style={{
                        fontFamily: 'Lato_400Regular',
                        fontSize: 13,
                        marginLeft: 8,
                        color: skin.dark
                          ? member.group === 'hive' ? markColour : skin.gold
                          : '#8a6b30',
                      }}
                    >
                      @{handle}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
          )}
        </>
      )}
    </View>
  );
}
