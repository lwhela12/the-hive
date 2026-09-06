/**
 * Where the honey goes — the hoodies-vs-Bumble-Bee-Ball sums.
 *
 * Every number here came out of somewhere real on 6 Sep 2026 and the comments
 * say where, because this slide gets shown to the room and somebody will ask.
 *
 * The same model runs at https://wherethehoneygoes.vercel.app — that page is
 * the long version people read afterwards; this is the version Nat drives at
 * the meeting. If one changes, change the other.
 */

export type Garment = 'crew' | 'pullover' | 'fullzip' | 'quarter' | 'premium';
export type Colour = 'black' | 'cream' | 'white';
export type Seal = 'og' | 'hive' | 'bee' | 'wide';
export type Route = 'bulk' | 'cost';
export type Guests = 'og' | 'all' | 'plus' | 'hope';
export type Venue = 'room' | 'catered' | 'house';
export type AwardKind = 'paper' | 'insert' | 'plaque' | 'trophy';
export type SizeBand = 'S–XL' | '2XL' | '3XL';

/** Read out of the HIVE app's own tables on 6 Sep 2026. */
export const POT_NOW = 750;
export const OG_MEMBERS = 10;
export const DUES_QUARTER = 25;
/** Quarters of 2026 dues still owed, counted only from when each member joined. */
export const BACKLOG_QUARTERS = 8;

/** Distinct people, deduped across every HIVE. 3 invites are still outstanding. */
export const HEADS: Record<Guests, number> = { og: 10, all: 16, plus: 32, hope: 19 };

/** Printify Choice, shipping to the US. Real, from our own account. */
export const SHIP_FIRST = 7.39;
export const SHIP_EACH = 2.09;
/** Etsy's published 2026 fees: 6.5% transaction + 3% processing + $0.25 + $0.20 listing. */
export const ETSY_RATE = 0.095;
export const ETSY_FLAT = 0.45;

export type GarmentSpec = {
  id: Garment;
  name: string;
  code: string;
  /** Real cost per size band, single print, from draft products in our account. */
  sizes: Partial<Record<SizeBand, number>>;
  /** The colours a supplier actually makes it in. */
  colours: Colour[];
  note: string;
};

export const GARMENTS: GarmentSpec[] = [
  {
    id: 'crew', name: 'Crewneck', code: 'Gildan 18000',
    sizes: { 'S–XL': 17.87, '2XL': 20.57, '3XL': 22.03 },
    colours: ['black', 'cream', 'white'],
    note: 'Cheapest of the five and the biggest uninterrupted print area.',
  },
  {
    id: 'pullover', name: 'Pullover hoodie', code: 'Gildan 18500',
    sizes: { 'S–XL': 21.58, '2XL': 23.77, '3XL': 25.09 },
    colours: ['black', 'cream', 'white'],
    note: 'The classic — what most people picture when we say hoodie.',
  },
  {
    id: 'fullzip', name: 'Full-zip hoodie', code: 'Gildan 18600',
    sizes: { 'S–XL': 28.63, '2XL': 31.27, '3XL': 32.73 },
    // No supplier anywhere makes this one in cream; white is as pale as it gets.
    colours: ['black', 'white'],
    note: 'A zip splits the front, so the seal goes on the back instead.',
  },
  {
    id: 'quarter', name: 'Quarter-zip', code: 'Gildan Softstyle Q-Zip',
    sizes: { 'S–XL': 31.05, '2XL': 36.33, '3XL': 41.64 },
    colours: ['black', 'cream', 'white'],
    note: 'The placket means a small left-chest crest, not a full seal.',
  },
  {
    id: 'premium', name: 'Premium pullover', code: 'Bella+Canvas 3719',
    sizes: { 'S–XL': 37.55, '2XL': 40.84 },
    colours: ['black', 'cream', 'white'],
    note: 'Softest and best drape. Also the dearest by a distance.',
  },
];

/** Crown Awards' published prices. Engraving is free; shipping is free over $110. */
export const AWARDS: { id: AwardKind; name: string; price: number; note: string }[] = [
  { id: 'paper',  name: 'Certificates',      price: 1.5,  note: 'Printed at home. Nobody keeps them.' },
  { id: 'insert', name: 'Insert plaques',    price: 7,    note: 'Walnut and an engraved plate. The cheapest thing that still feels like an award.' },
  { id: 'plaque', name: 'Classic plaques',   price: 20,   note: 'Properly weighty — ends up on a shelf.' },
  { id: 'trophy', name: 'Acrylic trophies',  price: 35,   note: 'This is the Dundie.' },
];

export const VENUE_NOTES: Record<Venue, string> = {
  room: "Brit brings her monitor, so we don't pay for theirs. Any back room will do — no rent, just a minimum spend.",
  catered: 'Restaurant trays, not event catering. Paymon’s and the like sell trays from around $100, and there is no minimum to clear.',
  house: 'No minimum, no gratuity, no service charge. Every spare dollar goes on the night.',
};

export const GUEST_NOTES: Record<Guests, string> = {
  og: 'Just us. Everyone there has paid into the pot.',
  all: "Everyone across the HIVEs. Six of them aren't in OG.",
  plus: 'Everyone brings someone. Roughly triple the room.',
  hope: "The HIVEs plus three people we've invited who haven't accepted yet.",
};

