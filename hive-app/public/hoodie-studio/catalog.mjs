// A dated catalog, deliberately separate from the UI. A record is a verified
// garment + provider + finish + color combination, never a garment-wide promise.
export const SNAPSHOT = 'October 14, 2026';
export const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
const s3 = SIZE_ORDER.slice(1, 7), s5 = SIZE_ORDER.slice(1), xs3 = SIZE_ORDER.slice(0, 7);
export const COLORS = {
  Black: '#242424', White: '#fdfdf9', Sand: '#cfbda0', 'Off White': '#eee8d8',
  'Vintage White': '#ebe5d4', Natural: '#e8dac0', Tan: '#ba9573', 'Heather Dust': '#d8cbb9',
};
export const ART_COLORS = {'Honey Gold': '#BD9348', Charcoal: '#313130', Cream: '#F6F4E5', White: '#FFFFFF'};
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
  {id: 'B', model: 'Gildan SF008', name: 'Midweight quarter-zip', kind: 'quarter',
   weight: '8.4 oz/yd²', fabric: '80% ring-spun cotton · 20% polyester', fit: 'Classic unisex fit',
   feel: 'Soft fleece, with a lighter feel than the Hanes', warmth: 'Everyday warmth',
   difference: 'Quarter-zip collar · smooth ring-spun cotton blend',
   photoColor: 'Off White', source: 'https://printify.com/app/products/2244/gildan/unisex-softstyle-midweight-q-zip-sweatshirt'},
  {id: 'F', model: 'Hanes OG900', name: 'Heavyweight quarter-zip', kind: 'quarter',
   weight: '13 oz/yd²', fabric: '81% cotton · 19% polyester', fit: 'Men’s fit · ribbed side panels',
   feel: 'Substantial three-end fleece, for a thick cozy feel', warmth: 'Heaviest fabric of these six',
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
  {id: 'C', model: 'Gildan 18600', name: 'Full-zip hoodie', kind: 'zip',
   weight: '8 oz/yd²', fabric: '50% cotton · 50% polyester', fit: 'Classic unisex fit',
   feel: 'Fleece you can open up for easy layering', warmth: 'Adjustable warmth',
   difference: 'Full zip splits the front · left-chest logo or back', photoColor: 'White',
   source: 'https://printify.com/app/products/66/gildan/unisex-heavy-blend-full-zip-hooded-sweatshirt'},
  {id: 'E', model: 'Gildan 18000', name: 'Crewneck sweatshirt', kind: 'crew',
   weight: '8 oz/yd²', fabric: '50% cotton · 50% polyester', fit: 'Classic unisex fit',
   feel: 'Straightforward fleece, without a hood or zip', warmth: 'Everyday warmth',
   difference: 'Uninterrupted chest · simple layering', photoColor: 'White',
   source: 'https://printify.com/app/products/49/gildan/unisex-heavy-blend-crewneck-sweatshirt'},
];
export const FINISHES = {
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
const record = (garment, provider, finish, color, sizes, placements) => ({garment, provider, finish, color, sizes, placements, checked: '2026-10-14'});
export const VARIANTS = [
  ...['Black', 'Sand', 'Off White'].map(c => record('B', 'Printify Choice', 'DTG', c, s3, qfront)),
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
];
// Unverified variants never become selectable merely because a model supports
// the method in general. The separate evidence batch can add exact records.
export const PENDING = {};
export const PHOTOS = {F: {
  Black: {front: 'assets/garment-F-Black-front.jpg',
    back: 'assets/garment-F-Black-back.jpg'},
}, D: {
  Black: {front: 'assets/garment-D-Black-front.jpg', back: 'assets/garment-D-Black-back.jpg'},
  White: {front: 'assets/garment-D-White-front.jpg'},
  Natural: {front: 'assets/garment-D-Natural-front.jpg'},
  'Vintage White': {front: 'assets/garment-D-Vintage-White-front.jpg'},
  Tan: {front: 'assets/garment-D-Tan-front.jpg'},
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
export const initialState = () => ({step: 0, garment: '', color: '', size: '', finish: '', provider: '',
  logo: 'C', placement: 'Left chest', name: '', font: 'F2', artColor: 'Honey Gold', namePlacement: 'With logo', quantity: 1, member: 'OG HIVE', view: 'study', face: 'front'});
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
  if (next.finish === 'Embroidery' && !['C', 'none'].includes(next.logo)) next.logo = 'C';
  if (next.finish === 'Puff') {next.logo = 'none'; next.font = 'provider';}
  if (!LOGOS.some(l => l.id === next.logo) && next.logo !== 'none') next.logo = 'C';
  if (!FONTS.some(f => f.id === next.font) && next.font !== 'provider') next.font = 'F2';
  if (!Object.hasOwn(ART_COLORS, next.artColor)) next.artColor = 'Honey Gold';
  next.name = String(next.name).slice(0, 24);
  if (next.namePlacement !== 'With logo' && !exact?.placements.includes(next.namePlacement)) next.namePlacement = 'With logo';
  if (next.namePlacement === next.placement || next.logo === 'none') next.namePlacement = 'With logo';
  if (!['front','back'].includes(next.face) || (next.face === 'back' && !exact?.placements.includes('Back'))) next.face = 'front';
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
  return [`HIVE clothing selections`, `Garment: ${g?.id} · ${g?.name} · ${g?.model}`,
    `Color: ${state.color}`, `Size: ${state.size}`, `Quantity: ${state.quantity}`,
    `Finish: ${state.finish}`, `Provider: ${state.provider}`,
    `Logo: ${l ? `${l.id} · ${l.name}` : 'Name only'}`, `Placement: ${state.placement} (wearer’s perspective)`,
    `Name: ${state.name.trim() || 'None'}`, ...(state.name.trim() ? [`Font: ${FONTS.find(f => f.id === state.font)?.name || 'Confirm provider font'}`,
      `Name color: ${state.artColor}${state.finish === 'Embroidery' ? ' · closest available thread shade' : ''}`, `Name placement: ${state.namePlacement === 'With logo' ? state.placement : state.namePlacement}`] : []),
    `Coverage: ${state.member === 'OG HIVE' ? 'Honey Pot dues' : 'At cost · Nat confirms amount'}`,
    `Catalog snapshot: ${SNAPSHOT} · Nat rechecks stock before ordering`,
    'Next: Nat prepares the Printify design and confirms the screenshot before ordering.',
    'This local prototype has not submitted an order or sent selections.'].join('\n');
}
