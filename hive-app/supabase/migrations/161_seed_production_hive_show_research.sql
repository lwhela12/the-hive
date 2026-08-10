-- Nat explicitly reopened the Production HIVE research lane on 2026-08-09.
-- The boards already exist and are intentionally specific; this seeds a small,
-- useful starting shelf inside each one instead of creating more rooms. Every
-- insert is idempotent by community + board + title. Nat is the only current
-- Production HIVE member, so the copy names this as a Hermes research seed
-- rather than pretending the byline means Nat personally wrote it.

-- 1. Start here
insert into public.board_posts (
  community_id, category_id, author_id, title, content, is_pinned
)
select c.id, bc.id, p.id,
  'Start here: four questions before the research gets big',
  $post$**Hermes research seed for Nat + Charlee — a starting room, not a finished plan.**

Before researching everything, answer only these four:

1. **What is the one-sentence promise?** “People come to this show because…”
2. **Who is the first audience?** Locals, tourists, a specific fandom/community, families, adults-only, convention visitors, or something else?
3. **What is the smallest real version?** A one-night showcase, a short pilot run, a residency, or a permanent venue?
4. **Is Vegas the requirement or the first experiment?** Vegas first; every city still allowed.

A sane order is: **shape the show → test it in an existing room → learn what sells → then decide whether a residency, investor, or building makes sense.**

Reply here with scraps, voice-note thoughts, contradictions, or “I don’t know yet.” Those are research directions, not wrong answers.$post$,
  true
from public.communities c
join public.board_categories bc on bc.community_id = c.id and bc.name = 'Production General Discussion'
cross join lateral (
  select id from public.profiles where email = 'natwalstead@gmail.com' limit 1
) p
where c.slug = 'show'
  and not exists (
    select 1 from public.board_posts x
    where x.category_id = bc.id
      and x.title = 'Start here: four questions before the research gets big'
  );

-- 2. Pitch
insert into public.board_posts (community_id, category_id, author_id, title, content)
select c.id, bc.id, p.id,
  'A one-page case before a giant deck',
  $post$**Research seed — build the case in one page first.**

The first version only needs:

- **The show:** one sentence + format/run time.
- **The audience:** who buys first and why now.
- **The proof:** past work, audience, collaborators, test footage, or a pilot result.
- **Why this city/room:** Vegas can be the first answer without becoming the only answer.
- **The ask:** venue conversation, co-producer, investor, sponsor, or pilot budget — not all five at once.
- **The engine:** seats × average paid ticket × realistic sell-through × shows.
- **The risks:** rights, venue cost, technical load, ticket demand, and the team still missing.
- **The next proof point:** the cheapest honest test that makes the case stronger.

Useful first decision: **Are we pitching a show that needs a room, or a building that needs a show?** Those are related, but they are not the same investment.$post$
from public.communities c
join public.board_categories bc on bc.community_id = c.id and bc.name = 'The Pitch'
cross join lateral (
  select id from public.profiles where email = 'natwalstead@gmail.com' limit 1
) p
where c.slug = 'show'
  and not exists (
    select 1 from public.board_posts x where x.category_id = bc.id and x.title = 'A one-page case before a giant deck'
  );

-- 3. Venue paths
insert into public.board_posts (community_id, category_id, author_id, title, content)
select c.id, bc.id, p.id,
  'Vegas venue paths — first pass',
  $post$**Research seed — these are conversation paths, not recommendations yet. Checked August 9, 2026; prices and availability can change.**

### Best first-pilot lead

