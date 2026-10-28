import test from 'node:test';
import assert from 'node:assert/strict';
import {GARMENTS, PRICE_GUIDE, initialState, normalize, availableColors, availableSizes, availableFinishes, selectedRow, isBackPlacement, canReview, priceFor, selectionText}
  from '../public/hoodie-studio/catalog.mjs';

const pick = patch => normalize({...initialState(), ...patch});
test('quarter-zips expose only exact checked finishes and placements', () => {
  assert.deepEqual(availableColors('F'), ['Black']);
  assert.deepEqual(availableFinishes(pick({garment:'F', color:'Black', size:'L'})), ['DTF']);
  assert.deepEqual(availableColors('B'), ['Dust']);
  assert.deepEqual(availableFinishes(pick({garment:'B', color:'Dust', size:'3XL'})), ['DTG','DTF','Embroidery']);
  assert.equal(canReview(pick({garment:'F',color:'Black',size:'L',finish:'Embroidery',provider:'Fulfill Engine'})),false);
  assert.ok(canReview(pick({garment:'B',color:'Dust',size:'L',finish:'Embroidery',provider:'Printful',placement:'Left chest'})));
  const printful = pick({garment:'B',color:'Dust',size:'L',finish:'Embroidery',provider:'Printful'});
  assert.ok(!selectedRow(printful).placements.includes('Large back'));
  const staleBack = normalize({...printful,placement:'Large back',face:'back'});
  assert.equal(staleBack.placement,'Left chest');
  assert.equal(staleBack.face,'front');
  const printify = pick({garment:'B',color:'Dust',size:'L',finish:'DTF',provider:'Fulfill Engine · Printify'});
  assert.equal(printify.placement,'Back');
  assert.equal(canReview({...printify,placement:'Left chest'}),false);
});
test('back placement labels are recognized without exact-string coupling', () => {
  assert.equal(isBackPlacement('Back'),true);
  assert.equal(isBackPlacement('Large back'),true);
  assert.equal(isBackPlacement('Left chest'),false);
  const printable=pick({garment:'B',color:'Dust',size:'L',finish:'DTF',provider:'Fulfill Engine · Printify',placement:'Back',face:'back'});
  assert.equal(printable.face,'back');
});
test('Meg black-on-black layout keeps both Printful embroidery placements', () => {
  const meg=pick({garment:'H',color:'Black',size:'L',finish:'Embroidery',provider:'Printful',designLayout:'chest-back',name:'Meg',logo:'G',placement:'Large back',artColor:'White'});
  assert.deepEqual(availableFinishes(meg),['DTG','DTF','Embroidery']);
  assert.equal(meg.designLayout,'chest-back');
  assert.equal(meg.logo,'C');
  assert.equal(meg.placement,'Left chest');
  assert.equal(meg.artColor,'Black');
  assert.ok(selectedRow(meg).placements.includes('Large back'));
  assert.ok(canReview(meg));
  assert.match(selectionText(meg),/Black-on-black chest \+ large back/);
  assert.match(selectionText(meg),/Back artwork: G · HIVE seal/);
  assert.equal(priceFor(meg).from,27.49);
  assert.equal(priceFor({...meg,quantity:2}).subtotalFrom,54.98);
  assert.match(priceFor(meg).note,/second embroidery placement costs extra/i);
  assert.match(selectionText(meg),/Estimated item price: from \$27\.49 USD each/);
  assert.match(selectionText(meg),/Shipping, tax and any size, color, technique or placement charges are not included/);
});
test('catalog and exact-provider starting prices stay distinct', () => {
  assert.equal(PRICE_GUIDE.B.from,38.96);
  const printify=pick({garment:'B',color:'Dust',size:'L',finish:'DTF',provider:'Fulfill Engine · Printify',quantity:3});
  assert.equal(priceFor(printify).exactProvider,true);
  assert.equal(priceFor(printify).from,47.37);
  assert.equal(priceFor(printify).subtotalFrom,142.11);
  const catalogOnly=pick({garment:'C',color:'Black',size:'L',finish:'DTG',provider:'SwiftPOD'});
  assert.equal(priceFor(catalogOnly).exactProvider,false);
  assert.equal(priceFor(catalogOnly).from,28.63);
});
test('Hanes catalog colors are distinguished from the requested neutral palette', () => {
  assert.deepEqual(GARMENTS.find(g=>g.id==='F').catalogColors,['Black','Ash','Charcoal Heather','Athletic Navy']);
  assert.deepEqual(availableColors('F'),['Black']);
});
test('18500 White size 4XL cannot inherit another finish’s availability', () => {
  assert.deepEqual(availableFinishes(pick({garment:'A',color:'White',size:'4XL'})), ['DTG']);
  assert.ok(availableFinishes(pick({garment:'A',color:'White',size:'5XL'})).includes('Embroidery'));
});
test('18000 larger sizes remain DTG-only and Sand is capped at 3XL', () => {
  assert.deepEqual(availableFinishes(pick({garment:'E',color:'Black',size:'5XL'})), ['DTG']);
  assert.equal(pick({garment:'E',color:'Sand',size:'4XL'}).size,'');
  assert.ok(!availableSizes(pick({garment:'E',color:'White',finish:'Embroidery'})).includes('4XL'));
});
test('18600 White is selectable, but unstocked White 4XL/5XL are excluded', () => {
  assert.deepEqual(availableColors('C'), ['Black','White']);
  assert.equal(pick({garment:'C',color:'White',size:'4XL'}).size,'');
  assert.equal(pick({garment:'C',color:'Black',size:'5XL',finish:'Embroidery',provider:'Fulfill Engine'}).size,'5XL');
});
test('Bella+Canvas shade/size gaps cannot leak from Black', () => {
  assert.equal(pick({garment:'D',color:'Tan',size:'L'}).size,'');
  assert.equal(pick({garment:'D',color:'Natural',size:'XS'}).size,'');
  assert.deepEqual(availableSizes(pick({garment:'D',color:'Heather Dust'})), ['XS','S','XL']);
  assert.ok(!availableColors('D').includes('French Vanilla'));
  assert.ok(!availableColors('D').includes('Beige'));
});
test('changing garment removes an incompatible provider, finish and size', () => {
  const largeCrew=pick({garment:'E',color:'White',size:'5XL',finish:'DTG',provider:'Printify Choice',step:3});
  const hanes=normalize({...largeCrew,garment:'F'});
  assert.equal(hanes.color,'');assert.equal(hanes.size,'');assert.equal(hanes.finish,'');assert.equal(hanes.provider,'');
  assert.equal(hanes.step,1);assert.equal(canReview(hanes),false);
});
test('provider placements and simpler embroidery art constrain the review', () => {
  const embroidery=pick({garment:'A',color:'Sand',size:'L',finish:'Embroidery',provider:'Fulfill Engine',placement:'Back',logo:'E'});
  assert.equal(embroidery.logo,'C');assert.equal(embroidery.placement,'Left chest');assert.ok(canReview(embroidery));
  assert.equal(selectedRow({...embroidery,provider:'SwiftPOD'}),null);
  assert.equal(canReview({...embroidery,placement:'Back'}),false);
});
test('name-only requests require text and optional names stay exact', () => {
  const plain=pick({garment:'F',color:'Black',size:'L',finish:'DTF',provider:'Fulfill Engine',logo:'none'});
  assert.equal(canReview(plain),false);
  const named=pick({...plain,name:'Nat',font:'F3',quantity:2,member:'Other HIVE'});
  assert.ok(canReview(named));assert.match(selectionText(named),/Courgette/);assert.match(selectionText(named),/At cost/);
  assert.match(selectionText(named),/confirms the screenshot/);assert.match(selectionText(named),/Quantity: 2/);
});
test('saved local drafts are normalized instead of trusting tampered choices', () => {
  const invalid=pick({garment:'F',color:'Beige',size:'7XL',finish:'Puff',provider:'Invented',font:'unknown',quantity:-20,step:3});
  assert.equal(invalid.color,'');assert.equal(invalid.size,'');assert.equal(invalid.finish,'');assert.equal(invalid.quantity,1);
  assert.equal(invalid.step,1);assert.equal(canReview(invalid),false);
});
test('separate name placement stays within the exact provider’s areas', () => {
  const request=pick({garment:'F',color:'Black',size:'L',finish:'DTF',provider:'Fulfill Engine',name:'Nat',namePlacement:'Back'});
  assert.ok(canReview(request));assert.match(selectionText(request),/Name placement: Back/);
  assert.equal(canReview({...request,namePlacement:'Inner neck'}),false);
  const embroidery=normalize({...request,garment:'C',finish:'Embroidery',namePlacement:'Back'});
  assert.equal(embroidery.namePlacement,'With logo');
});

test('new swag reaches review with its own size and placement options',()=>{
 for(const [garment,size,finish,placement] of [['T','M','DTG','Left chest'],['P','6XL','AOP','Left thigh'],['S','XS','AOP','Right thigh'],['K','S/M','Embroidery','Outside'],['W','M/L','AOP','Front panel']]){
  const state=pick({garment,color:'Black',size,finish,provider:'Printful',placement,name:'Nat'});
  assert.ok(canReview(state),garment);assert.match(selectionText(state),new RegExp(size));
 }
 assert.equal(pick({garment:'K',color:'Black',size:'5XL'}).size,'');
 assert.equal(pick({garment:'W',color:'Black',size:'L/XL'}).size,'');
});
