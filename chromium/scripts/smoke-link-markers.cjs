// Local fixture and isolated browser profile; never touches the user's browsing data.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
(async () => {
 const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
 try {
  const context=await browser.newContext({viewport:{width:1100,height:700}});
  const page=await context.newPage();
  const base='http://127.0.0.1:5173';
  await page.route('**/link-fixture',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"><style>body{font:16px system-ui;padding:32px;background:#f8fafc}main{display:flex;gap:24px}a{display:block;width:250px;color:#334155;text-decoration:none}.thumb{display:grid;place-items:center;height:145px;background:#dbeafe;border-radius:8px;font-size:36px}p{margin:12px 0}</style></head><body><h1>Recommended videos</h1><main><a id="saved" href="https://mirror.test/video/1?utm_source=rec"><div class="thumb">▶</div><p>Previously saved video</p></a><a id="new" href="https://mirror.test/video/2"><div class="thumb">▶</div><p>New video</p></a></main></body></html>`}));
  await page.goto(base+'/link-fixture');
  await page.evaluate(async()=>{
   const {readingLibrary:lib}=await import('/src/storage/library-instance.ts');
   await lib.saveSite({name:'Video site',description:'',endpoints:[{prefix:'https://video.test',enabled:true},{prefix:'https://mirror.test',enabled:true}],queryPolicy:{mode:'keep-all-except-ignored',ignoredParams:[]}});
   const collection=await lib.saveCollection({name:'Expired',parentId:null,color:'#dc2626'});
   await lib.savePage({url:'https://video.test/video/1',title:'Saved video',note:'',tags:[],collectionId:collection.id,readingState:'read'});
   window.messages=[]; window.listeners=new Set();
   window.chrome={runtime:{id:"fixture",sendMessage:async(message)=>{
    window.messages.push(message);
    return {enabled:true,matches:(await lib.recognizeLinks(message.urls)).map(m=>({...m,label:'Saved · '+(m.collectionName??'Uncategorized')}))};
   },onMessage:{addListener:f=>window.listeners.add(f),removeListener:f=>window.listeners.delete(f)}}};
  });
  const baseline=await page.locator('main').evaluate(el=>({html:el.outerHTML,rect:JSON.stringify(el.getBoundingClientRect().toJSON())}));
  const script=path.resolve(__dirname,'../dist/assets/link-markers.js');
  await page.addScriptTag({path:script});
  await page.locator('#pathmark-link-markers .mark').waitFor();
  if(await page.locator('#pathmark-link-markers .mark').count()!==1)throw Error('Expected only saved link to be marked');
  const after=await page.locator('main').evaluate(el=>({html:el.outerHTML,rect:JSON.stringify(el.getBoundingClientRect().toJSON())}));
  if(JSON.stringify(baseline)!==JSON.stringify(after))throw Error('Original DOM or layout changed');
  await page.locator('#saved').hover();
  await page.locator('#pathmark-link-markers .tip').waitFor({state:'visible'});
  await page.screenshot({path:'/tmp/pathmark-link-markers.png'});
  await page.evaluate(()=>{
   document.querySelector('#new').href='https://video.test/video/1';
   const link=document.createElement('a');link.id='dynamic';link.href='https://video.test/video/1';link.textContent='Dynamically loaded saved video';document.body.append(link);
  });
  await page.waitForFunction(()=>document.querySelector('#pathmark-link-markers').shadowRoot.querySelectorAll('.mark').length===3);
  await page.addScriptTag({path:script});
  if(await page.locator('#pathmark-link-markers').count()!==1)throw Error('Duplicate injection');
  await page.evaluate(async()=>{
   const {readingLibrary:lib}=await import('/src/storage/library-instance.ts');
   await lib.deleteItem((await lib.listItems())[0].id);
   for(const listener of window.listeners)listener({type:'pathmark-link-refresh'});
  });
  await page.waitForFunction(()=>document.querySelector('#pathmark-link-markers').shadowRoot.querySelectorAll('.mark').length===0);
  await page.evaluate(()=>{for(const listener of window.listeners)listener({type:'pathmark-link-stop'})});
  await page.locator('#pathmark-link-markers').waitFor({state:'detached'});
  console.log('PASS: canonical aliases, color tooltip, untouched link DOM/layout, dynamic links, href changes, idempotent injection, refresh and disable cleanup');
 } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
