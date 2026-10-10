// Exercise the built settings UI with controllable browser API timing.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
 try{
  const page=await browser.newPage();
  await page.route('http://fixture.test/**',async route=>{
   const name=new URL(route.request().url()).pathname.slice(1)||'library.html';
   const type=name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'application/octet-stream';
   await route.fulfill({contentType:type,body:await fs.readFile(path.resolve(__dirname,'../dist',name))});
  });
  await page.addInitScript(()=>{
   window.registered=false;window.permission=false;window.slowRead=false;
   const data={};
   window.chrome={storage:{local:{get:async()=>({...data}),set:async values=>Object.assign(data,values)}},permissions:{request:()=>new Promise(r=>window.grant=()=>{window.permission=true;r(true)}),contains:async()=>window.permission,remove:async()=>{window.permission=false;return true},onRemoved:{addListener(){},removeListener(){}}},
    scripting:{getRegisteredContentScripts:()=>window.slowRead?new Promise(r=>{window.finishRead=()=>r([]);window.slowRead=false}):Promise.resolve(window.registered?[{id:'pathmark-links-global'}]:[]),registerContentScripts:async()=>{window.registered=true},unregisterContentScripts:async()=>{window.registered=false},executeScript:()=>new Promise(r=>window.finishInjection=r)},
    tabs:{query:async()=>[{id:1}],sendMessage:async()=>{}},runtime:{sendMessage:async()=>{}}};
  });
  await page.goto('http://fixture.test/library.html');
  await page.getByRole('button',{name:'Settings & data',exact:true}).click();
  const toggle=page.getByRole('checkbox',{name:'Mark saved links on webpages',exact:true});
  await page.waitForFunction(()=>!document.querySelector(".settings-link-marking input").disabled);
  await page.evaluate(()=>{window.slowRead=true;window.dispatchEvent(new Event("focus"))});
  await toggle.click();await page.waitForFunction(()=>typeof window.grant==='function');
  // Returning from the native prompt fires focus. Its stale read finishes last.
  await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.grant()});
  await page.waitForFunction(()=>window.registered&&typeof window.finishInjection==='function');
  await page.waitForFunction(()=>document.querySelector('.settings-link-marking input').checked,{},{timeout:2000});
  await page.evaluate(()=>window.finishRead?.());
  await page.waitForTimeout(100);
  if(!await toggle.isChecked()||!await toggle.isEnabled())throw Error('Stale focus read overwrote completed toggle');
  await toggle.click();await page.waitForFunction(()=>!document.querySelector('.settings-link-marking input').checked);
  console.log('PASS: approval updates checkbox before slow tab injection; stale focus response cannot overwrite state; disable remains usable');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
