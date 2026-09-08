// Run against npm run dev using an isolated browser context.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
 try {
  const context=await browser.newContext({locale:'zh-CN'});
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:5173/library.html');
  await page.locator('.library-nav').waitFor();
  if(await page.locator('html').getAttribute('lang')!=='en')throw Error('default not English');
  const popup=await context.newPage();await popup.goto('http://127.0.0.1:5173/popup.html');
  await page.locator('.library-nav__item').last().click();
  await page.getByLabel('Language / 界面语言',{exact:true}).selectOption('zh-CN');
  await page.getByRole('heading',{name:'设置与数据',exact:true}).waitFor();
  await popup.waitForFunction(()=>document.documentElement.lang==='zh-CN');
  await page.reload();await page.waitForFunction(()=>document.documentElement.lang==='zh-CN');
  await page.locator('.library-nav__item').last().click();
  if(await page.getByLabel('Language / 界面语言',{exact:true}).inputValue()!=='zh-CN')throw Error('not persisted');
  await page.getByLabel('Language / 界面语言',{exact:true}).selectOption('en');
  await popup.waitForFunction(()=>document.documentElement.lang==='en');
  console.log('PASS: English default under Chinese browser, immediate switch, popup synchronization, persistence, switch back');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