- **[Vegas Theatre Company](https://www.theatre.vegas/theatre-rentals)** — Arts District; its official rental page lists **60–95 seats depending on configuration** and a **starting rate of $1,000 for a four-hour block**, with technician/designer extra. It has an inquiry form and explicitly allows “unknown” answers. This is the clearest low-friction first call.

### Other existing-room paths to compare

- **[The Space](https://thespacelv.com/rent/)** — dedicated rent-the-space path, stage/event setting, direct contact route.
- **[Notoriety Live](https://www.notorietylive.com/event-space/)** — multiple rooms downtown and an event inquiry asking type, date/time, and guest count.
- **[Las Vegas–Clark County Library District rental facilities](https://thelibrarydistrict.org/rental-facilities/)** — community performing-arts and meeting-room pathway; compare each branch’s room, rules, and calendar.
- **[Charleston Heights Arts Center](https://www.lasvegasnevada.gov/Residents/Parks-Facilities/Charleston-Heights-Arts-Center)** — city arts venue pathway.
- **[UNLV Performing Arts Center](https://www.unlv.edu/pac/rent)** and **[CSN Performing Arts Center](https://www.csn.edu/student-life/discover-csn/performing-arts-center)** — institutional venue pathways with formal rental/booking conversations.
- **[South Point](https://southpointmeetings.com/)**, **[The Orleans](https://orleans.boydgaming.com/groups-and-weddings)**, and **[Westgate](https://lasvegasmeetings.westgateresorts.com/)** — larger hotel/casino group-sales paths. Treat these as later conversations until the show size and draw are clearer.

### Ask every venue the same things

Capacity/configurations • available dates • rental vs split/guarantee • included lighting/sound/crew • required labor • insurance • ticketing/fees/data • load-in/rehearsal time • merch • food/alcohol rules • accessibility • who handles permits and Nevada Live Entertainment Tax.

**Smallest next move:** prepare one reusable venue inquiry with show type, estimated run time, pilot audience size, preferred date window, basic tech, and what is still unknown.$post$
from public.communities c
join public.board_categories bc on bc.community_id = c.id and bc.name = 'Venues & Cities'
cross join lateral (
  select id from public.profiles where email = 'natwalstead@gmail.com' limit 1
) p
where c.slug = 'show'
  and not exists (
    select 1 from public.board_posts x where x.category_id = bc.id and x.title = 'Vegas venue paths — first pass'
  );

-- 4. Jurisdiction / permits
insert into public.board_posts (community_id, category_id, author_id, title, content)
select c.id, bc.id, p.id,
  'Vegas permits: the address decides the rules',
  $post$**Research seed — orientation only, not legal advice.**

“Las Vegas” can mean different jurisdictions. The exact venue address decides whether the City of Las Vegas, Clark County, another city, a gaming property, or several agencies are involved.

Before signing a room, ask the venue **in writing** which items it handles and which belong to the producer:

- Nevada state + local business licensing: [Nevada Secretary of State start-a-business](https://www.nvsos.gov/sos/businesses/start-a-business), [SilverFlume](https://www.nvsilverflume.gov/home), and [City of Las Vegas business licensing](https://www.lasvegasnevada.gov/Business/Business-License).
- Standalone/temporary/special-event approvals: [City of Las Vegas special events](https://www.lasvegasnevada.gov/Business/Permits-Licenses/Special-Event-Permits) or [Clark County special-event application process](https://www.clarkcountynv.gov/business/doing_business_with_clark_county/divisions/sports_and_special_events/application-process).
- Fire/life-safety and temporary structures: [City fire permits](https://www.lasvegasnevada.gov/Business/Permits-Licenses/Fire-Permits-Info), [Clark County Fire special events](https://www.clarkcountynv.gov/business/doing_business_with_clark_county/divisions/sports_and_special_events/clark-county-fire-department), and [temporary-event guidance](https://www.clarkcountynv.gov/business/doing_business_with_clark_county/divisions/temporary_events).
- Food service outside a venue’s existing operation: [Southern Nevada Health District special events](https://www.southernnevadahealthdistrict.org/permits-and-regulations/temporary-permits/special-events).
- Music/content permissions: start with the rights owner and the public-performance organizations that apply — [ASCAP](https://www.ascap.com/music-users) and [BMI](https://www.bmi.com/licensing).
- Accessible ticketing and guest experience: [ADA ticket-sales guidance](https://www.ada.gov/resources/ticket-sales) and the [Title III primer](https://www.ada.gov/resources/title-iii-primer).

**Fastest low-risk path:** pilot in an existing, properly operated performance venue and make “who handles what?” part of the contract. A parking-lot, pop-up, tent, alcohol, food vendor, temporary stage, pyro, or unusual rigging changes the research immediately.$post$
from public.communities c
join public.board_categories bc on bc.community_id = c.id and bc.name = 'Venues & Cities'
cross join lateral (
  select id from public.profiles where email = 'natwalstead@gmail.com' limit 1
) p
where c.slug = 'show'
  and not exists (
    select 1 from public.board_posts x where x.category_id = bc.id and x.title = 'Vegas permits: the address decides the rules'
  );

-- 5. Budget
insert into public.board_posts (community_id, category_id, author_id, title, content)
select c.id, bc.id, p.id,
  'Tiny first-pass budget + break-even math',
  $post$**Research seed — no fake precision yet. Start with categories and three scenarios.**

### One-time / development

Concept + script/choreo • rehearsals • music/content rights • creative fees • casting • set/props/costumes • photo/video/graphics • deposits • legal/accounting.

### Per-show / per-week

Venue • performers • stage manager + crew • lighting/sound/video • equipment • front of house/security • insurance/permits/taxes • ticketing/payment fees • marketing/press/comps • transport/storage • contingency.

### Revenue

Paid tickets • VIP/upsells • sponsorship • group sales • merch • venue/bar split if contractually allowed • later rentals/classes only if there is a dedicated room.

### The first useful math

`paid seats × average paid ticket = gross box office`

Then subtract **taxes + ticketing/payment fees + venue deal + per-show costs**. Do three versions:

- **Soft:** small audience / high costs
- **Base:** believable target
- **Strong:** not sold-out fantasy — an earned upside case

Questions that matter more than a giant spreadsheet: What cost repeats every show? What is truly fixed? What must sell before adding another performance? What can a pilot prove for under one full-scale-show budget?$post$
from public.communities c
join public.board_categories bc on bc.community_id = c.id and bc.name = 'The Numbers'
cross join lateral (
  select id from public.profiles where email = 'natwalstead@gmail.com' limit 1
) p
where c.slug = 'show'
  and not exists (
    select 1 from public.board_posts x where x.category_id = bc.id and x.title = 'Tiny first-pass budget + break-even math'
  );

-- 6. Nevada LET
insert into public.board_posts (community_id, category_id, author_id, title, content)
select c.id, bc.id, p.id,
  'Vegas flag: Live Entertainment Tax',
  $post$Nevada’s Department of Taxation says Live Entertainment Tax is handled by the Gaming Control Board for events inside licensed gaming establishments and by the Department of Taxation for other venues. Its current overview lists a **9% tax on the admission charge for a facility with minimum occupancy of 200**.

Official starting points:

- [Nevada Department of Taxation — Live Entertainment Tax](https://tax.nv.gov/tax-types/live-entertainment-tax/)
- [LET FAQs](https://tax.nv.gov/faqs/live-entertainment-tax-faqs/)
- [Nevada statute, NRS 368A](https://www.leg.state.nv.us/nrs/nrs-368a.html)

Do not just add 9% to every draft budget. Ask the exact venue and a Nevada tax professional:

- Is this event/room taxable?
- Is the stated capacity 200+?
- Who registers, collects, reports, and remits?
- Does the advertised ticket price include the tax?
- How do comps, bundles, service charges, or venue splits affect treatment?

This is a **contract + pricing question before tickets go on sale**, not cleanup after.$post$
from public.communities c
join public.board_categories bc on bc.community_id = c.id and bc.name = 'The Numbers'
cross join lateral (
  select id from public.profiles where email = 'natwalstead@gmail.com' limit 1
) p
where c.slug = 'show'
  and not exists (
    select 1 from public.board_posts x where x.category_id = bc.id and x.title = 'Vegas flag: Live Entertainment Tax'
  );

-- 7. Dark hours
insert into public.board_posts (community_id, category_id, author_id, title, content)
select c.id, bc.id, p.id,
  'If there is a building, what earns while the show is dark?',
  $post$**Research seed — only use this if the project becomes “operate a room,” not merely “produce a show.”**

Possible dark-hour uses:

- rehearsals and creator residencies
- classes, intensives, and youth programs
- photo/video/film shoots
- private events and corporate rentals
- readings, open mics, showcases, and workshops
- small touring rentals
- community programming or partner nights
- costume/prop/storage services only if operations support it

For each idea, ask:

1. Who pays?
2. What staffing, insurance, cleaning, security, alcohol/food, or permit burden comes with it?
3. Does it conflict with rehearsals, load-in, maintenance, or the actual show?
4. Is there proof of local demand — or are we asking the show to subsidize another untested business?

**Gate:** prove the show in rented rooms before treating a building as the solution. If a building later becomes the dream, this board becomes its separate operating model.$post$
from public.communities c
join public.board_categories bc on bc.community_id = c.id and bc.name = 'The Other 20 Hours'
cross join lateral (
  select id from public.profiles where email = 'natwalstead@gmail.com' limit 1
) p
where c.slug = 'show'
  and not exists (
    select 1 from public.board_posts x where x.category_id = bc.id and x.title = 'If there is a building, what earns while the show is dark?'
  );

-- 8. Creative brief
insert into public.board_posts (community_id, category_id, author_id, title, content)
select c.id, bc.id, p.id,
  'Creative brief: shape the show before venue calls',
  $post$**Research seed — a messy first answer is enough.**

- Working title / one-sentence promise
- Genre and emotional tone
- First audience + age/content boundary
- Target run time; intermission or no
- Cast size and act types
- Host/narrator/story spine
- Music: original, licensed, commissioned, or mixed
- Scenic footprint: tiny / touring / room-specific
- Lighting, sound, video, aerial, rigging, haze, flame, animals, water, or audience participation
- Costume/quick-change needs
- Rehearsal weeks + tech days
- Accessibility: seating, ticketing, sensory, captions/ASL, mobility, and guest communication
- Pilot version: what can be genuinely tested without pretending it is the final spectacle?
- Three non-negotiables / three things allowed to change

**Before using music, scripts, choreography, video, characters, or other protected material:** name who owns it, what permission is needed, territory/run length, recording/streaming rights, and who clears it. Public-performance licensing can be separate from permission to adapt, record, sync, or stream.$post$
from public.communities c
join public.board_categories bc on bc.community_id = c.id and bc.name = 'The Show Itself'
cross join lateral (
  select id from public.profiles where email = 'natwalstead@gmail.com' limit 1
) p
where c.slug = 'show'
  and not exists (
    select 1 from public.board_posts x where x.category_id = bc.id and x.title = 'Creative brief: shape the show before venue calls'
  );

-- 9. Team map
insert into public.board_posts (community_id, category_id, author_id, title, content)
select c.id, bc.id, p.id,
  'Minimum team map',
  $post$**Research seed — titles can overlap in a pilot; responsibilities cannot disappear.**

### Creative / producing

Lead producer • director/creative lead • writer/choreographer/music lead as the show requires • company/casting contact.

### Make it happen

Production/stage manager • venue/technical lead • lighting • sound/playback • wardrobe/props/scenic • qualified specialists for aerial/rigging/pyro/stunts or other higher-risk elements.

### Put people in seats

Ticketing/box office • front of house/accessibility • marketing/press/partnerships • photo/video/content approvals.

### Protect the people and the project

Written performer/crew deals • pay + schedule • credit • cancellation • conduct/safety • insurance/workers’ comp classification • rights to record/use likeness • music/content clearance • emergency chain of command.

If minors might perform, start with Nevada’s youth-employment rules and confirm the exact production requirements before casting: [NRS Chapter 609](https://www.leg.state.nv.us/nrs/nrs-609.html).

**Smallest next move:** one name beside each responsibility, even if the name is “unfilled.” That exposes the real hiring list without building a fantasy org chart.$post$
from public.communities c
join public.board_categories bc on bc.community_id = c.id and bc.name = 'Casting & Crew'
cross join lateral (
  select id from public.profiles where email = 'natwalstead@gmail.com' limit 1
) p
where c.slug = 'show'
  and not exists (
    select 1 from public.board_posts x where x.category_id = bc.id and x.title = 'Minimum team map'
  );

-- 10. Audience test
insert into public.board_posts (community_id, category_id, author_id, title, content)
select c.id, bc.id, p.id,
  'Filling the first room before scaling',
  $post$**Research seed — market a specific promise to a specific first audience.**

### Before tickets

- one sentence + one strong visual
- a real date/room/price range or a clearly labeled interest test
- a 30–90 second proof clip, rehearsal fragment, or creator introduction
- a tiny landing page/email list with source tracking
- 10–20 short audience conversations: what they think it is, whether they would go, with whom, and at what friction point they stop

### First channels to test

The creators’ existing audiences • local arts/community partners • hotel/concierge or visitor channels when the show is tourist-shaped • group sales • conventions/events with audience overlap • earned press • carefully limited comps • email/SMS from people who explicitly opted in.

### What to measure

Views do not equal seats. Track interest → email → checkout → paid ticket → attendance → referral/repeat intent. Keep average **paid** ticket and true acquisition cost separate from face value and free reach.

### Pilot learning loop

After every test: Who came? Why? Where did they hear? What almost stopped them? What would they tell a friend? What part do they remember tomorrow?

**Scale only after one audience/channel/offer combination behaves repeatably.**$post$
from public.communities c
join public.board_categories bc on bc.community_id = c.id and bc.name = 'Filling Seats'
cross join lateral (
  select id from public.profiles where email = 'natwalstead@gmail.com' limit 1
) p
where c.slug = 'show'
  and not exists (
    select 1 from public.board_posts x where x.category_id = bc.id and x.title = 'Filling the first room before scaling'
  );