export type SpendState = {
  garment: Garment; colour: Colour; seal: Seal; size: SizeBand;
  route: Route; hoodieN: number;
  guests: Guests; venue: Venue;
  food: number; drinks: number; fizz: number;
  award: AwardKind; awardN: number; decor: number;
  minspend: number;
  back26: number; q127: number;
};

export const DEFAULT_SPEND: SpendState = {
  garment: 'crew', colour: 'cream', seal: 'og', size: 'S–XL',
  route: 'bulk', hoodieN: 10,
  guests: 'og', venue: 'room',
  food: 35, drinks: 10, fizz: 6,
  award: 'insert', awardN: 10, decor: 100,
  minspend: 500,
  back26: BACKLOG_QUARTERS, q127: OG_MEMBERS,
};

export const FOOD_DEFAULTS: Record<Venue, number> = { room: 35, catered: 22, house: 15 };
export const DRINK_DEFAULTS: Record<Venue, number> = { room: 10, catered: 6, house: 5 };
export const MIN_DEFAULTS: Record<Venue, number> = { room: 500, catered: 0, house: 0 };

export const spec = (id: Garment) => GARMENTS.find((g) => g.id === id) ?? GARMENTS[0];

/** The size band a garment is actually made in, falling back to its cheapest. */
export const bandPrice = (g: GarmentSpec, size: SizeBand) =>
  g.sizes[size] ?? g.sizes['S–XL'] ?? 0;

/** The mockup for a combination, falling back to black where a colour isn't made. */
export const mockupUrl = (state: SpendState) => {
  const g = spec(state.garment);
  const colour = g.colours.includes(state.colour) ? state.colour : 'black';
  return `https://wherethehoneygoes.vercel.app/mockups/${g.id}-${colour}-${state.seal}.jpg`;
};

export type Line = { label: string; amount: number };

export function potInJanuary(s: SpendState) {
  return POT_NOW + s.back26 * DUES_QUARTER + s.q127 * DUES_QUARTER;
}

export function hoodieCost(s: SpendState) {
  const g = spec(s.garment);
  const each = bandPrice(g, s.size);
  const n = s.hoodieN;
  if (n === 0) return { total: 0, reviews: 0, each: 0, lines: [] as Line[] };
  const noun = g.name.toLowerCase() + 's';

  if (s.route === 'bulk') {
    const ship = SHIP_FIRST + (n - 1) * SHIP_EACH;
    const total = n * each + ship;
    return {
      total, reviews: 1, each: total / n,
      lines: [
        { label: `${n} ${noun} at $${each.toFixed(2)}`, amount: n * each },
        { label: 'Shipping, one box', amount: ship },
      ],
    };
  }
  // Both Etsy routes cost the pot the same — the shop's margin cycles back —
  // so one branch covers them. The difference is only how the listing looks.
  const goods = each + SHIP_FIRST;
  const fee = goods * ETSY_RATE + ETSY_FLAT;
  const total = n * (goods + fee);
  return {
    total, reviews: n, each: total / n,
    lines: [
      { label: `${n} ${noun} at $${each.toFixed(2)}`, amount: n * each },
      { label: `Shipping, ${n} separate orders`, amount: n * SHIP_FIRST },
      { label: `Etsy's cut, ${n} orders`, amount: n * fee },
    ],
  };
}

export function ballCost(s: SpendState) {
  const heads = HEADS[s.guests];
  const food = heads * s.food;
  const drinks = heads * s.drinks;
  const fizz = heads * s.fizz;
  const aw = AWARDS.find((a) => a.id === s.award) ?? AWARDS[1];
  const awards = s.awardN * aw.price;

  const lines: Line[] = [{ label: `${heads} people, food at $${s.food.toFixed(2)}`, amount: food }];
  if (drinks > 0) lines.push({ label: `${heads} people, drinks at $${s.drinks.toFixed(2)}`, amount: drinks });

  // A back room is not rented — it is held against a minimum spend, so it only
  // costs us the gap between what we would have spent anyway and their number.
  let top = 0;
  if (s.venue === 'room') {
    top = Math.max(s.minspend - food - drinks, 0);
    lines.push({
      label: top > 0 ? `Topping up to their $${s.minspend} minimum` : 'Their minimum, already cleared',
      amount: top,
    });
  }
  lines.push({ label: 'Champagne', amount: fizz });
  if (s.awardN > 0)
    lines.push({ label: `${s.awardN} ${aw.name.toLowerCase()} at $${aw.price.toFixed(2)}`, amount: awards });
  lines.push({ label: 'Decor and sparkle', amount: s.decor });

  return { heads, total: food + drinks + top + fizz + awards + s.decor, lines };
}

export function verdict(s: SpendState) {
  const pot = potInJanuary(s);
  const hoodies = hoodieCost(s);
  const ball = ballCost(s);
  const left = pot - hoodies.total - ball.total;
  return { pot, hoodies, ball, left, perHead: Math.abs(left) / OG_MEMBERS };
}

export const money = (n: number) =>
  (n < 0 ? '−$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-US');
