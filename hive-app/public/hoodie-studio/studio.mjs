import {SNAPSHOT, SIZE_ORDER, COLORS, ART_COLORS, FONTS, LOGOS, GARMENTS, PRICE_GUIDE, FINISHES, VARIANTS, PENDING, PHOTOS,
  initialState, normalize, availableColors, availableSizes, availableFinishes, rowsFor, selectedRow, isBackPlacement, canReview, money, priceFor, selectionText} from './catalog.mjs?v=20261027.1';

const app = document.querySelector('#app'), steps = document.querySelector('#steps'), notice = document.querySelector('#notice');
const DRAFT_KEY = 'hive-clothing-review-v1';
const titles = ['Choose your style', 'Choose your color & size', 'Make it yours', 'Review your picks'];
const stepNames = ['Style', 'Color & size', 'Customize', 'Review'];
let state = initialState(), filter = 'all', saved = false, noticeTimer;
try { const draft = localStorage.getItem(DRAFT_KEY); if (draft) {state = normalize(JSON.parse(draft)); saved = canReview(state);} } catch { /* Storage can be unavailable in private browsing. */ }
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attr = (key, value) => `data-action="${key}" data-value="${esc(value)}"`;
const btn = (key, value, label, chosen = false, extra = '') => `<button ${attr(key,value)} type="button" class="choice ${chosen ? 'selected' : ''}" aria-pressed="${chosen}" ${extra}>${label}</button>`;
const garment = () => GARMENTS.find(g => g.id === state.garment);
const logoAsset = id => id === 'C' ? 'assets/bee-transparent.webp' : `assets/logo-${id}.png`;
const colorSwatch = (name, color = COLORS[name]) => `<span class="swatch" style="--swatch:${color}" aria-hidden="true"></span>`;
const maxStep = () => !state.garment ? 0 : !state.color || !state.size ? 1 : canReview(state) ? 3 : 2;
function say(message) {
  clearTimeout(noticeTimer); notice.textContent = message; notice.classList.add('visible');
  noticeTimer = setTimeout(() => notice.classList.remove('visible'), 5000);
}
function update(patch, message = '') {
  const focused = document.activeElement?.dataset;
  const previous = {...state}; state = normalize({...state,...patch}); saved = false;
  render();
  if (focused?.action) [...document.querySelectorAll('[data-action]')].find(el=>el.dataset.action===focused.action&&el.dataset.value===focused.value&&!el.disabled)?.focus({preventScroll:true});
  if (focused?.field) [...document.querySelectorAll('[data-field]')].find(el=>el.dataset.field===focused.field&&!el.disabled)?.focus({preventScroll:true});
  if (message) say(message);
  else if (previous.finish && !state.finish && previous.garment === state.garment) say('Finish cleared. Choose one available for this color and size.');
}
function go(step) {
  if (step > maxStep()) return;
  clearTimeout(noticeTimer); notice.textContent = ''; notice.classList.remove('visible');
  state.step = step; render(); window.scrollTo({top:0,behavior:'instant'}); document.querySelector('#screen-title').focus();
}
function facts(g) {
  return `<dl class="facts"><div><dt>Fabric</dt><dd>${g.fabric}</dd></div><div><dt>Fit</dt><dd>${g.fit}</dd></div><div><dt>Feel</dt><dd>${g.feel}</dd></div></dl>`;
}
function photoFor(g, color, side = 'front') {
  return PHOTOS[g.id]?.[color]?.[side] || null;
}
function priceBlock({review = false} = {}) {
  const price = priceFor(state); if (!price) return '';
  const heading = price.exactProvider ? `${price.basis} starting price` : 'Catalog starting price';
  return `<div class="price-block ${review?'review-price':''}"><div><span>${heading}</span><strong>From ${money(price.from)} USD each</strong></div>
    <div><span>Merchandise subtotal</span><strong>From ${money(price.subtotalFrom)} USD</strong></div>
    <p>Shipping from ${money(price.shippingFrom)} plus tax. Size, color, technique and placement can change the total.${price.note?` ${price.note}`:''} Nat confirms the exact at-cost amount in the provider screenshot.</p></div>`;
}
function productCard(g) {
  const typeName = {hoodie:'Hoodie',quarter:'Quarter-zip',fullzip:'Full-zip',crew:'Crewneck',tee:'T-shirt',pants:'Pants',shorts:'Shorts',socks:'Socks',bag:'Fanny pack'}[g.kind];
  const colors = availableColors(g.id);
  const shownColor = photoFor(g,g.photoColor) ? g.photoColor : photoFor(g,'Black') ? 'Black' : g.photoColor || null;
  const photo = photoFor(g,shownColor) || `assets/garment-${g.id}.png`;
  const photoLabel = shownColor === 'Catalog reference' ? 'Catalog reference' : shownColor ? `Shown: ${shownColor}` : 'Reference photo';
  const methods = [...new Set(VARIANTS.filter(r=>r.garment===g.id).map(r=>r.finish))];
  return `<article class="garment-card ${state.garment===g.id?'chosen':''}">
    <div class="card-photo"><img src="${photo}" alt="${esc(g.model)} · ${esc(photoLabel)}" loading="lazy"><span class="shown-color">${photoLabel}</span><span class="weight">${g.weight}</span></div>
    <div class="card-body"><div class="type-label">${typeName}</div><div class="model">${g.model}</div><h2>${g.name}</h2><p class="warmth">${g.warmth}</p>${facts(g)}
    <div class="card-bottom"><p class="card-price"><strong>From ${money(PRICE_GUIDE[g.id].from)} USD</strong><span>public catalog starting price</span></p><div class="mini-colors" aria-label="Checked colors in your neutral palette">${colors.map(c=>`<span title="${c}">${colorSwatch(c)}</span>`).join('')}<span>${colors.length} ${colors.length===1?'neutral color':'neutral colors'} · ${methods.join(' / ') || 'Check pending'}</span></div>
    <button class="primary card-choose" ${attr('garment',g.id)}>Choose ${g.model}<span aria-hidden="true">→</span></button></div></div>
  </article>`;
}
function styleScreen() {
  const groups = [['hoodie','Hoodies'],['quarter','Quarter-zips'],['fullzip','Full-zips'],['crew','Crewnecks'],['tee','T-shirts'],['pants','Pants'],['shorts','Shorts'],['socks','Socks'],['bag','Fanny packs']]
    .filter(([kind]) => filter === 'all' || filter === kind)
    .map(([kind,label]) => ({label,items:GARMENTS.filter(g=>g.kind===kind).sort((a,b)=>a.model.localeCompare(b.model))}));
  const choices = groups.flatMap(({items})=>items);
  return `<div class="section-tools"><div class="filter-group" aria-label="Filter garment styles">
    ${[['all','All styles'],['quarter','Quarter-zips'],['hoodie','Hoodies'],['crew','Crewnecks'],['fullzip','Full-zips'],['tee','T-shirts'],['pants','Pants'],['shorts','Shorts'],['socks','Socks'],['bag','Fanny packs']].map(([k,v])=>btn('filter',k,v,filter===k)).join('')}</div>
    <button class="text-button" data-action="finish-guide">Compare finishes ↗</button></div>
    <div class="garment-grid">${choices.map(productCard).join('')}</div>
    <div class="catalog-notes"><p>Warmth describes relative fabric weight and coverage, rather than a tested temperature rating.</p><p>¹ Bella+Canvas 3719: Printify lists 7 oz/yd²; the manufacturer lists 8 oz/yd². Blend varies by shade.</p>
    <details><summary>Catalog checks & photo sources</summary><p>Availability checked ${SNAPSHOT}. Nat rechecks the exact provider, color, size and finish before ordering.</p><p>Photos show real garments. Only the listed choices are included in this neutral palette.</p><ul>${GARMENTS.map(g=>`<li><a href="${g.source}" target="_blank" rel="noopener">${g.model} · primary catalog</a>${g.secondarySource?` · <a href="${g.secondarySource}" target="_blank" rel="noopener">embroidery source</a>`:''}</li>`).join('')}</ul><p><a href="https://www.bellacanvas.com/product/3719/Unisex-Sponge-Fleece-Pullover-Hoodie.html" target="_blank" rel="noopener">Bella+Canvas manufacturer specifications</a></p></details></div>`;
}
function swagStudy(g,color,back) {
 const fill=COLORS[color]||'#eee8d8';
 const shapes={
 tee:'M220 110 L160 130 L85 255 L165 292 L200 230 L200 535 L400 535 L400 230 L435 292 L515 255 L440 130 L380 110 Q300 160 220 110Z',
 pants:'M210 80 L390 80 L420 545 L318 545 L300 240 L282 545 L180 545Z',
 shorts:'M200 165 L400 165 L440 440 L315 440 L300 285 L285 440 L160 440Z',
 socks:'M160 90 L240 90 L240 360 L145 470 Q95 490 78 450 Q70 425 102 400 L160 335Z M355 90 L435 90 L435 360 L340 470 Q290 490 273 450 Q265 425 297 400 L355 335Z',
 bag:'M60 240 L180 240 L200 200 L400 200 L420 240 L540 240 L540 275 L430 275 Q410 410 300 420 Q190 410 170 275 L60 275Z'
 };
 return `<svg class="garment-study" viewBox="0 0 600 620" role="img" aria-label="Illustrative ${esc(color)} ${esc(g.name)}"><path d="${shapes[g.kind]}" fill="${fill}" stroke="#756a56" stroke-width="3"/>${g.kind==='pants'||g.kind==='shorts'?'<path d="M205 190 H395 M290 190 V238 M310 190 V238" stroke="#756a56" fill="none" stroke-width="3"/>':''}${g.kind==='bag'?'<path d="M205 260 H395" stroke="#756a56" stroke-width="5"/>':''}${g.kind==='socks'?'<path d="M160 120 H240 M355 120 H435" stroke="#756a56" stroke-width="3"/>':''}</svg>`;
}
function svgGarment(g, color, back) {
  if (g.newSwag) return swagStudy(g,color,back);
  if (!Object.hasOwn(COLORS, color)) throw new Error('A garment study requires a selected catalog color.');
  const q = g.kind === 'quarter', hood = ['hoodie','fullzip'].includes(g.kind), zip = g.kind === 'fullzip';
  return `<svg class="garment-study" viewBox="0 0 600 620" role="img" aria-label="Illustrative ${esc(color)} ${esc(g.name)} ${back?'back':'front'}">
    <defs><linearGradient id="fabric" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${COLORS[color]}"/><stop offset=".4" stop-color="${COLORS[color]}"/><stop offset="1" stop-color="${COLORS[color]}"/></linearGradient><linearGradient id="light"><stop stop-color="white" stop-opacity=".19"/><stop offset=".45" stop-color="white" stop-opacity="0"/><stop offset="1" stop-color="black" stop-opacity=".17"/></linearGradient></defs>
    <path d="M220 100 Q300 120 380 100 L447 134 Q462 143 467 161 L527 493 L464 509 L422 300 L428 545 Q300 561 172 545 L178 300 L136 509 L73 493 L133 161 Q138 143 153 134Z" fill="url(#fabric)" stroke="#000" stroke-opacity=".13" stroke-width="2"/>
    <path d="M220 100 Q300 120 380 100 L447 134 Q462 143 467 161 L527 493 L464 509 L422 300 L428 545 Q300 561 172 545 L178 300 L136 509 L73 493 L133 161 Q138 143 153 134Z" fill="url(#light)"/>
    <path d="M174 512 Q300 524 426 512 M176 522 Q300 534 427 522 M176 532 Q300 544 427 532 M174 542 Q300 554 426 542" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="2"/>
    <path d="M76 465 L140 480 M78 473 L139 488 M80 481 L138 496 M83 489 L135 504 M460 480 L524 465 M461 488 L522 473 M462 496 L520 481 M465 504 L517 489" fill="none" stroke="#000" stroke-opacity=".13" stroke-width="2"/>
    <path d="M164 162 Q176 202 178 300 M436 162 Q424 202 422 300 M204 317 Q192 382 198 456 M396 317 Q408 382 402 456" fill="none" stroke="#000" stroke-opacity=".09" stroke-width="3"/>
    ${q?`<path d="M220 100 L233 58 Q300 42 367 58 L380 100 Q342 136 300 149 Q258 136 220 100" fill="${COLORS[color]}" stroke="#000" stroke-opacity=".22" stroke-width="2"/>${back?'':`<path d="M300 78 V226" stroke="#b1a996" stroke-width="3"/><path d="M296 82 V226 M304 82 V226" stroke="#000" stroke-opacity=".35" stroke-width="1"/><rect x="296" y="129" width="8" height="18" rx="2" fill="#adac9d"/>`}`:
      hood?`<path d="M220 100 Q199 43 244 21 Q300 -5 356 21 Q401 43 380 100 Q344 138 300 145 Q256 138 220 100" fill="${COLORS[color]}" stroke="#000" stroke-opacity=".23" stroke-width="2"/>${back?'':`<path d="M248 53 Q300 81 352 53 L325 130 Q300 145 275 130Z" fill="#000" fill-opacity=".12"/><path d="M273 135 L260 240 M327 135 L340 240" stroke="${g.id==='D'?'#f4f3ec':'#827d72'}" stroke-width="3"/>`}`:
      `<path d="M220 100 Q300 188 380 100 M227 94 Q300 172 373 94" fill="none" stroke="#000" stroke-opacity=".17" stroke-width="6"/>`}
    ${!back&&zip?'<path d="M300 143 V548" stroke="#a09b8e" stroke-width="3"/>':''}
    ${!back&&hood?`<path d="M240 357 L360 357 L389 433 L387 473 Q300 489 213 473 L211 433Z" fill="none" stroke="#000" stroke-opacity=".16" stroke-width="2"/>`:''}
  </svg>`;
}
function overlay(g, hasPhoto, nameOnly = false, options = {}) {
  const placement = options.placement || (nameOnly ? state.namePlacement : state.placement);
  const visualPlacement = isBackPlacement(placement) ? 'Back' : placement.replace(' wrist', ' sleeve');
  const back = isBackPlacement(placement), sleeve = visualPlacement.includes('sleeve');
  if ((back ? 'back' : 'front') !== state.face) return '';
  const coords = hasPhoto ? (g.id === 'F' ? {'Left chest':[63,38,10], 'Right chest':[37,38,10], Back:[50,38,30], 'Left sleeve':[78,83,5], 'Right sleeve':[22,83,5]} : {'Left chest':[63,39,7], 'Right chest':[37,39,7], 'Center front':[50,43,17], Back:[50,43,30], 'Left sleeve':[78,84,5], 'Right sleeve':[22,84,5]}) : {'Left chest':[61,37,10], 'Right chest':[39,37,10], 'Center front':[50,39,21], Back:[50,40,34], 'Left sleeve':[82,76,6], 'Right sleeve':[18,76,6]};
  const customCoords = { 'Left thigh':[61,42,12], 'Right thigh':[39,42,12], 'Outside':[39,35,9], 'Inside':[69,35,9], 'Front panel':[50,48,25] };
  const [x,y,w] = customCoords[visualPlacement] || coords[visualPlacement] || coords['Left chest'];
  const font = FONTS.find(f=>f.id===state.font)?.family || 'Lato';
  const logo = options.logo ?? state.logo;
  const name = options.name ?? ((nameOnly || state.namePlacement === 'With logo') ? state.name.trim() : '');
  const hasLogo = !nameOnly && logo !== 'none' && state.step >= 2;
  return state.step < 2 ? '' : `<div class="artwork ${sleeve?'sleeve-art':''} ${options.monochrome?'monochrome-art':''}" style="left:${x}%;top:${y}%;width:${w}%;--name-color:${ART_COLORS[state.artColor]};--name-font:'${font}';--letter-size:${(w * 1.3 / Math.max(6,name.length)).toFixed(3)}cqw" aria-hidden="true">${hasLogo?`<img src="${logoAsset(logo)}" alt="" class="logo-overlay">`:''}${name?`<span class="name-overlay">${esc(name)}</span>`:''}</div>`;
}
function preview() {
  const g = garment(); if (!g) return '';
  const reference = !state.color, referenceColor = photoFor(g,'Black') ? 'Black' : g.photoColor || 'Catalog reference';
  const referencePhoto = photoFor(g,referenceColor) || photoFor(g,'Black');
  const back = state.face === 'back', photo = reference ? referencePhoto : photoFor(g,state.color,back?'back':'front');
  // Photos are shown without recoloring. If the exact shade/view is absent,
  // the labeled code-drawn study carries color and placement instead.
  const usePhoto = reference ? !!referencePhoto : !!photo && state.view !== 'sketch';
  const source = usePhoto ? photo : `assets/garment-${g.id}.png`;
  return `<aside class="preview-panel" aria-label="Garment preview">
    <div class="preview-top"><span>${g.model}</span><button class="text-button" data-action="preview-large" aria-label="Enlarge garment preview">Enlarge ↗</button><span class="preview-label">${reference?'Reference photo':'Illustrative preview'}</span></div>
    <div class="preview-stage ${usePhoto?'photo-stage':''}" id="preview-stage">
      ${usePhoto?`<img class="flat-photo" src="${source}" alt="${reference?`${esc(g.model)} catalog reference photo`:`Actual ${esc(state.color)} ${esc(g.model)} ${back?'back':'front'} product photo`}" data-photo>`:svgGarment(g,state.color,back)}${reference?'':state.designLayout==='chest-back'?(back?overlay(g,usePhoto,false,{placement:'Large back',logo:'G',name:'',monochrome:true}):overlay(g,usePhoto,false,{monochrome:true})):overlay(g,usePhoto)}${!reference&&state.designLayout!=='chest-back'&&state.name.trim()&&state.namePlacement!=='With logo'?overlay(g,usePhoto,true):''}
    </div>
    <div class="preview-caption"><strong>${reference?(referenceColor==='Catalog reference'?'Catalog reference':`Shown: ${referenceColor}`):`${state.color} · ${state.size||'Choose a size'}`}</strong><span>${reference?'Choose a listed color':state.step>=2?`${back?'Back view':'Front view'} · ${state.finish||'Choose a finish'}`:g.weight}</span></div>
    <div class="preview-switch">${state.step>=2&&selectedRow(state)?.placements.some(isBackPlacement)?`${btn('face','front','Front',state.face==='front')}${btn('face','back','Back',state.face==='back')}`:''}${photo&&!reference?`${btn('view','study','Photo',state.view!=='sketch')}${btn('view','sketch','Study',state.view==='sketch')}`:''}</div>
    <p class="proof-note">${reference?'Choose a listed color to preview your selection.':`${usePhoto?'Real product photo with an artwork overlay.':'Color and placement study; fabric and shade will vary.'}<br>Nat’s ${state.provider==='Printful'?'Printful':'Printify'} screenshot confirms the final design.`}</p>
    ${!usePhoto?(referencePhoto?`<details class="reference-photo"><summary>See the original catalog photo</summary><img src="${referencePhoto}" alt="${g.model} catalog reference"><span>${referenceColor==='Catalog reference'?'Color in reference photo is not confirmed.':`Reference shade: ${referenceColor}`}</span></details>`:`<details class="reference-photo"><summary>See the original garment photo</summary><img src="assets/garment-${g.id}.png" alt="${g.model} original guide reference"><span>Reference shade: ${g.photoColor}</span></details>`):''}
  </aside>`;
}
function sizeScreen() {
  const g = garment(), colors = availableColors(g.id), sizes = availableSizes({...state, finish: ''});
  return `<div class="config-layout"><div class="controls"><div class="selection-label"><span>${g.id} · ${g.model}</span><button class="text-button" ${attr('step',0)}>Change style</button></div>
    <fieldset><legend>${g.printedColor?'Printed base color':'Garment color'} <span class="optional">Neutral palette</span></legend><div class="color-options">${colors.map(c=>btn('color',c,`${colorSwatch(c)}<span>${c}</span>`,state.color===c)).join('')}</div>
    ${g.printedColor?'<p class="field-note">Your chosen base color is printed onto white fabric together with the artwork. Seams and folds may show some white.</p>':''}
    ${g.catalogColors?`<p class="field-note">Printify lists ${g.catalogColors.length} colors. Black matches your requested palette; the other catalog shades are ${g.catalogColors.filter(c=>c!=='Black').join(', ')}.</p>`:''}
    ${g.id==='D'?'<p class="field-note">Natural, Vintage White and Tan are the provider’s shade names. Availability varies by size.</p>':''}
    ${!colors.length?`<p class="callout">${PENDING[g.id]||'Provider check pending.'}</p>`:''}</fieldset>
    <fieldset ${!state.color?'disabled':''}><legend>Size</legend><div class="size-options">${SIZE_ORDER.filter(s=>sizes.includes(s)).map(s=>btn('size',s,s,state.size===s)).join('')}</div>
    <p class="field-note">${!state.color?'Choose a color to see its sizes.':'Finish choices will match this exact color and size.'}</p><a class="source-link" href="${g.source}" target="_blank" rel="noopener">Open ${g.model} size guide ↗</a></fieldset>
    <fieldset><legend>Quantity</legend><div class="quantity"><button class="icon-button" aria-label="Decrease quantity" data-action="quantity" data-value="-1" ${state.quantity===1?'disabled':''}>−</button><output aria-label="Quantity">${state.quantity}</output><button class="icon-button" aria-label="Increase quantity" data-action="quantity" data-value="1" ${state.quantity===20?'disabled':''}>+</button></div>${priceBlock()}</fieldset>
    <div class="actions"><button class="secondary" ${attr('step',0)}>Back</button><button class="primary" data-action="next" ${!state.color||!state.size?'disabled':''}>Choose finish & artwork <span aria-hidden="true">→</span></button></div>
    <p class="snapshot-note">Catalog checked ${SNAPSHOT}. Nat rechecks stock before ordering.</p></div>${preview()}</div>`;
}
function finishOptions() {
  const possible = availableFinishes(state);
  return `<fieldset><legend>Finish <button class="text-button" data-action="finish-guide" type="button">What’s the difference?</button></legend>
    <div class="finish-options">${possible.map(f=>btn('finish',f,`<strong>${FINISHES[f].name}</strong><span>${FINISHES[f].short}</span>`,state.finish===f)).join('')}</div>
    ${state.garment==='F'?'<p class="field-note">This thick quarter-zip is offered with DTF. Embroidery would need a different garment.</p>':''}
    ${state.garment==='B'?'<p class="field-note">Dust is the cream-beige shade. Printful offers small chest embroidery; Printify offers DTG/DTF on the back or sleeves for this exact blank.</p>':''}
    ${state.garment==='G'?'<p class="field-note">This 13.5 oz Bone crewneck has DTG and DTF. The checked provider offers front, back and sleeve print areas, with no embroidery or left-chest option.</p>':''}
    ${state.garment==='H'?`<p class="field-note">Fulfill Engine offers printing. On Black in S–3XL, Printful offers chest and large-back embroidery, including the black-on-black layout.</p>`:''}
    ${state.finish?`<div class="finish-detail"><p><strong>Good for</strong> ${FINISHES[state.finish].good}</p><p><strong>Consider</strong> ${FINISHES[state.finish].tradeoff}</p><p><strong>Durability</strong> ${FINISHES[state.finish].life}</p><p class="estimate-note">Method guidance; garment/provider performance is not guaranteed.</p></div>`:''}
    <p class="field-note">Only finishes checked for ${state.color} / ${state.size} are shown.</p></fieldset>`;
}
function customizeScreen() {
  const g=garment(), row=selectedRow(state), embroidery=state.finish==='Embroidery';
  const providers=[...new Set(rowsFor(state).filter(r=>r.finish===state.finish).map(r=>r.provider))];
  const chestBack=embroidery&&row?.placements.includes('Left chest')&&row.placements.some(isBackPlacement);
  return `<div class="config-layout"><div class="controls"><div class="selection-label"><span>${g.model} · ${state.color} · ${state.size}</span><button class="text-button" ${attr('step',1)}>Edit</button></div>${finishOptions()}
    ${row?`<div class="provider-label">Provider: <strong>${row.provider}</strong>${providers.length>1?`<select data-field="provider" aria-label="Print provider">${providers.map(p=>`<option ${state.provider===p?'selected':''}>${p}</option>`).join('')}</select>`:''}</div>${priceBlock()}`:''}
    <fieldset ${!row?'disabled':''}><legend>HIVE artwork</legend><div class="logo-options">${LOGOS.map(l=>btn('logo',l.id,`<img src="assets/logo-${l.id}.png" alt=""><span>${l.id} · ${l.name}</span>`,state.logo===l.id,embroidery&&l.id!=='C'?'disabled title="Detailed artwork needs embroidery adaptation and proof"':'')).join('')}${btn('logo','none','<span class="name-only">Aa</span><span>Name only</span>',state.logo==='none')}</div>
    ${embroidery?'<p class="field-note">Bee only is the simple starting point for embroidery. Detailed seals need adapted artwork and Nat’s proof.</p>':''}
    ${state.color==='Black'&&state.logo==='C'?'<p class="field-note">This bee has dark outlines. Nat will confirm contrast on Black in the final proof.</p>':''}</fieldset>
    ${chestBack?`<fieldset><legend>Decoration layout</legend><div class="coverage-options">${btn('layout','single','<strong>One placement</strong><span>Use one artwork area</span>',state.designLayout==='single')}${btn('layout','chest-back','<strong>Black-on-black chest + back</strong><span>Bee and optional name at left chest; large HIVE seal on back</span>',state.designLayout==='chest-back')}</div><p class="field-note">Both designs use black thread. Printful digitizes each file and Nat confirms both placements in the final screenshot.</p></fieldset>`:''}
    <fieldset ${!row?'disabled':''}><legend>Placement</legend><div class="placement-options">${(row?.placements||[]).map(p=>btn('placement',p,p,state.placement===p,state.designLayout==='chest-back'?'disabled':'')).join('')}</div><p class="field-note">Left and right mean the wearer’s left and right. Placements stay within the provider’s decoration area.</p></fieldset>
    <fieldset ${!row?'disabled':''}><legend>Your name <span class="optional">optional</span></legend><label for="name">Spelling exactly as you want it</label><input id="name" data-field="name" type="text" maxlength="24" value="${esc(state.name)}" autocomplete="off" placeholder="Your name"><span class="input-help">Up to 24 characters</span>
      <div class="font-options" aria-label="Name font">${FONTS.map(f=>btn('font',f.id,`<span style="font-family:'${f.family}'" class="font-sample">${esc(state.name.trim()||'Your name')}</span><span>${f.name}</span>`,state.font===f.id)).join('')}</div>
      <div class="color-options artwork-colors" aria-label="Name color">${Object.entries(ART_COLORS).map(([n,c])=>btn('artColor',n,`${colorSwatch(n,c)}<span>${n}</span>`,state.artColor===n)).join('')}</div>
      <p class="field-note">${state.designLayout==='chest-back'?'The chest artwork, name and back seal use black thread.':'Name color applies to your text. Original logo colors stay as drawn.'}${embroidery?' Nat confirms the closest available thread shade and digitized lettering.':''}</p>
      ${state.designLayout==='single'&&state.logo!=='none'&&row?.placements.length>1?`<label for="name-placement" class="name-placement-label">Name placement</label><select id="name-placement" data-field="namePlacement"><option value="With logo" ${state.namePlacement==='With logo'?'selected':''}>With logo</option>${row.placements.filter(p=>p!==state.placement).map(p=>`<option ${state.namePlacement===p?'selected':''}>${p}</option>`).join('')}</select><p class="field-note">A second placement may add to production cost. Nat confirms the complete design.</p>`:''}</fieldset>
    <div class="actions"><button class="secondary" ${attr('step',1)}>Back</button><button class="primary" data-action="next" ${!canReview(state)?'disabled':''}>Review my picks <span aria-hidden="true">→</span></button></div>
  </div>${preview()}</div>`;
}
function reviewScreen() {
  const g=garment(), l=LOGOS.find(l=>l.id===state.logo);
  return `<div class="config-layout review-layout"><div class="controls"><div class="review-card"><div class="review-card-top"><span>Your selections</span><button class="text-button" ${attr('step',2)}>Edit artwork</button></div>
    <dl class="review-facts"><div><dt>Garment</dt><dd>${g.name}<span>${g.id} · ${g.model}</span></dd></div><div><dt>Color / size</dt><dd>${state.color} / ${state.size}<button class="text-button" ${attr('step',1)}>Edit</button></dd></div><div><dt>Quantity</dt><dd>${state.quantity}</dd></div><div><dt>Finish</dt><dd>${state.finish}<span>${state.provider}</span></dd></div><div><dt>Artwork</dt><dd>${state.designLayout==='chest-back'?'Black-on-black chest + large back':l?`${l.id} · ${l.name}`:'Name only'}<span>${state.designLayout==='chest-back'?'C · Bee only at left chest / G · HIVE seal at large back':state.placement}</span></dd></div><div><dt>Name</dt><dd>${esc(state.name.trim()||'None')}${state.name.trim()?`<span>${FONTS.find(f=>f.id===state.font)?.name} · ${state.artColor}</span><span>${state.namePlacement==='With logo'?state.placement:state.namePlacement}</span>`:''}</dd></div></dl>${priceBlock({review:true})}</div>
    <fieldset><legend>Order coverage</legend><div class="coverage-options">${btn('member','OG HIVE',`<strong>OG HIVE</strong><span>${g.newSwag?'Coverage to confirm with Nat':'Covered by Honey Pot dues'}</span>`,state.member==='OG HIVE')}${btn('member','Other HIVE','<strong>Other HIVE</strong><span>At cost · Nat confirms the amount</span>',state.member==='Other HIVE')}</div></fieldset>
    <div class="next-steps"><strong>Nat takes it from here</strong><ol><li>Share your selections with Nat through your usual channel.</li><li>Nat rechecks stock and prepares your ${state.provider==='Printful'?'Printful':'Printify'} design.</li><li>Confirm her screenshot before the order is placed.</li></ol></div>
    <button class="primary save-button" data-action="save">${saved?'Saved on this device ✓':'Save picks on this device'}</button><div class="handoff-actions"><button class="secondary" data-action="download">Download selections</button><button class="text-button" data-action="show-text">View copyable text</button></div>
    <div class="copyable" hidden id="copyable"><label for="selection-text">Select this text to share with Nat</label><textarea id="selection-text" readonly rows="14">${esc(selectionText(state))}</textarea></div>
    <p class="snapshot-note">This review stays on your device. Catalog checked ${SNAPSHOT}; final stock, shade and placement need Nat’s provider proof.</p></div>${preview()}</div>`;
}
function render() {
  steps.innerHTML=stepNames.map((s,i)=>`<button class="step ${state.step===i?'active':''} ${i<state.step?'complete':''}" ${attr('step',i)} ${i>maxStep()?'disabled':''} ${state.step===i?'aria-current="step"':''}><span class="step-number">${i<state.step?'✓':i+1}</span><span>${s}</span></button>`).join('');
  app.innerHTML=`<div class="page-heading"><h1 id="screen-title" tabindex="-1">${titles[state.step]}</h1>${state.step===0?'':`<button class="text-button" data-action="start-over">Start again</button>`}</div>${[styleScreen,sizeScreen,customizeScreen,reviewScreen][state.step]()}`;
  app.querySelectorAll('[data-photo]').forEach(img=>img.addEventListener('error',()=>{if(state.view!=='sketch'){state.view='sketch';render();say('Photo unavailable. Showing the color and placement study.');}},{once:true}));
}
document.addEventListener('click',async e=>{
  const target=e.target.closest('[data-action]'); if(!target||target.disabled)return;
  const {action,value}=target.dataset;
  if(action==='garment') {const colors=availableColors(value);update({garment:value,color:colors.length===1?colors[0]:'',size:'',finish:'',provider:'',placement:'Left chest',face:'front',step:1},`${GARMENTS.find(g=>g.id===value).model} selected.`);window.scrollTo({top:0,behavior:'instant'});document.querySelector('#screen-title').focus();}
  else if(action==='step') go(Number(value));
  else if(action==='next') go(state.step+1);
  else if(action==='filter') {filter=value;render();}
  else if(action==='color') update({color:value},`${value} selected. Sizes updated.`);
  else if(action==='size') update({size:value},`${value} selected.`);
  else if(action==='quantity') update({quantity:state.quantity+Number(value)},`Quantity: ${state.quantity+Number(value)}.`);
  else if(action==='placement') update({placement:value,face:isBackPlacement(value)?'back':'front'});
  else if(action==='layout') update({designLayout:value,face:'front'},value==='chest-back'?'Black-on-black chest and back selected.':'');
  else if(['finish','logo','font','artColor','member','view','face'].includes(action)) update({[action]:value},action==='finish'?`${value} selected. Artwork and placement options updated.`:'');
  else if(action==='finish-guide') document.querySelector('#finish-dialog').showModal();
  else if(action==='preview-large') {const stage=document.querySelector('#preview-stage').cloneNode(true);stage.removeAttribute('id');document.querySelector('#enlarged-preview').replaceChildren(stage);document.querySelector('#preview-dialog').showModal();}
  else if(action==='start-over'){state=initialState();saved=false;try{localStorage.removeItem(DRAFT_KEY);}catch{}render();say('Ready for a new selection.');}
  else if(action==='save') {
    if(!canReview(state))return;
    target.disabled=true;target.textContent='Saving…';
    await new Promise(requestAnimationFrame);
    try{localStorage.setItem(DRAFT_KEY,JSON.stringify(state));if(!localStorage.getItem(DRAFT_KEY))throw Error('Storage unavailable');saved=true;render();say('Saved on this device. Share your selections with Nat when you’re ready.');}
    catch{render();say('This browser couldn’t save locally. Download your selections to keep them.');}
  } else if(action==='download') {
    if(!canReview(state))return;
    const url=URL.createObjectURL(new Blob([selectionText(state)],{type:'text/plain;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='HIVE-clothing-selections.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('Selections downloaded. Share them with Nat through your usual channel.');
  } else if(action==='show-text'){document.querySelector('#copyable').hidden=false;document.querySelector('#selection-text').focus();document.querySelector('#selection-text').select();}
});
document.addEventListener('input',e=>{
  const key=e.target.dataset.field;if(key!=='name')return;
  state.name=e.target.value.slice(0,24);saved=false;
  document.querySelector('.preview-panel').outerHTML=preview();
  document.querySelectorAll('.font-sample').forEach(el=>el.textContent=state.name.trim()||'Your name');
  const next=document.querySelector('[data-action="next"]');if(next)next.disabled=!canReview(state);
});
document.addEventListener('change',e=>{if(e.target.dataset.field==='provider')update({provider:e.target.value});else if(e.target.dataset.field==='namePlacement')update({namePlacement:e.target.value,face:isBackPlacement(e.target.value)?'back':'front'},'Name placement updated.');});
document.querySelector('#finish-guide').innerHTML=Object.entries(FINISHES).map(([k,f])=>`<article class="finish-guide-card"><h3>${k}<span>${f.short}</span></h3><dl><div><dt>Good for</dt><dd>${f.good}</dd></div><div><dt>Consider</dt><dd>${f.tradeoff}</dd></div><div><dt>Durability</dt><dd>${f.life}</dd></div></dl></article>`).join('')+`<p class="guide-footnote">Wash counts are general method estimates, rather than garment/provider wash tests or guarantees.</p><p class="guide-footnote">Follow the garment label. Wash cool and inside out; avoid bleach and ironing the design. Air drying is gentlest.</p><p class="guide-footnote">Puff is editor-made raised transfer text. Exact neutral variants and provider font choices still need verification before it becomes selectable.</p><p class="guide-footnote"><a href="https://printify.com/blog/dtf-vs-dtg-printing/" target="_blank" rel="noopener">DTG / DTF guide</a> · <a href="https://printify.com/blog/embroidery-vs-screen-printing/" target="_blank" rel="noopener">Embroidery guide</a> · <a href="https://printify.com/guide/specialty-prints/" target="_blank" rel="noopener">Puff guide</a></p>`;
document.querySelector('#close-dialog').onclick=()=>document.querySelector('#finish-dialog').close();
document.querySelector('#close-preview').onclick=()=>document.querySelector('#preview-dialog').close();
const topButton=document.querySelector('#to-top');
window.addEventListener('scroll',()=>topButton.hidden=window.scrollY<500,{passive:true});
topButton.onclick=()=>window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
render();
