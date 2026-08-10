-- Deepen the existing Production HIVE venue thread with confirmed details
-- from official venue/facility pages researched on 2026-08-09. Keep one
-- evolving thread rather than creating a second venue dump.

update public.board_posts bp
set content = $post$**Hermes research seed — these are conversation paths, not recommendations yet. Checked August 9, 2026; prices, eligibility, and availability can change.**

## A practical Vegas ladder

### 1. Small pilot

- **[Vegas Theatre Company](https://www.theatre.vegas/theatre-rentals)** — Arts District, **60–95 seats** depending on configuration. Its official page lists a **starting rate of $1,000 for a four-hour block**, with technician/designer extra. The inquiry form explicitly accepts “unknown” answers.
  - **Smallest next move:** prepare a 100-word description, run time, estimated attendance, one target date + backup, basic tech, and any video link; price one pilot block.
  - **Still ask:** rehearsal/load-in, all required labor, insurance, box office/fees/data, merch, bar terms, and cancellation.

- **[CSN BackStage Theatre](https://www.csn.edu/student-life/discover-csn/performing-arts-center)** — North Las Vegas Campus, **100 seats**, flat-floor stage with flexible seating. CSN’s official pathway asks outside groups to contact the PAC manager with company information, performance type, and requested dates.
  - **Smallest next move:** draft a three-line inquiry with show type and three possible dates; ask whether a first-time for-profit producer qualifies and request the all-in labor/rehearsal/ticketing terms.

- **[The Space](https://thespacelv.com/rent/)** — near the Strip; official rental page describes **3,000 square feet** for concerts, theatrical performances, comedy, burlesque, live podcasts, and productions. A current seated capacity was not published on the page reviewed.
  - **Smallest next move:** request its current capacity chart/floor plan and an itemized one-night estimate for 80, 150, and 250 guests.

- **[Notoriety Live](https://www.notorietylive.com/event-space/)** — Neonopolis downtown; official event path lists the Renkus Heinz Theater, Robin Leach Lounge, and Chandelier Room, but the reviewed page did not publish current capacities.
  - **Smallest next move:** request the room-by-room capacity/rate sheet and ask which room accepts an independently produced public-ticketed pilot.

### 2. Proven step-up

- **[Las Vegas–Clark County Library District rental facilities](https://thelibrarydistrict.org/rental-facilities/)** — several performing-arts-center paths. [Summerlin Library](https://thelibrarydistrict.org/locations/sm/) officially lists a **284-seat theater**. District rental information reviewed listed a **$40/hour PAC base plus technician and security fees**; confirm current all-in pricing and public-ticketed-show rules directly.
  - **Smallest next move:** compare one realistic Friday/Saturday with the true technician, security, rehearsal, ticketing, insurance, and concessions cost.

- **[Charleston Heights Arts Center](https://www.lasvegasnevada.gov/Residents/Parks-Facilities/Charleston-Heights-Arts-Center)** — Jeanne Roberts Theatre, **365 seats**. The city page says rental requests should be submitted at least six weeks ahead and availability is limited.
  - **Smallest next move:** check commercial-producer eligibility, then request the rate/technical/ticketing packet before assembling an application.

- **[CSN Nicholas J. Horn Theatre](https://www.csn.edu/student-life/discover-csn/performing-arts-center)** — **524-seat** proscenium room with rigging, technical services, dressing rooms, and free parking.
  - **Smallest next move:** ask CSN for a side-by-side quote using the same show assumptions: 100-seat BackStage versus 524-seat Horn.

- **[UNLV Performing Arts Center](https://www.unlv.edu/pac/rent)** — Judy Bayley Theatre **550 seats**; Artemus W. Ham Concert Hall **1,832 seats**.
  - **Smallest next move:** begin with Judy Bayley and request a rough all-in one-performance + one-rehearsal estimate, including required labor, ticketing, insurance, and deposits.

### 3. Casino/showroom conversation — later

- **[South Point](https://southpointmeetings.com/)** — official resort material describes a **400-seat showroom**, while the published commercial route is group/meeting sales. Straight outside rental is not confirmed.
- **[The Orleans](https://orleans.boydgaming.com/groups-and-weddings)** — published sales/catering pathway and large event-complex capacity; outside public-ticketed showroom access is not confirmed.
- **[Westgate](https://lasvegasmeetings.westgateresorts.com/)** — group-sales pathway advertises theater options but the reviewed page did not publish room-by-room theater capacities or outside-show deal terms.

**Gating question for all three:** Do you accept an independently produced public-ticketed show, and is the deal a rental, guarantee, revenue share, co-presentation, or something else?

Approach this tier after there is a tight show brief, pilot video, technical rider, audience/ticket evidence, budget, marketing plan, and a clear financial ask.

## Ask every venue the same things

Capacity/configurations • available dates • rental vs split/guarantee • included equipment/crew • labor minimums/overtime • insurance • ticketing/fees/buyer data • load-in/rehearsal • accessibility • merch • food/alcohol • cancellation • who handles permits and Nevada Live Entertainment Tax.

**Recommended sequence:** VTC or CSN BackStage → The Space or Notoriety → a 284–550-seat proof point → casino conversation only after the show has evidence.$post$
from public.board_categories bc
join public.communities c on c.id = bc.community_id
where bp.category_id = bc.id
  and c.slug = 'show'
  and bc.name = 'Venues & Cities'
  and bp.title = 'Vegas venue paths — first pass'
  and bp.archived_at is null;
