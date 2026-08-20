import { ScrollView, Text, View } from 'react-native';
import { usePageSkin } from '../../lib/pageSkin';
import { hiveAccent } from '../../lib/hiveBrand';
import type { Community } from '../../types';

/**
 * What a HIVE without a Honey Pot sees.
 *
 * Tech and Production were both being shown OG's Honey Pot screen: a £0
 * balance, an empty ledger, and a quarterly dues line for dues nobody had
 * agreed to. A fund that looks abandoned is worse than no fund — it reads as
 * something the HIVE is failing at rather than something it hasn't chosen.
 *
 * Nat, 2026-08-03: say it isn't set up, say what it could be FOR in this
 * particular HIVE, and say what it would take. The ideas are per-HIVE because
 * "a shared pot of money" means nothing until you can picture what it buys —
 * "a domain and a paid tier for something we build" lands where "community
 * fund" does not.
 */

type IdeaSet = { lead: string; ideas: string[] };

/**
 * Keyed by slug, not by name: names are editable in Admin, slugs are not. OG's
 * slug is literally 'default' (migration 118), which is why it looks odd here.
 */
const IDEAS_BY_SLUG: Record<string, IdeaSet> = {
  tech: {
    lead: 'In a HIVE built around what people make, it usually goes toward the boring things that block the interesting ones.',
    ideas: [
      'A domain, a paid tier, or the hosting bill for something the HIVE builds together',
      'One shared subscription nobody wants to buy alone',
      'Covering a member’s ticket to a conference or a course, on the understanding they bring it back to the group',
      'Seed money for whoever’s idea the HIVE decides to get behind this quarter',
    ],
  },
  show: {
    // Production TALKED about it and said not at this time (the room,
    // 2026-08-18; Nat: "pause, don't delete"). Saying the decision out loud is
    // what keeps this page from reading like something the HIVE forgot.
    lead: 'Production talked it over at the first meeting and said: not at this time. The section stays right here for whenever that changes — and when it does, it tends to go toward reach.',
    ideas: [
      'Marketing a show — posters, a boosted post, a photographer for the night',
      'Props, costumes or a rehearsal space nobody wants to fund on their own',
      'Submission fees for a festival, split so one person isn’t carrying it',
      'Feeding everybody on a build day, which is not a small thing',
    ],
  },
};

const GENERIC: IdeaSet = {
  lead: 'It goes toward whatever this HIVE decides is worth doing together rather than alone.',
  ideas: [
    'Something the whole HIVE uses that nobody wants to buy by themselves',
    'Backing one member’s project for a stretch',
    'The costs around a HIVE Help — materials, a donation, petrol',
    'Feeding everyone when you actually get in a room together',
  ],
};

export function HoneyPotNotSetUp({ community }: { community: Community | null }) {
  const skin = usePageSkin();
  const accent = hiveAccent(community);
  const hiveName = community?.name ?? 'This HIVE';
  const set = (community?.slug && IDEAS_BY_SLUG[community.slug]) || GENERIC;

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 20,
        paddingBottom: 60,
        maxWidth: 720,
        width: '100%',
        alignSelf: 'center',
      }}
    >
      <View
        style={{
          backgroundColor: skin.card,
          borderColor: skin.border,
          borderWidth: 1,
          borderRadius: 18,
          padding: 22,
        }}
      >
        <Text style={{ fontSize: 40, marginBottom: 10 }}>🍯</Text>

        <Text
          style={{
            fontFamily: 'LibreBaskerville_700Bold',
            fontSize: 21,
            lineHeight: 30,
            color: skin.ink,
          }}
        >
          {hiveName} doesn’t have a Honey Pot yet
        </Text>

        <Text
          style={{
            fontFamily: 'Lato_400Regular',
            fontSize: 15,
            lineHeight: 23,
            color: skin.inkBody,
            marginTop: 12,
          }}
        >
          A Honey Pot is one shared pot of money the HIVE puts in and spends on itself. {set.lead}
        </Text>

        <Text
          style={{
            fontFamily: 'Lato_700Bold',
            fontSize: 12.5,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: skin.inkSoft,
            marginTop: 22,
            marginBottom: 10,
          }}
        >
          What it could pay for here
        </Text>

        {set.ideas.map((idea) => (
          <View key={idea} style={{ flexDirection: 'row', gap: 10, marginBottom: 9 }}>
            <Text style={{ color: accent, fontSize: 15, lineHeight: 23 }}>▪</Text>
            <Text
              style={{
                flex: 1,
                fontFamily: 'Lato_400Regular',
                fontSize: 15,
                lineHeight: 23,
                color: skin.inkBody,
              }}
            >
              {idea}
            </Text>
          </View>
        ))}
      </View>

      <View
        style={{
          backgroundColor: skin.card,
          borderColor: skin.border,
          borderWidth: 1,
          borderRadius: 18,
          padding: 22,
          marginTop: 16,
        }}
      >
        <Text
          style={{
            fontFamily: 'LibreBaskerville_700Bold',
            fontSize: 17,
            lineHeight: 26,
            color: skin.ink,
            marginBottom: 12,
          }}
        >
          How it works, if you want one
        </Text>

        {[
          {
            title: 'The HIVE elects a treasurer first',
            body: 'Nothing opens until somebody has agreed to hold it. That is the whole first step.',
          },
          {
            title: 'Only the treasurer moves money',
            body: 'One person takes money in and pays money out. Not the admin, not whoever asks — the treasurer.',
          },
          {
            title: 'Everybody can see everything',
            body: 'Every amount in and out is written down on this page, with who recorded it and when. It is not the treasurer’s private book; it is the HIVE’s, and anyone can check it any time.',
          },
        ].map((step, index) => (
          <View key={step.title} style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: accent,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 2,
              }}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#fffdf5' }}>
                {index + 1}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: skin.ink }}>
                {step.title}
              </Text>
              <Text
                style={{
                  fontFamily: 'Lato_400Regular',
                  fontSize: 14.5,
                  lineHeight: 22,
                  color: skin.inkBody,
                  marginTop: 3,
                }}
              >
                {step.body}
              </Text>
            </View>
          </View>
        ))}

        <Text
          style={{
            fontFamily: 'Lato_400Regular',
            fontSize: 15,
            lineHeight: 23,
            color: skin.inkBody,
            marginTop: 6,
            paddingTop: 16,
            borderTopWidth: 1,
            borderTopColor: skin.border,
          }}
        >
          Interested? Say so to your HIVE’s admin and they can start the conversation.
        </Text>
      </View>
    </ScrollView>
  );
}
