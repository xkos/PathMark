// Real extension runtime in a disposable profile. The fixture pre-grants website
// access in a COPY of the manifest; OS permission-prompt appearance is not tested.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs/promises'), os=require('node:os'), path=require('node:path');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pathmark-global-'));
 let context;
 try {
  const extension=path.join(root,'extension');await fs.cp(path.resolve(__dirname,'../dist'),extension,{recursive:true});
  const manifestPath=path.join(extension,'manifest.json');const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
  manifest.host_permissions=['https://*/*','http://*/*'];await fs.writeFile(manifestPath,JSON.stringify(manifest));
  context=await chromium.launchPersistentContext(path.join(root,'profile'),{headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const id=new URL(worker.url()).host;
  await context.route(process.env.LIVE_GITHUB ? /^https:\/\/recommend.test\// : /^https:\/\/(github.com|recommend.test)\//,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><style>body{font:18px system-ui;padding:60px}a{color:#0969da}</style><main>Quick Start: the open <a id="saved" href="https://github.com/vercel-labs/skills">skills CLI</a> installs into agents. <a href="https://github.com/not-saved">Other</a></main>'}));
  const github=await context.newPage();await github.goto('https://github.com/addyosmani/agent-skills');
  const other=await context.newPage();await other.goto('https://recommend.test/videos');
  let settings=await context.newPage();await settings.goto(`chrome-extension://${id}/library.html`);
  await settings.getByRole('button',{name:'Settings & data',exact:true}).click();
  let toggle=settings.getByRole('checkbox',{name:'Mark saved links on webpages',exact:true});
  await toggle.waitFor();if(await toggle.isChecked())throw Error('Must default off');
  await worker.evaluate(async()=>{
   const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('jingji-reading-library');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
   const url='https://github.com/vercel-labs/skills',now=new Date().toISOString();
   await new Promise((resolve,reject)=>{const tx=db.transaction('items','readwrite');tx.objectStore('items').put({id:'saved',title:'Skills',note:'',tags:[],collectionId:null,siteId:null,resourceKey:null,canonicalKey:'v1:url:'+encodeURIComponent(url),originalUrl:url,lastResolvedUrl:null,readingState:'read',isArchived:false,createdAt:now,updatedAt:now,firstReadAt:null,readAt:null,lastOpenedAt:null,openCount:0});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
  });
  const original=await github.locator('main').evaluate(el=>el.outerHTML);
  const savedLink=github.getByRole('link',{name:'skills CLI',exact:true});
  await toggle.click();
  await settings.waitForFunction(()=>document.querySelector(".settings-link-marking input")?.checked);
  for(const page of [github,other]){await page.bringToFront();if(page===github)await savedLink.scrollIntoViewIfNeeded();await page.locator('#pathmark-link-markers .mark').waitFor({timeout:10000});if(await page.locator('#pathmark-link-markers .mark').count()!==1)throw Error('Expected one saved link');}
  if(!process.env.LIVE_GITHUB && await github.locator('main').evaluate(el=>el.outerHTML)!==original)throw Error('Page content changed');
  await other.reload();await other.locator('#pathmark-link-markers .mark').waitFor();
  await other.evaluate(()=>{const a=document.createElement('a');a.href='https://github.com/vercel-labs/skills';a.textContent='Dynamic recommendation';document.body.append(a)});
  await other.waitForFunction(()=>document.querySelector('#pathmark-link-markers')?.shadowRoot.querySelectorAll('.mark').length===2);
  await settings.reload();await settings.getByRole('button',{name:'Settings & data',exact:true}).click();
  await settings.waitForFunction(()=>!document.querySelector('.settings-link-marking input')?.disabled);
  if(!await toggle.isChecked())throw Error('Preference not persisted');
  await settings.screenshot({path:'/tmp/pathmark-global-settings.png'});
  await github.bringToFront();await savedLink.hover();await github.screenshot({path:'/tmp/pathmark-global-github.png'});
  await settings.bringToFront();await toggle.click();
  for(const page of [github,other])await page.locator('#pathmark-link-markers').waitFor({state:'detached'});
  await github.reload();if(await github.locator('#pathmark-link-markers').count())throw Error('Disabled script still injected');
  await settings.reload();
  await settings.getByRole('button',{name:'Settings & data',exact:true}).click();
  await settings.waitForFunction(()=>!document.querySelector('.settings-link-marking input')?.disabled);
  if(await toggle.isChecked())throw Error('Disable preference not persisted');
  await toggle.click();
  await settings.waitForFunction(()=>document.querySelector('.settings-link-marking input')?.checked && !document.querySelector('.settings-link-marking input')?.disabled);
  await worker.evaluate(()=>chrome.scripting.unregisterContentScripts({ids:['pathmark-links-global']}));
  await context.close();
  context=await chromium.launchPersistentContext(path.join(root,'profile'),{headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const recovered=await context.newPage();await recovered.goto(`chrome-extension://${id}/library.html`);
  await recovered.waitForFunction(async()=> (await chrome.scripting.getRegisteredContentScripts()).some(script=>script.id==='pathmark-links-global'));
  await recovered.getByRole('button',{name:'Settings & data',exact:true}).click();
  await recovered.waitForFunction(()=>document.querySelector('.settings-link-marking input')?.checked);
  console.log('PASS: dropped registration repaired after browser restart;  actual extension worker, IndexedDB, settings toggle, existing tabs across hosts, new navigation, dynamic links, persisted preference, untouched page content, disable cleanup');
 } finally {await context?.close();await fs.rm(root,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exit(1)});
