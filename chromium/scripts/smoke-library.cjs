// Run against npm run dev. Uses an isolated browser context and synthetic data only.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
 try {
 const errors = [];
 const page = await browser.newPage({locale:'zh-CN',viewport:{width:1440,height:1000}});
 page.on('pageerror', e=> errors.push(e.message));
 await page.addInitScript(() => localStorage.setItem('pathmark.language', 'zh-CN'));
 await page.goto('http://127.0.0.1:5173/library.html');
 await page.evaluate(async()=>{
  const {readingLibrary:l} = await import('/src/storage/library-instance.ts');
  const now=new Date().toISOString();
  await l.database.items.bulkAdd(Array.from({length:7000},(_,i)=>({id:`test-${i}`,title:`测试资料 ${i}`,note:'',tags:[],collectionId:null,siteId:null,resourceKey:null,canonicalKey:`v1:url:https://example.test/path${i}`,originalUrl:`https://example.test/path${i}`,lastResolvedUrl:null,readingState:'unread',isArchived:false,createdAt:now,updatedAt:now,firstReadAt:null,readAt:null,lastOpenedAt:null,openCount:0})));
 });
 const start=Date.now(); await page.reload(); await page.locator('.item-row').first().waitFor();
 if(await page.locator('.item-row').count() !== 100) throw Error('pagination failed');
 console.log(JSON.stringify({loadMs:Date.now()-start,rows:await page.locator('.item-row').count(),total:await page.getByRole('checkbox',{name:'全选筛选结果 (7000)',exact:true}).count()}));
 await page.getByRole('checkbox',{name:'全选筛选结果 (7000)',exact:true}).check();
 if(!(await page.locator('.bulk-toolbar strong').textContent()).includes('7000')) throw Error('select all results failed');
 console.log('selected 7000');
 await page.getByRole('checkbox',{name:'全选筛选结果 (7000)',exact:true}).uncheck();
 if(await page.locator('.item-row input:checked').count())throw Error('clear all failed');
 await page.locator('.item-row input[type="checkbox"]').first().check();
 if(!await page.locator('.library-select-all input').evaluate(input=>input.indeterminate))throw Error('missing mixed state');
 await page.getByRole('checkbox',{name:'全选筛选结果 (7000)',exact:true}).check();
 await page.getByRole('checkbox',{name:'全选筛选结果 (7000)',exact:true}).uncheck();
 await page.locator('.library-pagination').getByRole('button',{name:'70',exact:true}).click();
 if(!await page.getByRole('button',{name:'下一页',exact:true}).isDisabled())throw Error('last page next enabled');
 await page.locator('.library-pagination').getByRole('button',{name:'1',exact:true}).click();
 if(!await page.getByRole('button',{name:'上一页',exact:true}).isDisabled())throw Error('first page previous enabled');
 await page.getByRole('button',{name:'下一页',exact:true}).click();
 console.log('page2rows',await page.locator('.item-row').count());


 await page.evaluate(async()=>{
   const {readingLibrary:l}=await import('/src/storage/library-instance.ts'); await l.clearAllData();
   await l.saveSite({name:'镜像站',description:'',endpoints:[{prefix:'https://old.example.com',enabled:true}],queryPolicy:{mode:'keep-all-except-ignored',ignoredParams:[]}});
   for (const [url,state,note] of [['https://old.example.com/patha','unread','原笔记'],['https://new.example.com/patha','read','新笔记'],['https://new.example.com/pathb','unread','']]) await l.savePage({url,title:url,note,tags:[],collectionId:null,readingState:state});
   await l.saveCollection({name:'已有分类',parentId:null});
 });
 await page.reload();
 await page.getByRole('button',{name:'站点与 Endpoint',exact:true}).click();
 await page.locator('.site-list__item--active').waitFor();
 await page.getByRole('button',{name:'添加 Endpoint',exact:true}).click();
 await page.getByLabel('Endpoint 2 前缀').fill('https://new.example.com');
 await page.getByRole('button',{name:'保存站点',exact:true}).click();
 await page.getByRole('button',{name:'同步站点',exact:true}).click();
 await page.getByRole('button',{name:'全选',exact:true}).click();

 await page.getByRole('button',{name:/同步站点 \(2\)/}).click();
 await page.getByText('没有条目的存储身份需要重映射。').waitFor();
 const merged=await page.evaluate(async()=>{const {readingLibrary:l}=await import('/src/storage/library-instance.ts');return (await l.listItems()).map(i=>({path:i.resourceKey,state:i.readingState,note:i.note}));});
 console.log('sync result',JSON.stringify(merged));
 if(merged.length!==2 || !merged.some(i=>i.path==='/patha' && i.state==='read' && i.note.includes('新笔记'))) throw Error('sync failed');
 await page.getByRole('button',{name:'设置与数据',exact:true}).click();
 await page.evaluate(()=>{ window.chrome={...window.chrome, permissions:{request:async()=>true}, bookmarks:{getTree:async()=>[{id:'root',title:'书签栏',children:[{id:'folder',title:'深层',children:[{id:'leaf',title:'子目录',children:[{id:'a',title:'A',url:'https://a.example.com/a'}]},{id:'b',title:'B',url:'https://b.example.com/b'}]}]}]}}; });
 await page.getByRole('button',{name:'授权并读取',exact:true}).click();
 await page.locator('.selection-tree__row').first().waitFor();
 if(await page.locator('.selection-tree__row').count()!==1) throw Error('tree not collapsed');
 await page.getByRole('button',{name:'书签栏',exact:true}).click();
 await page.getByRole('button',{name:'深层',exact:true}).click();
 await page.getByRole('checkbox',{name:'深层',exact:true}).uncheck();
 if(await page.getByRole('checkbox',{name:'子目录',exact:true}).isChecked()) throw Error('subtree not deselected');
 await page.getByRole('checkbox',{name:'深层',exact:true}).check();
 const importStates=page.locator('.bookmark-tree-controls select[aria-label="阅读状态"]');
 if(await page.getByRole('checkbox',{name:'导入后归档',exact:true}).count()) throw Error('separate archive checkbox remains');
 await importStates.last().selectOption('archived');
 await importStates.last().selectOption('reading');
 await importStates.last().selectOption('read');
 await importStates.last().selectOption('archived');
 const collectionSelects=page.locator('.bookmark-tree-controls select').filter({has:page.locator('option[value="[]"]')});
 await collectionSelects.first().selectOption({label:'已有分类'});
 if((await collectionSelects.last().locator('option').allTextContents()).some(name=>name.includes('深层'))) throw Error('folder names leaked into collections');
 if(await page.getByLabel('分类名称',{exact:true}).count()) throw Error('unexpected creation input');
 await collectionSelects.nth(1).selectOption('new');
 await page.getByLabel('分类名称',{exact:true}).fill('本次分类');
 await page.getByRole('button',{name:'创建分类',exact:true}).click();
 if(!(await collectionSelects.last().locator('option').allTextContents()).includes('本次分类 · 本次新建')) throw Error('draft collection missing');
 console.log('draft collection available');
 const mapping=page.locator('.bookmark-site-row');
 await mapping.first().locator('select').selectOption('new');
 await mapping.first().locator('input').fill('本次站点');
 await mapping.last().locator('select').selectOption('draft:本次站点');
 if(await mapping.last().locator('input').inputValue() !== '本次站点') throw Error('draft site not reused');
 console.log('draft site reused');

 await collectionSelects.last().selectOption({label:'本次分类 · 本次新建'});
 await page.getByRole('button',{name:'生成导入预览',exact:true}).click();
 await page.getByRole('button',{name:'确认导入',exact:true}).click();
 await page.getByText('收藏夹导入完成：新增 2 条资料。').waitFor();
 const imported = await page.evaluate(async()=>{
   const {readingLibrary:l}=await import('/src/storage/library-instance.ts');
   const site=(await l.listSites()).find(s=>s.name==='本次站点');
   const collection=(await l.listCollections()).find(c=>c.name==='本次分类');
   const items=(await l.listItems()).filter(i=>i.siteId===site.id);
   return {endpoints:site.endpoints.length, items:items.length, archivedRead:items.filter(i=>i.isArchived && i.readingState==="read").length, sharedCollection:items.every(i=>i.collectionId===collection.id)};
 });
 if(imported.archivedRead!==1 || imported.endpoints!==2 || imported.items!==2 || !imported.sharedCollection) throw Error('import mapping failed');
 console.log('import persisted',JSON.stringify(imported));
 await page.getByRole('button',{name:/全部条目/}).click();
 await page.locator('.library-collection-filter select').selectOption('all');
 await page.locator('.library-advanced-filters select[aria-label="站点"]').selectOption('all');
 await page.getByRole('checkbox',{name:'全选筛选结果 (4)',exact:true}).check();
 page.once('dialog', dialog=>dialog.accept());
 await page.locator('.bulk-toolbar').getByRole('button',{name:'删除',exact:true}).click();
 await page.waitForFunction(async()=>{const {readingLibrary:l}=await import('/src/storage/library-instance.ts');return (await l.listItems()).length===0;});
 if(errors.length) throw Error(errors.join('\n'));
 console.log('bulk delete persisted');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
