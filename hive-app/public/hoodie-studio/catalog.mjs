// A dated catalog, deliberately separate from the UI. A record is a verified
// garment + provider + finish + color combination, never a garment-wide promise.
export const SNAPSHOT = 'Original garments: October 18, 2026 · new swag: October 27, 2026';
export const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '2XS', '6XL', 'S/M', 'L/XL', 'M/L'];
const s3 = SIZE_ORDER.slice(1, 7), s5 = SIZE_ORDER.slice(1, 9), xs3 = SIZE_ORDER.slice(0, 7);
export const COLORS = {
  Black: '#242424', White: '#fdfdf9', Sand: '#cfbda0', 'Off White': '#eee8d8',
  'Vintage White': '#ebe5d4', Natural: '#e8dac0', Tan: '#ba9573', 'Heather Dust': '#d8cbb9',
  Bone: '#e9e6e0', Dust: '#d8d2c7', 'Oatmeal Heather': '#c9c1ae',
};
export const ART_COLORS = {'Honey Gold': '#BD9348', Charcoal: '#313130', Black: '#000000', Cream: '#F6F4E5', White: '#FFFFFF'};
export const FONTS = [
  {id: 'F1', name: 'Libre Baskerville Bold', family: 'Libre Baskerville'},
  {id: 'F2', name: 'Lato Bold', family: 'Lato'},
  {id: 'F3', name: 'Courgette', family: 'Courgette'},
];
export const LOGOS = [
  {id: 'A', name: 'Bee emblem'}, {id: 'B', name: 'Headset bee'}, {id: 'C', name: 'Bee only'},
  {id: 'D', name: 'HIVE-WIDE'}, {id: 'E', name: 'OG HIVE'}, {id: 'F', name: 'TECH HIVE'},
  {id: 'G', name: 'HIVE'},
];
export const GARMENTS = [
  {id: 'B', model: 'Bella+Canvas 4740', name: 'Heavyweight quarter-zip in Dust', kind: 'quarter',
   weight: '10 oz/yd²', fabric: 'Three-end fleece · Printify 60/40; Printful 65/35 cotton/poly', fit: 'Relaxed unisex fit · XS–4XL',
   feel: 'Brushed fleece with a substantial, structured hand', warmth: 'The warm light-neutral quarter-zip',
   difference: 'Dust cream-beige · Printful chest embroidery or Printify printing',
   photoColor: 'Dust', source: 'https://printify.com/app/products/6392/bellacanvas/unisex-10-oz-quarter-zip-pullover-sweatshirt',
   secondarySource: 'https://www.printful.com/custom/mens/all/unisex-heavyweight-half-zip-pullover'},
  {id: 'F', model: 'Hanes OG900', name: 'Heavyweight quarter-zip', kind: 'quarter',
   catalogColors: ['Black', 'Ash', 'Charcoal Heather', 'Athletic Navy'],
   weight: '13 oz/yd²', fabric: '81% cotton · 19% polyester', fit: 'Men’s fit · ribbed side panels',
   feel: 'Substantial three-end fleece, for a thick cozy feel', warmth: 'Heaviest of the two quarter-zips',
   difference: 'Quarter-zip collar · cotton face · DTF only',
   photoColor: 'Navy', source: 'https://printify.com/app/products/6843/hanes/mens-premium-heavyweight-quarter-zip-sweatshirt'},
  {id: 'A', model: 'Gildan 18500', name: 'Classic pullover hoodie', kind: 'hoodie',
   weight: '8 oz/yd²', fabric: '50% cotton · 50% polyester', fit: 'Classic unisex fit',
   feel: 'Familiar fleece with a double-lined hood', warmth: 'Everyday warmth, with a hood',
   difference: 'Pouch pocket · broad front print area', photoColor: 'Sport Grey',
   source: 'https://printify.com/app/products/77/gildan/unisex-heavy-blendtm-hooded-sweatshirt'},
  {id: 'D', model: 'Bella+Canvas 3719', name: 'Sponge fleece hoodie', kind: 'hoodie',
   weight: '7–8 oz/yd²¹', fabric: '52% cotton · 48% polyester in solid colors', fit: 'Unisex retail fit · side seams',
   feel: 'Soft sponge fleece with a looser drape', warmth: 'Softness, rather than extra weight',
   difference: 'Combed ring-spun cotton · white drawcords', photoColor: 'Athletic Heather',
   source: 'https://printify.com/app/products/175/bellacanvas/unisex-sponge-fleece-pullover-hoodie'},
  {id: 'E', model: 'Gildan 18000', name: 'Crewneck sweatshirt', kind: 'crew',
   weight: '8 oz/yd²', fabric: '50% cotton · 50% polyester', fit: 'Classic unisex fit',
   feel: 'Straightforward fleece, without a hood or zip', warmth: 'Everyday warmth',
   difference: 'Uninterrupted chest · simple layering', photoColor: 'White',
   source: 'https://printify.com/app/products/49/gildan/unisex-heavy-blend-crewneck-sweatshirt'},
  {id: 'G', model: 'Independent IND5000C', name: 'Legend heavyweight crewneck', kind: 'crew',
   weight: '13.5 oz/yd²', fabric: '70% ring-spun cotton · 30% polyester; cotton face on solid shades', fit: 'Unisex listing · XS–3XL',
   feel: 'Very dense fleece, cross-grain body and thick cotton ribbing', warmth: '13.5 oz · the closest light-color match to the Hanes weight',
   difference: 'Bone shade · heavyweight crewneck · DTG or DTF front/back/sleeves; no embroidery', photoColor: 'Bone',
   source: 'https://printify.com/app/products/6997/independent-trading-company/unisex-legend-premium-heavyweight-cross-grain-crewneck-sweatshirt'},
  {id: 'C', model: 'Gildan 18600', name: 'Full-zip hoodie', kind: 'fullzip',
   weight: '8 oz/yd²', fabric: '50% cotton · 50% polyester', fit: 'Classic unisex fit',
   feel: 'Fleece you can open up for easy layering', warmth: 'Adjustable warmth',
   difference: 'Full zip splits the front · left-chest logo or back', photoColor: 'White',
   source: 'https://printify.com/app/products/66/gildan/unisex-heavy-blend-full-zip-hooded-sweatshirt'},
  {id: 'H', model: 'Lane Seven LS14003', name: 'Full-zip fleece hoodie', kind: 'fullzip',
   weight: '8.25 oz/yd²', fabric: '80% combed ring-spun cotton · 20% recycled polyester (varies by shade)', fit: 'Regular fit · XS–3XL',
   feel: 'Soft three-end fleece with a fleece-lined hood', warmth: 'Mid-heavy fleece · a lighter full-zip layer',
   difference: 'YKK #5 zipper · Oatmeal Heather and White offered by Fulfill Engine', photoColor: 'Catalog reference',
   source: 'https://printify.com/app/products/445/lane-seven/unisex-zip-hoodie',
   secondarySource: 'https://www.printful.com/custom/mens/all/lane-seven-ls14003-premium-full-zip-hoodie'},
  {"id": "T", "model": "Bella+Canvas 3001", "name": "Staple T-shirt", "kind": "tee", "weight": "4.2 oz/yd\u00b2", "fabric": "Cotton jersey; fiber blend varies by shade", "fit": "Unisex retail fit", "feel": "Lightweight everyday jersey", "warmth": "Short sleeves and a classic crew neck", "difference": "Short sleeves and a classic crew neck", "source": "https://www.printful.com/custom/mens/all/unisex-staple-t-shirt-bella-canvas-3001", "photoColor": "Catalog reference", "newSwag": true, "printedColor": false},
  {"id": "P", "model": "Printful wide-leg joggers", "name": "Wide-leg joggers", "kind": "pants", "weight": "9.08 oz/yd\u00b2", "fabric": "Recycled polyester and elastane; regional blend varies", "fit": "Relaxed unisex fit \u00b7 drawstring waist", "feel": "Stretch fabric with side pockets", "warmth": "Wide legs and an adjustable waistband", "difference": "Wide legs and an adjustable waistband", "source": "https://www.printful.com/custom/collections/all-over-print/all-over-print-unisex-wide-leg-joggers", "photoColor": "Catalog reference", "newSwag": true, "printedColor": true},
  {"id": "S", "model": "Printful athletic shorts", "name": "Athletic shorts", "kind": "shorts", "weight": "5.13 oz/yd\u00b2", "fabric": "91% recycled polyester \u00b7 9% spandex", "fit": "Relaxed unisex fit \u00b7 2.56-inch inseam", "feel": "Lightweight stretch fabric", "warmth": "Mesh pockets and drawstring waist", "difference": "Mesh pockets and drawstring waist", "source": "https://www.printful.com/custom/collections/sportswear/all-over-print-unisex-athletic-shorts", "photoColor": "Catalog reference", "newSwag": true, "printedColor": true},
  {"id": "K", "model": "SOCCO SC200", "name": "Embroidered crew socks", "kind": "socks", "weight": "Cushioned sole", "fabric": "80% cotton \u00b7 17% polyester \u00b7 3% spandex", "fit": "Unisex crew socks", "feel": "Ribbed knit with cushioning", "warmth": "Matching embroidery on both socks", "difference": "Matching embroidery on both socks", "source": "https://www.printful.com/custom/socks/personalized/embroidered-crew-socks-socco-sc200", "photoColor": "Catalog reference", "newSwag": true, "printedColor": false},
  {"id": "W", "model": "Printful fanny pack", "name": "Fanny pack", "kind": "bag", "weight": "1.4-liter capacity", "fabric": "100% polyester", "fit": "Adjustable strap \u00b7 two strap sizes", "feel": "Water-resistant woven fabric", "warmth": "Zipped main pocket and inside pocket", "difference": "Zipped main pocket and inside pocket", "source": "https://www.printful.com/custom/bags/personalized/all-over-print-fanny-pack", "photoColor": "Catalog reference", "newSwag": true, "printedColor": true},
];
// Public USD starting prices checked October 18, 2026. These are deliberately
// kept separate from availability: a catalog starting price is useful context,
// but it is not a quote for every size, color, technique or placement.
export const PRICE_GUIDE = {
  T: {from: 11.92, shippingFrom: 4.95, basis: 'Printful · October 27, 2026'},
  P: {from: 39.73, shippingFrom: 8.29, basis: 'Printful · October 27, 2026'},
  S: {from: 29.98, shippingFrom: 4.69, basis: 'Printful · October 27, 2026'},
  K: {from: 23.36, shippingFrom: 4.69, basis: 'Printful · October 27, 2026'},
  W: {from: 24.11, shippingFrom: 4.69, basis: 'Printful · October 27, 2026'},

  A: {from: 21.58, shippingFrom: 7.39, basis: 'Printify catalog'},
  B: {from: 38.96, shippingFrom: 4.95, basis: 'Printful catalog'},
  C: {from: 28.63, shippingFrom: 7.39, basis: 'Printify catalog'},
  D: {from: 37.55, shippingFrom: 7.39, basis: 'Printify catalog'},
  E: {from: 17.87, shippingFrom: 7.39, basis: 'Printify catalog'},
  F: {from: 58.80, shippingFrom: 7.99, basis: 'Fulfill Engine · Printify'},
  G: {from: 51.21, shippingFrom: 7.99, basis: 'Fulfill Engine · Printify'},
  H: {from: 27.49, shippingFrom: 8.79, basis: 'Printful catalog'},
};
const PROVIDER_PRICES = {
  'A|Printify Choice': {from: 21.58, shippingFrom: 7.39, basis: 'Printify Choice'},
  'B|Fulfill Engine · Printify': {from: 47.37, shippingFrom: 7.99, basis: 'Fulfill Engine · Printify'},
  'B|Printful': {from: 38.96, shippingFrom: 4.95, basis: 'Printful'},
  'E|Printify Choice': {from: 17.87, shippingFrom: 7.39, basis: 'Printify Choice'},
  'F|Fulfill Engine': {from: 58.80, shippingFrom: 7.99, basis: 'Fulfill Engine · Printify'},
  'G|Fulfill Engine': {from: 51.21, shippingFrom: 7.99, basis: 'Fulfill Engine · Printify'},
  'H|Fulfill Engine': {from: 32.43, shippingFrom: 7.99, basis: 'Fulfill Engine · Printify'},
  'H|Printful': {from: 27.49, shippingFrom: 8.79, basis: 'Printful'},
};
export const money = value => `$${Number(value).toFixed(2)}`;
export function priceFor(state) {
  const provider = PROVIDER_PRICES[`${state.garment}|${state.provider}`];
  const base = provider || PRICE_GUIDE[state.garment] || null;
  if (!base) return null;
  return {
    ...base,
    exactProvider: Boolean(provider),
    subtotalFrom: Number((base.from * Math.max(1, Number(state.quantity) || 1)).toFixed(2)),
    note: state.provider === 'Printful' && state.finish === 'Embroidery'
      ? `${state.designLayout === 'chest-back' ? 'A second embroidery placement costs extra. ' : ''}First use may add a $6.50 digitization fee per uploaded embroidery file.`
      : '',
  };
}
export const FINISHES = {
  AOP: {name:'All-over print', short:'Printed fabric, then cut and sewn',good:'A custom base color and HIVE artwork.',tradeoff:'White fabric can show slightly at folds and seams.',life:'Follow the product care label.'},
  DTG: {name: 'DTG', short: 'Ink printed into fabric', good: 'Soft feel; detailed, multicolor logos.',
    tradeoff: 'Can fade gradually; fabric affects the result.', life: 'General estimate: about 50+ washes with proper care.'},
  DTF: {name: 'DTF', short: 'Heat-pressed transfer print', good: 'Crisp detail and strong color on blends.',
    tradeoff: 'A surface layer you can feel, especially on large designs.', life: 'General estimate: about 50–100 washes with proper care.'},
  Embroidery: {name: 'Embroidery', short: 'Logo stitched in thread', good: 'Textured and durable; suits a compact, simple mark.',
    tradeoff: 'Fine detail and tiny letters need digitizing or simplification.', life: 'No published wash-count rating for these garment/provider options.'},
  Puff: {name: 'Puff', short: 'Raised heat-transfer text', good: 'Bold, tactile lettering made in Printify’s editor.',
    tradeoff: 'Provider fonts and placements apply; uploaded logos are unsupported.', life: 'No published wash-count rating for Printify puff.'},
};
const front = ['Left chest', 'Center front', 'Back', 'Left sleeve', 'Right sleeve'];
const qfront = ['Left chest', 'Back', 'Left sleeve', 'Right sleeve'];
const record = (garment, provider, finish, color, sizes, placements, checked = '2026-10-14') => ({garment, provider, finish, color, sizes, placements, checked});
export const VARIANTS = [
  ...['Black','White'].map(c=>record('T','Printful','DTG',c,['XS','S','M','L','XL','2XL','3XL','4XL','5XL'],['Left chest','Center front','Back'],'2026-10-27')),
  ...['Black','White','Sand'].map(c=>record('P','Printful','AOP',c,['2XS','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'],['Left thigh','Right thigh'],'2026-10-27')),
  ...['Black','White','Sand'].map(c=>record('S','Printful','AOP',c,['XS','S','M','L','XL','2XL','3XL'],['Left thigh','Right thigh'],'2026-10-27')),
  ...['Black','White'].map(c=>record('K','Printful','Embroidery',c,['S/M','L/XL'],['Outside','Inside'],'2026-10-27')),
  ...['Black','White','Sand'].map(c=>record('W','Printful','AOP',c,['S/M','M/L'],['Front panel'],'2026-10-27')),

  record('B', 'Fulfill Engine · Printify', 'DTF', 'Dust', SIZE_ORDER.slice(0, 8), ['Back', 'Left sleeve', 'Right sleeve'], '2026-10-18'),
  record('B', 'Fulfill Engine · Printify', 'DTG', 'Dust', SIZE_ORDER.slice(0, 8), ['Back', 'Left sleeve', 'Right sleeve'], '2026-10-18'),
  record('B', 'Printful', 'Embroidery', 'Dust', xs3, ['Left chest', 'Right chest', 'Left wrist', 'Right wrist'], '2026-10-18'),
  record('F', 'Fulfill Engine', 'DTF', 'Black', s3, ['Left chest', 'Right chest', 'Back', 'Left sleeve', 'Right sleeve']),
  ...['Black', 'White', 'Sand'].map(c => record('A', 'Printify Choice', 'DTG', c, s5, front)),
  ...['Black', 'Sand'].map(c => record('A', 'Fulfill Engine', 'Embroidery', c, s5, ['Left chest'])),
  record('A', 'Fulfill Engine', 'Embroidery', 'White', ['S','M','L','XL','2XL','3XL','5XL'], ['Left chest']),
  record('C', 'SwiftPOD', 'DTG', 'Black', s5, ['Left chest', 'Back']),
  record('C', 'SwiftPOD', 'DTG', 'White', s3, ['Left chest', 'Back']),
  record('C', 'Fulfill Engine', 'Embroidery', 'Black', s5, ['Left chest']),
  record('C', 'Fulfill Engine', 'Embroidery', 'White', s3, ['Left chest']),
  ...['Black', 'White', 'Vintage White'].map(c => record('D', 'Fulfill Engine', 'DTF', c, xs3, ['Left chest', 'Center front', 'Back'])),
  record('D', 'Fulfill Engine', 'DTF', 'Natural', s3, ['Left chest', 'Center front', 'Back']),
  record('D', 'Fulfill Engine', 'DTF', 'Tan', ['XS','S','M','XL','3XL'], ['Left chest', 'Center front', 'Back']),
  record('D', 'Fulfill Engine', 'DTF', 'Heather Dust', ['XS','S','XL'], ['Left chest', 'Center front', 'Back']),
  ...['Black', 'White'].map(c => record('E', 'Printify Choice', 'DTG', c, s5, front)),
  record('E', 'Printify Choice', 'DTG', 'Sand', s3, front),
  ...['Black', 'White', 'Sand'].map(c => record('E', 'Fulfill Engine', 'Embroidery', c, s3, ['Left chest'])),
  ...['Black', 'White', 'Bone'].flatMap(c => ['DTG', 'DTF'].map(f => record('G', 'Fulfill Engine', f, c, xs3, ['Center front', 'Back', 'Left sleeve', 'Right sleeve'], '2026-10-18'))),
  ...['Black', 'White', 'Oatmeal Heather'].flatMap(c => [
    record('H', 'Fulfill Engine', 'DTF', c, xs3, ['Left chest', 'Right chest', 'Left wrist', 'Right wrist'], '2026-10-18'),
    record('H', 'Fulfill Engine', 'DTG', c, xs3, ['Back'], '2026-10-18'),
  ]),
  record('H', 'Printful', 'Embroidery', 'Black', s3, ['Left chest', 'Large back'], '2026-10-18'),
];
// Unverified variants never become selectable merely because a model supports
// the method in general. The separate evidence batch can add exact records.
export const PENDING = {};
export const PHOTOS = {T: {'Catalog reference': {front: "https://files.cdn.printful.com/o/upload/variant-image-jpg/9d/9d2757a2333a362030a37d607942588c_l?v=c17e84ebf91ab325852f9d18120a338f"}},P: {'Catalog reference': {front: "https://files.cdn.printful.com/o/upload/variant-image/09/091a0b151a47a34d6b94927e8c41032a_l?v=3f6547eacf6d8ed88e748b84aa934b1b"}},S: {'Catalog reference': {front: "https://files.cdn.printful.com/o/upload/variant-image/50/50e077550a3d7e45e8339d77c2d310fc_l"}},K: {'Catalog reference': {front: "https://files.cdn.printful.com/o/upload/variant-image-jpg/4a/4ad93a60e28bd2090fc691aec125ade1_l"}},W: {'Catalog reference': {front: "https://files.cdn.printful.com/o/upload/variant-image-jpg/00/00d140b7235d3e1dcd375b0e66a6ec2d_l"}},B: {
  Dust: {front: 'assets/garment-B-Dust-front.jpg'},
}, F: {
  Black: {front: 'assets/garment-F-Black-front.jpg',
    back: 'assets/garment-F-Black-back.jpg'},
}, D: {
  Black: {front: 'assets/garment-D-Black-front.jpg', back: 'assets/garment-D-Black-back.jpg'},
  White: {front: 'assets/garment-D-White-front.jpg'},
  Natural: {front: 'assets/garment-D-Natural-front.jpg'},
  'Vintage White': {front: 'assets/garment-D-Vintage-White-front.jpg'},
  Tan: {front: 'assets/garment-D-Tan-front.jpg'},
}, G: {
  Bone: {front: 'assets/garment-G-Bone-front.jpg', back: 'assets/garment-G-Bone-back.jpg'},
}, H: {
  'Catalog reference': {front: 'assets/garment-H-reference.png'},
}};
export function rowsFor(state, {ignoreSize = false, ignoreFinish = false} = {}) {
  return VARIANTS.filter(r => r.garment === state.garment && (!state.color || r.color === state.color)
    && (ignoreSize || !state.size || r.sizes.includes(state.size))
    && (ignoreFinish || !state.finish || r.finish === state.finish));
}
export function availableColors(garment) {
  return Object.keys(COLORS).filter(c => VARIANTS.some(r => r.garment === garment && r.color === c));
}
export function availableSizes(state) {
  return SIZE_ORDER.filter(s => rowsFor(state, {ignoreSize: true}).some(r => r.sizes.includes(s)));
}
export function availableFinishes(state) {
  return Object.keys(FINISHES).filter(f => rowsFor(state, {ignoreFinish: true}).some(r => r.finish === f));
}
export function selectedRow(state) {
  return rowsFor(state).find(r => r.provider === state.provider && r.finish === state.finish) || null;
}
export const isBackPlacement = placement => /\bback\b/i.test(placement || '');
export const initialState = () => ({step: 0, garment: '', color: '', size: '', finish: '', provider: '',
  logo: 'C', placement: 'Left chest', designLayout: 'single', name: '', font: 'F2', artColor: 'Honey Gold', namePlacement: 'With logo', quantity: 1, member: 'OG HIVE', view: 'study', face: 'front'});
