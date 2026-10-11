// Disposable page: exercise the production bundle with real inline/block layout.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
  try {
    const page = await browser.newPage({viewport:{width:1000,height:700}});
    await page.route('https://fixture.test/**', route => route.fulfill({contentType:'text/html', body:`<!doctype html><style>
      body{margin:40px;font:16px/20px sans-serif;height:2000px} .thumbnail{width:276px;margin-top:120px}
      .image{height:155px;background:lightblue} h5{width:210px;font:inherit} .title{display:block}
      </style><div class="thumbnail"><a id="cover" href="/video-1.htm"><div class="image">Video cover</div></a>
      <h5><a id="title" href="/video-1.htm"><span class="title">Saved video title</span></a></h5></div>`}));
    await page.goto('https://fixture.test/search');
    const geometry = await page.evaluate(() => ['cover','title'].map(id => ({id, rects:[...document.getElementById(id).getClientRects()].map(r => ({width:r.width,height:r.height}))})));
    for (const {id,rects} of geometry) {
      if (rects[0].width !== 0 || !rects.some(r => r.width > 0 && r.height > 0)) throw Error('Fixture must reproduce empty leading rectangle: '+id+JSON.stringify(rects));
    }
    console.log('Reproduced empty leading rectangles:',JSON.stringify(geometry));
    const original = await page.locator('.thumbnail').evaluate(el => el.outerHTML);
    await page.evaluate(() => {window.chrome={runtime:{id:'fixture',sendMessage:async ({urls})=>({enabled:true,matches:urls.map(url=>({url,color:'#2563eb',label:'Saved'}))}),onMessage:{addListener(){},removeListener(){}}}};});
    await page.addScriptTag({path:path.resolve(__dirname,'../dist/assets/link-markers.js')});
    await page.waitForFunction(() => document.querySelector('#pathmark-link-markers')?.shadowRoot.querySelectorAll('.mark').length === 2, null, {timeout:3000});
    if (await page.locator('.thumbnail').evaluate(el => el.outerHTML) !== original) throw Error('Link DOM changed');
    await page.screenshot({path:'/tmp/pathmark-0.2.15-rects.png'});
    console.log('PASS: cover and title with zero-width leading fragments both marked; page DOM unchanged');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
