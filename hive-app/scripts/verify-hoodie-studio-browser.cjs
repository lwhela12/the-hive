// Uses an existing local Playwright installation and a fresh headless context.
// It never attaches to a desktop browser, shares its profile, or uses clipboard.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require(process.env.HIVE_PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.HIVE_STUDIO_URL || 'http://127.0.0.1:8766';
const output = process.env.HIVE_STUDIO_EVIDENCE || '/tmp/hive-hoodie-studio-evidence';
const widths = [[1440,1000],[1024,768],[768,1024],[640,800],[560,844],[390,844],[320,640],[844,390]];
let browser;
const click = (page,action,value) => page.locator(`[data-action="${action}"]${value===undefined?'':`[data-value="${value}"]`}`).first().click();
async function capture(page,name){await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});await page.screenshot({path:path.join(output,name+'-viewport.png')});}
async function overflow(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth+1),false,`Horizontal overflow at ${page.viewportSize().width}`);}
async function choose(page,model,color,size,shot){await page.getByRole('button',{name:`Choose ${model}`,exact:true}).click();await click(page,'color',color);await click(page,'size',size);if(shot)await capture(page,shot);await click(page,'next');}
(async()=>{
 await fs.mkdir(output,{recursive:true});
 browser=await chromium.launch({headless:true,...(process.env.HIVE_CHROMIUM_EXECUTABLE?{executablePath:process.env.HIVE_CHROMIUM_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 const page=await context.newPage();const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.goto(url);assert.equal(await page.locator('.garment-card').count(),6);
 for(const model of ['Gildan SF008','Hanes OG900','Gildan 18500','Bella+Canvas 3719','Gildan 18600','Gildan 18000']){
  await page.getByRole('button',{name:`Choose ${model}`,exact:true}).click();
  assert.equal(await page.locator('.garment-study').count(),0,'An unchosen color must never become an invented garment shade');
  if(model==='Hanes OG900'){
   assert.equal(await page.locator('[data-action="color"][data-value="Black"]').getAttribute('aria-pressed'),'true');
   assert.match(await page.locator('.flat-photo').getAttribute('src'),/garment-F-Black-front/);
   assert.match(await page.locator('.controls').innerText(),/Printify lists 4 colors/);
   for(const [w,h] of [[1440,1000],[390,844],[844,390]]){await page.setViewportSize({width:w,height:h});await overflow(page);await capture(page,`hanes-initial-${w}x${h}`);}
   await page.setViewportSize({width:1440,height:1000});
  }else{
   assert.equal(await page.locator('.preview-label').innerText(),'Reference photo');
   assert.match(await page.locator('.preview-caption').innerText(),/Shown:/);
   assert.equal(await page.locator('[data-action="view"][data-value="sketch"]').count(),0);
  }
  await click(page,'step','0');
 }
 assert.deepEqual(await page.locator('.garment-card h2').allTextContents().then(x=>x.slice(0,2)),['Midweight quarter-zip','Heavyweight quarter-zip']);
 await capture(page,'desktop-comparison');
 await click(page,'filter','quarter');assert.equal(await page.locator('.garment-card').count(),2);await capture(page,'desktop-quarter-zips');
 await choose(page,'Hanes OG900','Black','L','desktop-color-size');assert.equal(await page.locator('[data-action="finish"]').count(),1);
 await click(page,'finish','DTF');await click(page,'logo','E');await page.locator('#name').fill('Nat');await click(page,'font','F3');
 assert.equal(await page.locator('.name-overlay').textContent(),'Nat');assert.match(await page.locator('.flat-photo').getAttribute('src'),/garment-F-Black/);
 await page.locator('#name-placement').selectOption('Back');assert.match(await page.locator('.flat-photo').getAttribute('src'),/back/);assert.equal(await page.locator('.logo-overlay').count(),0);assert.equal(await page.locator('.name-overlay').textContent(),'Nat');
 await click(page,'face','front');assert.equal(await page.locator('.logo-overlay').count(),1);assert.equal(await page.locator('.name-overlay').count(),0);
 await page.locator('#name-placement').selectOption('With logo');
 await capture(page,'desktop-customize');
 for(const placement of ['Right chest','Back','Left sleeve','Right sleeve','Left chest']){await click(page,'placement',placement);assert.ok(await page.locator('.artwork').count());}
 await click(page,'preview-large');assert.equal(await page.locator('#preview-dialog').evaluate(el=>el.open),true);await page.keyboard.press('Escape');
 await click(page,'finish-guide');assert.equal(await page.locator('#finish-dialog').evaluate(el=>el.open),true);assert.match(await page.locator('#finish-guide').innerText(),/50–100/);await page.keyboard.press('Escape');
 await click(page,'next');assert.match(await page.locator('.review-card').innerText(),/Nat/);
 await click(page,'member','Other HIVE');await capture(page,'desktop-review');
 await click(page,'save');await page.waitForFunction(()=>document.querySelector('[data-action="save"]')?.textContent.includes('Saved on this device'));assert.match(await page.locator('#notice').innerText(),/Saved on this device/);
 await page.reload();assert.match(await page.locator('h1').innerText(),/Review your picks/);assert.equal(await page.locator('[data-action="member"][data-value="Other HIVE"]').getAttribute('aria-pressed'),'true');
 const downloadEvent=page.waitForEvent('download');await click(page,'download');const download=await downloadEvent;const file=path.join(output,'verified-selection-download.txt');await download.saveAs(file);
 const text=await fs.readFile(file,'utf8');assert.match(text,/Hanes OG900/);assert.match(text,/Courgette/);assert.match(text,/At cost/);assert.match(text,/has not submitted/);
 for(const [w,h] of widths){await page.setViewportSize({width:w,height:h});await overflow(page);await capture(page,`review-${w}x${h}`);}
 await page.setViewportSize({width:390,height:844});await click(page,'step','1');await capture(page,'phone-color-size');await overflow(page);await click(page,'step','2');await page.locator('#name').fill('Alexandra Montgomery');await click(page,'font','F1');await capture(page,'phone-customize');await overflow(page);
 const nameBounds=await page.locator('.name-overlay').boundingBox(),stageBounds=await page.locator('#preview-stage').boundingBox();assert.ok(nameBounds.x>=stageBounds.x&&nameBounds.x+nameBounds.width<=stageBounds.x+stageBounds.width);
 await click(page,'start-over');await choose(page,'Gildan 18000','White','5XL');assert.equal(await page.locator('[data-action="finish"][data-value="Embroidery"]').count(),0);await click(page,'finish','DTG');
 await click(page,'step','1');await click(page,'color','Sand');assert.equal(await page.locator('[data-action="size"][data-value="5XL"]').count(),0);assert.equal(await page.locator('[data-action="next"]').isDisabled(),true);
 await click(page,'size','3XL');await click(page,'next');await click(page,'finish','Embroidery');assert.equal(await page.locator('[data-action="placement"]').count(),1);assert.equal(await page.locator('[data-action="logo"][data-value="E"]').isDisabled(),true);
 await click(page,'logo','none');assert.equal(await page.locator('[data-action="next"]').isDisabled(),true);await page.locator('#name').fill('Taylor');assert.equal(await page.locator('[data-action="next"]').isDisabled(),false);
 await click(page,'step','0');await choose(page,'Bella+Canvas 3719','Tan','XL');await click(page,'finish','DTF');assert.match(await page.locator('.flat-photo').getAttribute('src'),/Tan/);await overflow(page);
 await click(page,'step','1');assert.equal(await page.locator('[data-action="size"][data-value="L"]').count(),0);await click(page,'color','Natural');assert.equal(await page.locator('[data-action="size"][data-value="XS"]').count(),0);
 for(const [w,h] of widths){await page.setViewportSize({width:w,height:h});await click(page,'step','0');await overflow(page);await capture(page,`comparison-${w}x${h}`);}
 await page.setViewportSize({width:844,height:390});await choose(page,'Gildan SF008','Sand','L','landscape-color-size');await click(page,'finish','DTG');await click(page,'logo','A');await capture(page,'landscape-customize');await overflow(page);
 assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.startsWith(url)||r.startsWith('blob:')), 'Prototype must only request its local assets');
 await fs.writeFile(path.join(output,'browser-results.json'),JSON.stringify({status:'passed',viewports:widths,jsErrors:errors,localOnly:true,checked:'Desktop and mobile selection, all Hanes placements, save/readback, download, name-only, missing sizes, embroidery constraints, dialogs, photo and study fallback.'},null,2));
 await browser.close();console.log('PASS: browser journeys, draft persistence, download, matrix boundaries, responsive viewports, local assets.');
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1;});