export function normalize(state) {
  const next = {...initialState(), ...state};
  if (!GARMENTS.some(g => g.id === next.garment)) next.garment = '';
  if (!availableColors(next.garment).includes(next.color)) { next.color = ''; next.size = ''; next.finish = ''; next.provider = ''; }
  if (next.size && !rowsFor({...next, finish: ''}, {ignoreSize: true}).some(r => r.sizes.includes(next.size))) next.size = '';
  const possible = availableFinishes(next);
  if (!possible.includes(next.finish)) {next.finish = ''; next.provider = '';}
  const row = selectedRow(next);
  if (!row) next.provider = rowsFor(next).find(r => r.finish === next.finish)?.provider || '';
  const exact = selectedRow(next);
  if (exact && !exact.placements.includes(next.placement)) next.placement = exact.placements[0];
  const twoSidedSupported = next.finish === 'Embroidery' && exact?.placements.includes('Left chest') && exact.placements.some(isBackPlacement);
  if (!['single','chest-back'].includes(next.designLayout) || !twoSidedSupported) next.designLayout = 'single';
  if (next.designLayout === 'chest-back') {
    next.placement = 'Left chest'; next.logo = 'C'; next.artColor = 'Black'; next.namePlacement = 'With logo';
  }
  if (next.finish === 'Embroidery' && !['C', 'none'].includes(next.logo)) next.logo = 'C';
  if (next.finish === 'Puff') {next.logo = 'none'; next.font = 'provider';}
  if (!LOGOS.some(l => l.id === next.logo) && next.logo !== 'none') next.logo = 'C';
  if (!FONTS.some(f => f.id === next.font) && next.font !== 'provider') next.font = 'F2';
  if (!Object.hasOwn(ART_COLORS, next.artColor)) next.artColor = 'Honey Gold';
  next.name = String(next.name).slice(0, 24);
  if (next.namePlacement !== 'With logo' && !exact?.placements.includes(next.namePlacement)) next.namePlacement = 'With logo';
  if (next.namePlacement === next.placement || next.logo === 'none') next.namePlacement = 'With logo';
  if (!['front','back'].includes(next.face) || (next.face === 'back' && !exact?.placements.some(isBackPlacement))) next.face = 'front';
  next.quantity = Number.isInteger(Number(next.quantity)) ? Math.min(20, Math.max(1, Number(next.quantity))) : 1;
  if (!['OG HIVE','Other HIVE'].includes(next.member)) next.member = 'OG HIVE';
  next.step = Math.min(3, Math.max(0, Number(next.step) || 0));
  if (!next.garment) next.step = 0;
  else if (!next.color || !next.size) next.step = Math.min(1, next.step);
  else if (!exact || (next.logo === 'none' && !next.name.trim())) next.step = Math.min(2, next.step);
  return next;
}
export function canReview(state) {
  const row = selectedRow(state);
  return Boolean(state.color && state.size && state.finish && row?.sizes.includes(state.size)
    && row.placements.includes(state.placement) && (state.logo !== 'none' || state.name.trim())
    && (!state.name.trim() || state.namePlacement === 'With logo' || row.placements.includes(state.namePlacement)));
}
export function selectionText(state) {
  const g = GARMENTS.find(g => g.id === state.garment);
  const l = LOGOS.find(l => l.id === state.logo);
  const designService = state.provider === 'Printful' ? 'Printful' : 'Printify';
  const price = priceFor(state);
  return [`HIVE clothing selections`, `Garment: ${g?.id} · ${g?.name} · ${g?.model}`,
    `Color: ${state.color}`, `Size: ${state.size}`, `Quantity: ${state.quantity}`,
    `Finish: ${state.finish}`, `Provider: ${state.provider}`,
    `Logo: ${l ? `${l.id} · ${l.name}` : 'Name only'}`, `Placement: ${state.placement} (wearer’s perspective)`,
    ...(state.designLayout === 'chest-back' ? ['Layout: Black-on-black chest + large back', 'Back artwork: G · HIVE seal · black embroidery'] : []),
    `Name: ${state.name.trim() || 'None'}`, ...(state.name.trim() ? [`Font: ${FONTS.find(f => f.id === state.font)?.name || 'Confirm provider font'}`,
      `Name color: ${state.artColor}${state.finish === 'Embroidery' ? ' · closest available thread shade' : ''}`, `Name placement: ${state.namePlacement === 'With logo' ? state.placement : state.namePlacement}`] : []),
    ...(price ? [`Estimated item price: from ${money(price.from)} USD each`, `Estimated merchandise subtotal: from ${money(price.subtotalFrom)} USD`,
      ...(price.note ? [`Price note: ${price.note}`] : []), `Shipping, tax and any size, color, technique or placement charges are not included.`] : []),
    `Coverage: ${g?.newSwag ? 'Confirm coverage and amount with Nat' : state.member === 'OG HIVE' ? 'Honey Pot dues' : 'At cost · Nat confirms amount'}`,
    `Catalog snapshot: ${SNAPSHOT} · Nat rechecks stock before ordering`,
    `Next: Nat prepares the ${designService} design and confirms the screenshot before ordering.`,
    'This local prototype has not submitted an order or sent selections.'].join('\n');
}
