import { useCallback, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { usePageSkin } from '../../lib/pageSkin';
import { ModalBackdrop } from './ModalBackdrop';
import { calendarChoices, type CalendarChoice } from '../../lib/addToCalendar';
import type { Event } from '../../types';

/**
 * "Add to Calendar", asked properly.
 *
 * On a phone this has always offered three real choices. In a browser — which
 * is where almost everybody uses the HIVE — it was a `window.confirm`:
 *
 *     Open Google Calendar? Press Cancel to download a calendar file instead.
 *
 * So the Apple half of every HIVE was told to press **Cancel** to get what they
 * wanted, which reads as "no, don't add it". Nat, 2026-09-03, describing who is
 * actually in the room: *"1/2 use apple cal & 1/2 use google cal, you know? and
 * I'm sure some just use a notebook or whatever."* Half the members were being
 * offered the wrong button.
 *
 * A real view, so it behaves the same on both, wears the page's colours, and
 * names each calendar rather than making one of them the refusal.
 */
export function AddToCalendarDialog({
  event,
  onClose,
}: {
  event: Event | null;
  onClose: () => void;
}) {
  const skin = usePageSkin();
  if (!event) return null;
  const choices = calendarChoices(event);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <ModalBackdrop
        onClose={onClose}
        style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}
        sheetStyle={{ width: '100%', maxWidth: 380 }}
      >
        <View
          style={{
            backgroundColor: skin.dark ? '#0F1119' : skin.card,
            borderColor: skin.border,
            borderWidth: 1,
            borderRadius: 20,
            padding: 24,
          }}
        >
          <Text
            style={{
              fontFamily: 'LibreBaskerville_400Regular',
              fontSize: 20,
              lineHeight: 28,
              color: skin.ink,
              marginBottom: 6,
            }}
          >
            Add to your calendar
          </Text>
          <Text
            style={{
              fontFamily: 'Lato_400Regular',
              fontSize: 15,
              lineHeight: 22,
              color: skin.inkBody,
              marginBottom: 20,
            }}
          >
            {event.title}
          </Text>

          {choices.map((choice: CalendarChoice, index: number) => (
            <Pressable
              key={choice.key}
              onPress={() => { choice.open(); onClose(); }}
              accessibilityRole="button"
              accessibilityLabel={choice.label}
              style={({ pressed }) => ({
                borderRadius: 999,
                paddingVertical: 13,
                paddingHorizontal: 18,
                alignItems: 'center',
                marginTop: index === 0 ? 0 : 10,
                // The first one is not "the right answer" — it is just first.
                // Every option here is somebody's normal calendar.
                backgroundColor: index === 0 ? skin.gold : 'transparent',
                borderWidth: index === 0 ? 0 : 1,
                borderColor: skin.border,
                opacity: pressed ? 0.86 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: 'Lato_700Bold',
                  fontSize: 15,
                  color: index === 0 ? '#fffdf5' : skin.ink,
                }}
              >
                {choice.label}
              </Text>
              {choice.note ? (
                <Text
                  style={{
                    fontFamily: 'Lato_400Regular',
                    fontSize: 12.5,
                    marginTop: 2,
                    color: index === 0 ? 'rgba(255,253,245,0.85)' : skin.inkBody,
                  }}
                >
                  {choice.note}
                </Text>
              ) : null}
            </Pressable>
          ))}

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={({ pressed }) => ({
              borderRadius: 999,
              paddingVertical: 12,
              alignItems: 'center',
              marginTop: 14,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: skin.inkBody }}>
              Never mind
            </Text>
          </Pressable>
        </View>
      </ModalBackdrop>
    </Modal>
  );
}

/**
 * The state half, so a screen adds two lines rather than four.
 *
 * `const cal = useAddToCalendar()` — then `cal.open(event)` on the button and
 * `{cal.dialog}` anywhere in the tree.
 */
export function useAddToCalendar() {
  const [event, setEvent] = useState<Event | null>(null);
  const open = useCallback((next: Event) => setEvent(next), []);
  const close = useCallback(() => setEvent(null), []);
  return {
    open,
    dialog: <AddToCalendarDialog event={event} onClose={close} />,
  };
}
