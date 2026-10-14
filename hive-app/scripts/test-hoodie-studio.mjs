import test from 'node:test';
import assert from 'node:assert/strict';
import {GARMENTS, initialState, normalize, availableColors, availableSizes, availableFinishes, selectedRow, canReview, selectionText}
  from '../public/hoodie-studio/catalog.mjs';

const pick = patch => normalize({...initialState(), ...patch});
test('both quarter-zips reject embroidery, with only checked neutral variants', () => {
  assert.deepEqual(availableColors('F'), ['Black']);
  assert.deepEqual(availableFinishes(pick({garment:'F', color:'Black', size:'L'})), ['DTF']);
  assert.deepEqual(availableFinishes(pick({garment:'B', color:'Sand', size:'3XL'})), ['DTG']);
  assert.equal(canReview(pick({garment:'F',color:'Black',size:'L',finish:'Embroidery',provider:'Fulfill Engine'})),false);
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
