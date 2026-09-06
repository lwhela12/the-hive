import { useCallback } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import {
  AWARDS, DRINK_DEFAULTS, FOOD_DEFAULTS, GARMENTS, GUEST_NOTES, HEADS, MIN_DEFAULTS,
  OG_MEMBERS, VENUE_NOTES, bandPrice, mockupUrl, money, spec, verdict,
  type AwardKind, type Colour, type Garment, type Guests, type Route, type Seal,
  type SizeBand, type SpendState, type Venue,
} from '../../lib/spendDecision';

/**
 * Where the honey goes — one slide the room decides on.
 *
 * Nat drives it and the numbers move on every seat (migration 237). OG casts
 * this to the frame TV, so the top line is the size it is on purpose: the
 * answer has to be readable from the far end of the dining table.
 */
export type SpendDecisionProps = {
  state: SpendState;
  onChange: (next: SpendState) => void;
  /** The deck's own scale helper, so this slide sizes like every other one. */
  sz: (tv: number, small: number) => number;
  gold: string;
  goldDeep: string;
  goldSoft: string;
  charcoal: string;
  muted: string;
  card: string;
};

export function SpendDecision({
  state, onChange, sz, gold, goldDeep, goldSoft, charcoal, muted, card,
}: SpendDecisionProps) {
  const v = verdict(state);
  const g = spec(state.garment);
  const set = useCallback(
    (patch: Partial<SpendState>) => onChange({ ...state, ...patch }),
    [state, onChange],
  );

  const Chip = ({
    label, sub, active, onPress, dim,
  }: { label: string; sub?: string; active: boolean; onPress: () => void; dim?: boolean }) => (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: sz(20, 12),
        paddingVertical: sz(11, 7),
        borderRadius: sz(12, 9),
        borderWidth: 1.5,
        borderColor: active ? gold : goldSoft,
        backgroundColor: active ? gold : card,
        opacity: dim ? 0.45 : 1,
        alignItems: 'center',
        minWidth: sz(112, 74),
      }}
    >
      <Text
        style={{
          fontFamily: 'Lato_700Bold',
          fontSize: sz(19, 12),
          color: active ? '#fffdf5' : charcoal,
        }}
      >
        {label}
      </Text>
      {sub ? (
        <Text
          style={{
            fontFamily: 'Lato_400Regular',
            fontSize: sz(15, 10),
            marginTop: 2,
            color: active ? '#fffdf5' : muted,
          }}
        >
          {sub}
        </Text>
      ) : null}
    </Pressable>
  );

  const Row = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={{ gap: sz(9, 6) }}>
      <Text
        style={{
          fontFamily: 'Lato_700Bold', fontSize: sz(15, 10), letterSpacing: 2,
          textTransform: 'uppercase', color: goldDeep,
        }}
      >
        {title}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sz(9, 6) }}>{children}</View>
    </View>
  );

  const Stepper = ({
    label, value, onStep, step = 5, prefix = '$',
  }: { label: string; value: number; onStep: (d: number) => void; step?: number; prefix?: string }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: sz(12, 8) }}>
      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(19, 12), color: charcoal, flex: 1 }}>
        {label}
      </Text>
      <Pressable
        onPress={() => onStep(-step)}
        hitSlop={8}
        style={{
          width: sz(38, 28), height: sz(38, 28), borderRadius: 999,
          borderWidth: 1.5, borderColor: goldSoft, backgroundColor: card,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(22, 15), color: goldDeep }}>–</Text>
      </Pressable>
      <Text
        style={{
          fontFamily: 'LibreBaskerville_700Bold', fontSize: sz(24, 16), color: charcoal,
          minWidth: sz(74, 50), textAlign: 'center',
        }}
      >
        {prefix}{value}
      </Text>
      <Pressable
        onPress={() => onStep(step)}
        hitSlop={8}
        style={{
          width: sz(38, 28), height: sz(38, 28), borderRadius: 999,
          borderWidth: 1.5, borderColor: goldSoft, backgroundColor: card,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(22, 15), color: goldDeep }}>+</Text>
      </Pressable>
    </View>
  );

  const short = v.left < 0;

  return (
    <View style={{ flex: 1 }}>
      {/* The answer, big enough to read from the other end of the table. */}
      <View
        style={{
          backgroundColor: charcoal,
          borderRadius: sz(18, 13),
          paddingHorizontal: sz(30, 18),
          paddingVertical: sz(16, 11),
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: sz(16, 10),
          marginBottom: sz(16, 10),
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: 'Lato_700Bold', fontSize: sz(15, 10), letterSpacing: 2,
              textTransform: 'uppercase', color: '#dec181',
            }}
          >
            {short ? 'Short by' : 'Left in the pot'}
          </Text>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(17, 11), color: '#d9d4c4', marginTop: 3 }}>
            Hoodies {money(v.hoodies.total)} · Ball {money(v.ball.total)} · pot {money(v.pot)}
          </Text>
        </View>
        <Text
          style={{
            fontFamily: 'LibreBaskerville_700Bold',
            fontSize: sz(58, 32),
            color: short ? '#e0a48c' : '#dec181',
          }}
        >
          {money(Math.abs(v.left))}
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: sz(50, 34), gap: sz(20, 13) }}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- the hoodie ---- */}
        <View style={{ flexDirection: 'row', gap: sz(20, 12), alignItems: 'flex-start' }}>
          <Image
            source={{ uri: mockupUrl(state) }}
            style={{
              width: sz(200, 118), height: sz(200, 118), borderRadius: sz(14, 10),
              backgroundColor: card, borderWidth: 1, borderColor: goldSoft,
            }}
            contentFit="contain"
            transition={160}
          />
          <View style={{ flex: 1, gap: sz(14, 9) }}>
            <Row title="Which garment">
              {GARMENTS.map((x) => (
                <Chip
                  key={x.id}
                  label={x.name}
                  sub={`$${bandPrice(x, state.size).toFixed(2)}`}
                  active={x.id === state.garment}
                  onPress={() => set({ garment: x.id as Garment })}
                />
              ))}
            </Row>
            <Row title="Colour">
              {(['black', 'cream', 'white'] as Colour[]).map((c) => (
                <Chip
                  key={c}
                  label={c[0].toUpperCase() + c.slice(1)}
                  sub={g.colours.includes(c) ? undefined : 'not made'}
                  dim={!g.colours.includes(c)}
                  active={c === state.colour}
                  onPress={() => set({ colour: c })}
                />
              ))}
            </Row>
            <Row title="Seal">
              {([['og', 'OG HIVE'], ['hive', 'HIVE'], ['bee', 'Just the bee'], ['wide', 'HIVE-wide']] as [Seal, string][]).map(
                ([id, label]) => (
                  <Chip key={id} label={label} active={id === state.seal} onPress={() => set({ seal: id })} />
                ),
              )}
            </Row>
            <Row title="How we order">
              <Chip
                label="One big box" sub="1 review"
                active={state.route === 'bulk'} onPress={() => set({ route: 'bulk' as Route })}
              />
              <Chip
                label="Ten Etsy orders" sub={`${state.hoodieN} reviews`}
                active={state.route === 'cost'} onPress={() => set({ route: 'cost' as Route })}
              />
              {(['S–XL', '2XL', '3XL'] as SizeBand[])
                .filter((b) => g.sizes[b] !== undefined)
                .map((b) => (
                  <Chip key={b} label={b} active={b === state.size} onPress={() => set({ size: b })} />
                ))}
            </Row>
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(17, 11), lineHeight: sz(25, 16), color: muted }}>
              {g.code} — {g.note}
            </Text>
          </View>
        </View>

        {/* ---- the ball ---- */}
        <View style={{ gap: sz(14, 9) }}>
          <Row title="Who's coming">
            {(Object.keys(HEADS) as Guests[]).map((k) => (
              <Chip
                key={k}
                label={{ og: 'Just OG', all: 'All the HIVEs', plus: '+ partners', hope: '+ hopefuls' }[k]}
                sub={`${HEADS[k]} people`}
                active={k === state.guests}
                onPress={() => set({ guests: k })}
              />
            ))}
          </Row>
          <Row title="Where we do it">
            {([['room', 'A back room'], ['catered', 'House, trays'], ['house', 'House, we cook']] as [Venue, string][]).map(
              ([id, label]) => (
                <Chip
                  key={id}
                  label={label}
                  active={id === state.venue}
                  onPress={() =>
                    set({
                      venue: id,
                      food: FOOD_DEFAULTS[id],
                      drinks: DRINK_DEFAULTS[id],
                      minspend: MIN_DEFAULTS[id],
                    })
                  }
                />
              ),
            )}
          </Row>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(17, 11), lineHeight: sz(25, 16), color: muted }}>
            {VENUE_NOTES[state.venue]} {GUEST_NOTES[state.guests]}
          </Text>

          <View style={{ gap: sz(10, 7) }}>
            <Stepper label="Food, per person" value={state.food} onStep={(d) => set({ food: Math.max(0, state.food + d) })} />
            <Stepper label="Drinks, per person" value={state.drinks} onStep={(d) => set({ drinks: Math.max(0, state.drinks + d) })} />
            {state.venue === 'room' ? (
              <Stepper
                label="Their minimum" value={state.minspend} step={50}
                onStep={(d) => set({ minspend: Math.max(0, state.minspend + d) })}
              />
            ) : null}
            <Stepper label="Champagne, per person" value={state.fizz} step={2} onStep={(d) => set({ fizz: Math.max(0, state.fizz + d) })} />
            <Stepper label="Decor and sparkle" value={state.decor} step={25} onStep={(d) => set({ decor: Math.max(0, state.decor + d) })} />
          </View>

          <Row title="The awards">
            {AWARDS.map((a) => (
              <Chip
                key={a.id}
                label={a.name}
                sub={`$${a.price.toFixed(2)} each`}
                active={a.id === state.award}
                onPress={() => set({ award: a.id as AwardKind })}
              />
            ))}
          </Row>
          <Stepper
            label="How many awards" value={state.awardN} step={1} prefix=""
            onStep={(d) => set({ awardN: Math.max(0, Math.min(32, state.awardN + d)) })}
          />
        </View>

        {/* ---- the sums, spelled out ---- */}
        <View
          style={{
            backgroundColor: card, borderWidth: 1, borderColor: goldSoft,
            borderRadius: sz(16, 12), paddingHorizontal: sz(22, 14), paddingVertical: sz(6, 4),
          }}
        >
          {[
            { label: 'The pot in January', amount: v.pot },
            { label: 'Hoodies', amount: -v.hoodies.total },
            { label: 'The Ball', amount: -v.ball.total },
          ].map((line) => (
            <View
              key={line.label}
              style={{
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
                paddingVertical: sz(11, 7), borderBottomWidth: 1, borderBottomColor: goldSoft,
              }}
            >
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(20, 13), color: muted }}>{line.label}</Text>
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: sz(22, 15), color: charcoal }}>
                {money(line.amount)}
              </Text>
            </View>
          ))}
          <View
            style={{
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
              paddingVertical: sz(13, 9),
            }}
          >
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(21, 14), color: charcoal }}>
              {short ? 'Short by' : 'Left over'}
            </Text>
            <Text
              style={{
                fontFamily: 'LibreBaskerville_700Bold', fontSize: sz(28, 19),
                color: short ? '#b3452e' : goldDeep,
              }}
            >
              {money(Math.abs(v.left))}
            </Text>
          </View>
          <Text
            style={{
              fontFamily: 'Lato_400Regular', fontSize: sz(17, 11), color: muted,
              paddingBottom: sz(12, 8),
            }}
          >
            {short
              ? `$${v.perHead.toFixed(2)} each to close it, split ${OG_MEMBERS} ways. Or the garage sale goes in the pot, or we do it at someone's house.`
              : `$${v.perHead.toFixed(2)} each back, or it stays in the pot to start 2027 with.`}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
