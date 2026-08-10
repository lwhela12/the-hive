-- End-of-night closeout for Nat's 2026-08-09 Production HIVE brainstorm.
-- Add only the three reusable supports that reduce future cognitive load.

-- 1. One place to separate ideas from decisions.
insert into public.board_posts (community_id, category_id, author_id, title, content)
select c.id, bc.id, p.id,
  'Assumptions + decisions shelf',
  $post$**Hermes research seed — this keeps exciting ideas from quietly becoming commitments.**

### Assumption

Copy into a reply:

- **We currently believe:**
- **Cheapest honest way to test it:**
- **What signal would support or challenge it:**
- **Result:**

### Decision

Copy into a reply:

- **We decided:**
- **Why:**
- **What would change our mind:**
- **Date:**

A dream, venue, collaborator, price, format, or city stays an **assumption** until it is deliberately decided. “Later” is also a valid decision.$post$
from public.communities c
join public.board_categories bc on bc.community_id=c.id and bc.name='Production General Discussion'
cross join lateral (select id from public.profiles where email='natwalstead@gmail.com' limit 1) p
where c.slug='show'
  and not exists (select 1 from public.board_posts x where x.category_id=bc.id and x.title='Assumptions + decisions shelf');

-- 2. A reusable inquiry, without contacting anyone.
insert into public.board_posts (community_id, category_id, author_id, title, content)
select c.id, bc.id, p.id,
  'Reusable venue inquiry — draft only',
  $post$**Hermes research seed — nobody has been contacted. Replace the brackets only when the show is clearer.**

**Subject:** Independent live-show pilot inquiry — [date window] / approximately [audience size]

Hello [venue/team],

We’re developing **[working title]**, a [plain-language show type] created by/with Charlee. We’re exploring a small, public ticketed pilot in Las Vegas and would love to understand whether [room/venue] could fit.

Our current working shape:

- Show length: [minutes]
- Estimated audience: [range]
- Preferred date window: [dates]
- Cast/crew: [rough count]
- Basic technical needs: [sound / lighting / projection / other]
- Still unknown: [honest unknowns]

Could you share the room’s current capacity/configurations, available dates, and an **all-in estimate** including required labor, equipment, rehearsal/load-in, security/front of house, cleaning, ticketing/fees, and any mandatory insurance or deposits?

We’d also appreciate clarity on public-ticketed-show eligibility, cancellation terms, accessibility, merchandise/food/alcohol rules, buyer-data access, and who handles permits and Nevada Live Entertainment Tax.

Thank you,
[Name + contact]

**Attach later, only if useful:** one-page brief • short proof video • simple technical sketch.$post$
from public.communities c
join public.board_categories bc on bc.community_id=c.id and bc.name='Venues & Cities'
cross join lateral (select id from public.profiles where email='natwalstead@gmail.com' limit 1) p
where c.slug='show'
  and not exists (select 1 from public.board_posts x where x.category_id=bc.id and x.title='Reusable venue inquiry — draft only');

-- 3. Tiny calculator, no separate spreadsheet yet.
insert into public.board_posts (community_id, category_id, author_id, title, content)
select c.id, bc.id, p.id,
  'Five-input pilot calculator',
  $post$**Hermes research seed — use real quotes when they exist; this is for seeing the shape, not proving a business case.**

Reply with five numbers:

1. **Usable capacity:**
2. **Expected sell-through:**
3. **Average paid ticket:**
4. **Fixed costs:** venue + labor + creative/performer + rehearsal + equipment + marketing + rights/insurance/permits + contingency
5. **Variable cost per paid guest:** absorbed fees/tax/per-head costs

Then calculate:

- `Expected paid attendance = capacity × sell-through`
- `Gross tickets = expected paid attendance × average paid ticket`
- `Ticket contribution = gross tickets − (paid attendance × variable cost)`
- `Pilot result = ticket contribution + sponsor/guarantee/other support − fixed costs`
- `Break-even paid tickets = fixed costs ÷ (average paid ticket − variable cost)`

Run **soft / believable / strong** versions. If break-even exceeds usable capacity, that is useful—not failure. It means reduce fixed cost, improve net ticket contribution, add support, add a performance only if demand supports it, or reshape the pilot.

**Decision to capture:** maximum acceptable pilot loss and the point where the plan becomes “reshape or pause.”$post$
from public.communities c
join public.board_categories bc on bc.community_id=c.id and bc.name='The Numbers'
cross join lateral (select id from public.profiles where email='natwalstead@gmail.com' limit 1) p
where c.slug='show'
  and not exists (select 1 from public.board_posts x where x.category_id=bc.id and x.title='Five-input pilot calculator');
