const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require(process.env.HIVE_PLAYWRIGHT_MODULE||'playwright');
let browser;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const dir='/Users/thenateffect/.codex/workspaces/hive-swag-catalog/evidence';await fs.mkdir(dir,{recursive:true});
 const click=(key,value)=>page.locator(`[data-action="${key}"]${value?`[data-value="${value}"]`:''}`).first().click();
 for(const [id,kind,size,finish] of [['T','tee','M','DTG'],['P','pants','M','AOP'],['S','shorts','M','AOP'],['K','socks','S/M','Embroidery'],['W','bag','M/L','AOP']]){
  await page.goto('http://127.0.0.1:4176');await page.evaluate(()=>localStorage.clear());await page.reload();
  await click('filter',kind);assert.equal(await page.locator('.garment-card').count(),1);
  await click('garment',id);await click('color','Black');await click('size',size);await click('next');assert.equal(await page.locator(`[data-action="finish"][data-value="${finish}"]`).getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-action="logo"][data-value="C"]').isEnabled(),true);
  await page.locator('[data-field="name"]').fill('Nat');
  for(const [w,h] of [[1440,1000],[390,844],[844,390]]){
   await page.setViewportSize({width:w,height:h});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${kind} overflow ${w}`);
   await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0)});await page.screenshot({path:`${dir}/${kind}-${w}.png`,fullPage:true});await page.screenshot({path:`${dir}/${kind}-${w}-viewport.png`});
  }
  await click('next');assert.match(await page.locator('.review-facts').innerText(),new RegExp(size));
  await click('save');await page.getByRole('button',{name:'Saved on this device ✓',exact:true}).waitFor();await page.reload();assert.match(await page.locator('.review-facts').innerText(),/Nat/);
 }
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: all five new product configurations, three viewports, review, and saved reload.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
