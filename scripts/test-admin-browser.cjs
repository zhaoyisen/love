// Real HTTP UI check, launched by AdminMediaIntegrationTest with ADMIN_BROWSER_TESTS=1.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let playwright;try{playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright');}catch{playwright=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const [base,account,id]=process.argv.slice(2);if(!base||!account||!id)throw Error('Usage: node scripts/test-admin-browser.cjs API_BASE ACCOUNT_ID RECORD_ID');
(async()=>{
 const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH||(fs.existsSync(edge)?edge:undefined)});
 const output=path.resolve(__dirname,'../tmp/admin-qa');fs.mkdirSync(output,{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:1536,height:1024}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://example.test/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="400" height="240" fill="#e9e2d8"/><path d="M0 160L100 90L220 160L330 70L400 120V240H0Z" fill="#beb6a9"/></svg>'}));
  await page.goto(base+'/admin/');await page.locator('#login-form').waitFor();
  await page.locator('#operator').fill('浏览器验收');await page.locator('#token').fill('test-internal-token');await page.locator('#login-button').click();
  await page.locator('#app').waitFor({state:'visible'});
  await page.locator('#account-query').fill(account);await page.locator('#account-form button').click();
  await page.locator(`[data-account-id="${account}"]`).click();
  await page.locator('[data-tab="ALL"]').click();
  let row=page.locator(`tr[data-record-id="${id}"]`);await row.waitFor();await row.locator('[data-view]').click();
  await page.locator('#detail').waitFor({state:'visible'});await page.locator('#detail-content .detail-title').waitFor();
  assert.match(await page.locator('#detail-content').innerText(),/隐藏后双方都不展示/);
  for(const width of [320,375,414,768,1280,1536]){
   await page.setViewportSize({width,height:1024});
   const metrics=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,overflow:[...document.querySelectorAll('button')].filter(n=>n.getBoundingClientRect().width>0).filter(n=>n.scrollWidth>n.clientWidth+2).map(n=>n.textContent.trim())}));
   assert.ok(metrics.scroll<=metrics.width+1,JSON.stringify(metrics));assert.deepEqual(metrics.overflow,[],JSON.stringify(metrics));
   await page.screenshot({path:path.join(output,`admin-${width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:1536,height:1024});await page.locator('#close-detail').click();
  await row.locator('input[type="checkbox"]').check();await page.locator('#hide-records').click();
  await page.getByRole('button',{name:'确认隐藏',exact:true}).click();
  await page.locator('#notice').filter({hasText:'已隐藏'}).waitFor();
  await page.locator('[data-tab="HIDDEN"]').click();await row.waitFor();await row.locator('[data-view]').click();
  await page.locator('#detail-content').getByRole('button',{name:'恢复这条记录',exact:true}).click();
  await page.locator('#confirm-dialog').getByRole('button',{name:'恢复展示',exact:true}).click();
  await page.locator('#notice').filter({hasText:'已恢复'}).waitFor();await row.waitFor({state:'detached'});
  await page.locator('#close-detail').click();await page.locator('[data-tab="ALL"]').click();await row.waitFor();
  await page.locator('#check-records').click();await page.getByRole('button',{name:'开始检查',exact:true}).click();
  await page.locator('#notice').filter({hasText:'已提交'}).waitFor();await page.locator('#open-tasks').click();
  await page.locator('.task-card').first().waitFor();await page.locator('.task-card [data-task]').first().click();
  await page.locator('#detail-content').getByText('等待执行',{exact:true}).first().waitFor();
  assert.match(await page.locator('#detail-content').innerText(),/浏览器验收/);
  await page.locator('#close-detail').click();await page.locator('#nav-records').click();
  row=page.locator(`tr[data-record-id="${id}"]`);await row.waitFor();await row.locator('input').check();
  await page.locator('#rebuild-records').click();await page.getByRole('button',{name:'开始重建',exact:true}).click();
  await page.locator('#notice').filter({hasText:'已提交'}).waitFor();
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).length+Object.keys(sessionStorage).length),0);
  await page.locator('#logout').click();await page.locator('#login-panel').waitFor({state:'visible'});
  await page.reload();await page.locator('#login-panel').waitFor({state:'visible'});assert.equal(await page.locator('#token').inputValue(),'');
  assert.deepEqual(errors,[]);console.log('Admin browser: real HTTP login/search/scope/list/detail/hide/restore/check/rebuild/task history/logout and 6 responsive widths passed.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
