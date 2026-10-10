// Isolated development profile with a mocked extension action adapter.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
 try {
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:5173/library.html');
  await page.locator('.library-nav').waitFor();
  await page.evaluate(async()=>{
   localStorage.setItem('pathmark.language','zh-CN');
   const {readingLibrary:lib}=await import('/src/storage/library-instance.ts');
   await lib.saveCollection({name:'已失效',parentId:null});
   await lib.saveSite({name:'Forum',description:'',endpoints:[{prefix:'https://forum.test',enabled:true}],queryPolicy:{mode:'keep-all-except-ignored',ignoredParams:[]}});
  });
  await page.reload();
  await page.getByRole('button',{name:'收藏分类',exact:true}).click();
  await page.getByRole('button',{name:'插件图标颜色 #dc2626',exact:true}).click();
  await page.getByRole('button',{name:'保存分类',exact:true}).click();
  await page.getByRole('status').waitFor();
  await page.screenshot({path:'/tmp/pathmark-category-colors.png'});
  const popup=await context.newPage();
  await popup.addInitScript(()=>{
   window.iconCalls=[];window.titleCalls=[];
   window.chrome={tabs:{query:async()=>[{id:42,url:'https://forum.test/topic/1',title:'Resource'}]},action:{setIcon:async d=>window.iconCalls.push(d),setTitle:async d=>window.titleCalls.push(d)},runtime:{sendMessage:async()=>{},openOptionsPage:async()=>{}}};
  });
  await popup.setViewportSize({width:420,height:580});
  await popup.goto('http://127.0.0.1:5173/popup.html');
  await popup.locator('.popup__existing select').selectOption({label:'已失效'});
  await popup.waitForFunction(()=>window.titleCalls.some(d=>d.title.includes('已失效')));
  const pixel=await popup.evaluate(()=>Array.from(window.iconCalls.at(-1).imageData[16].data.slice((2*16+4)*4,(2*16+4)*4+4)));
  if(JSON.stringify(pixel)!==JSON.stringify([220,38,38,255]))throw Error('Toolbar not red');
  if(await popup.getByRole('button',{name:'标为已读',exact:true}).count())throw Error('Reading button still visible');
  await popup.screenshot({path:'/tmp/pathmark-category-result.png'});
  await popup.locator('.popup__existing select').selectOption('');
  await popup.waitForFunction(()=>window.titleCalls.at(-1).title.includes('未分类'));
  const blue=await popup.evaluate(()=>Array.from(window.iconCalls.at(-1).imageData[16].data.slice((2*16+4)*4,(2*16+4)*4+4)));
  if(JSON.stringify(blue)!==JSON.stringify([37,99,235,255]))throw Error('Uncategorized not blue');
  await popup.getByRole('button',{name:'删除当前收藏',exact:true}).click();
  await popup.waitForFunction(()=>window.iconCalls.at(-1).path?.[16].includes('unrecorded'));
  console.log('PASS: category color saved, result simplified, toolbar red for category, blue for uncategorized, reset on delete');
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
