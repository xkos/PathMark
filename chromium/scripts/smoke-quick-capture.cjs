// Isolated development browser: no access to the user's browser profile or library.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
 try {
  const context = await browser.newContext({ viewport: { width: 420, height: 580 } });
  const page = await context.newPage();
  const base = 'http://127.0.0.1:5173';
  await page.goto(base + '/popup.html?previewUrl=https://forum.test/topic/1');
  await page.locator('.popup__form').waitFor();
  await page.evaluate(async () => {
   const { readingLibrary: lib } = await import('/src/storage/library-instance.ts');
   await lib.saveSite({name:'Forum',description:'',endpoints:[{prefix:'https://forum.test',enabled:true}],queryPolicy:{mode:'keep-all-except-ignored',ignoredParams:[]}});
   await lib.saveCollection({name:'Expired',parentId:null});
   localStorage.setItem('pathmark.language','zh-CN');
  });
  await page.reload();
  await page.locator('.popup__existing').waitFor();
  if (!(await page.locator('.popup__status').innerText()).includes('已收藏')) throw Error('Missing saved result');
  if (!(await page.locator('.popup__saved-identity').innerText()).includes('/topic/1')) throw Error('Missing saved path');
  const selector = page.locator('.popup__existing select');
  await selector.selectOption({label:'Expired'});
  await page.waitForFunction(() => !document.querySelector('.popup__existing select').disabled);
  await page.reload();
  await page.locator('.popup__existing').waitFor();
  if (await selector.locator('option:checked').innerText() !== 'Expired') throw Error('Category not persisted');
  if (await page.locator('#root').evaluate(el => el.scrollHeight > el.clientHeight)) throw Error('Saved popup scrolls');
  await page.screenshot({path:'/tmp/pathmark-0.2.14-saved.png'});
  await page.getByRole('button',{name:'删除当前收藏',exact:true}).click();
  await page.locator('.popup__form').waitFor();
  const count = await page.evaluate(async () => (await (await import('/src/storage/library-instance.ts')).readingLibrary.listItems()).length);
  if(count !== 0) throw Error('Deleted item auto-recreated');
  await page.goto(base + '/popup.html?previewUrl=https://unknown.test/topic/2');
  await page.locator('.popup__form').waitFor();
  if(await page.locator('#root').evaluate(el=>el.scrollHeight>el.clientHeight))throw Error('Unmatched popup scrolls');
  await page.screenshot({path:'/tmp/pathmark-0.2.14-new.png'});
  await page.evaluate(async () => {
   const {readingLibrary:lib}=await import('/src/storage/library-instance.ts');
   await lib.savePage({url:'https://unknown.test/topic/2',title:'Migration test',note:'',tags:[],collectionId:null,readingState:'unread'});
  });
  await page.setViewportSize({width:1280,height:900});
  await page.goto(base + '/library.html');
  await page.getByRole('button',{name:'迁移站点',exact:true}).click();
  await page.locator('.migration-preview').waitFor();
  await page.screenshot({path:'/tmp/pathmark-0.2.14-migration.png'});
  await page.getByRole('button',{name:'确认迁移',exact:true}).click();
  await page.locator('.migration-dialog').waitFor({state:'detached'});
  const result = await page.evaluate(async () => {
   const {readingLibrary:lib}=await import('/src/storage/library-instance.ts');
   return {items:await lib.listItems(),sites:await lib.listSites()};
  });
  if(result.items[0].siteId!==result.sites[0].id || result.sites[0].endpoints.length!==2)throw Error('Migration did not add endpoint');
  // A second unassigned item exercises creation directly from the migration dialog.
  await page.evaluate(async () => {
   const {readingLibrary:lib}=await import('/src/storage/library-instance.ts');
   await lib.savePage({url:'https://new.test/posts/3',title:'New site migration',note:'',tags:[],collectionId:null,readingState:'unread'});
  });
  await page.reload();
  await page.getByRole('button',{name:'迁移站点',exact:true}).click();
  await page.locator('.migration-dialog select').selectOption('new');
  await page.locator('.migration-preview').waitFor();
  await page.getByRole('button',{name:'确认迁移',exact:true}).click();
  await page.locator('.migration-dialog').waitFor({state:'detached'});
  const siteNames = await page.evaluate(async () => (await (await import('/src/storage/library-instance.ts')).readingLibrary.listSites()).map(s=>s.name));
  if(!siteNames.includes('new.test'))throw Error('New site was not created');
  console.log('PASS: auto-save, persisted category, delete without recreation, compact matched/unmatched popup, domain migration');
 } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1)});
