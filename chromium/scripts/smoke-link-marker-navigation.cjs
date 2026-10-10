// Controlled navigation/layout regression; browser messaging is stubbed here.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
 try{
  const page=await browser.newPage();
  await page.route('https://fixture.test/**',r=>r.fulfill({contentType:'text/html',body:'<style>body{padding:60px;font:18px system-ui}a{display:inline-block;margin-right:20px}</style><main><a id="saved" href="https://github.com/vercel-labs/skills">skills CLI</a><a id="self" href="#readme">README</a><a id="absolute" href="https://fixture.test/page#license">License</a><a id="external" href="https://github.com/vercel-labs/skills#readme">External section</a></main>'}));
  await page.goto('https://fixture.test/page');
  await page.evaluate(()=>{window.chrome={runtime:{id:"fixture",sendMessage:async({urls})=>({enabled:true,matches:urls.map(url=>({url,color:'#2563eb',label:'Saved'}))}),onMessage:{addListener(){},removeListener(){}}}}});
  await page.addScriptTag({path:path.resolve(__dirname,'../dist/assets/link-markers.js')});
  await page.locator('#pathmark-link-markers .mark').first().waitFor();
  const failures=[];
  if(await page.locator('#pathmark-link-markers .mark').count()!==2)failures.push('Same-page fragment links incorrectly marked');
  await page.evaluate(()=>document.querySelector('#pathmark-link-markers').remove());
  try{await page.locator('#pathmark-link-markers .mark').first().waitFor({timeout:1500})}catch{failures.push('Markers disappear when navigation removes overlay host')}
  if(failures.length)throw Error(failures.join('; '));
  const bounds=await page.evaluate(()=>({link:document.querySelector('#saved').getBoundingClientRect().toJSON(),mark:document.querySelector('#pathmark-link-markers').shadowRoot.querySelector('.mark').getBoundingClientRect().toJSON()}));
  if(bounds.mark.bottom>bounds.link.top)throw Error('Marker overlaps link text');
  await page.screenshot({path:'/tmp/pathmark-marker-navigation.png'});
  console.log('PASS: saved links remain visible after overlay removal; same-page anchors excluded; other-page fragments retained; marker above text');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
