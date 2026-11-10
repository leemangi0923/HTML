const {test} = require('node:test');
const assert = require('node:assert/strict');
const {mkdtemp,rm,readFile} = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {_electron} = require('playwright');
const root = path.resolve(__dirname,'..');

test('desktop game runs offline, isolates Node, exports files, and restores independent work after restart', {timeout:180000}, async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'task1-electron-'));
  let app;const errors=[];
  const launch=async()=>{
    const args=[...(process.platform==='linux'?['--no-sandbox']:[]),'--disable-gpu',...(process.env.TASK1_EXECUTABLE?[]:[root])];
    app=await _electron.launch({timeout:90000,args,executablePath:process.env.TASK1_EXECUTABLE||undefined,cwd:root,env:{...process.env,TASK1_USER_DATA_DIR:path.join(temp,'profile')}});
    const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>window.SIM);await page.evaluate(()=>clearInterval(LIVE.timer));
    return page;
  };
  try{
    let page=await launch();
    assert.equal(page.url(),'task1://app/index.html');
    assert.deepEqual(await page.evaluate(()=>({node:typeof require,process:typeof process,bridge:typeof window.task1Desktop.saveWiring,fonts:document.querySelectorAll('link[href^="https:"]').length})),{node:'undefined',process:'undefined',bridge:'function',fonts:0});
    const preferences=await app.evaluate(({BrowserWindow})=>{const p=BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();return{sandbox:p.sandbox,contextIsolation:p.contextIsolation,nodeIntegration:p.nodeIntegration};});
    assert.deepEqual(preferences,{sandbox:true,contextIsolation:true,nodeIntegration:false});
    await page.context().setOffline(true);await page.reload();await page.waitForFunction(()=>window.SIM);await page.evaluate(()=>clearInterval(LIVE.timer));
    await page.evaluate(()=>{setMode('free',pClone(pracRef()));S.selfChk={'1-4':true};S.usedFill=false;S.elapsed=1000;S.tbLabels[0]='앱 저장 확인';buildTerms();renderAll();save();});
    assert.equal(await page.evaluate(()=>scoreSheet().total),30);
    const destination=path.join(temp,'배선 목록.csv');
    await app.evaluate(({dialog},destination)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:destination});},destination);
    await page.locator('#btnWires').click();await page.locator('[data-act="wl-csv"]').click();
    await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('파일로 저장'));
    const csv=await readFile(destination,'utf8');assert.match(csv,/순서,꽂은 시간,출발,도착/);assert.match(csv,/TB\./);
    await page.locator('#modal [data-act="close"]').click();
    await assert.rejects(page.evaluate(()=>window.task1Desktop.saveWiring({filename:'../bad.txt',data:'bad'})),/저장할 배선 목록/);
    await page.evaluate(()=>window.open('https://example.com'));
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);
    assert.equal(await app.evaluate(({Menu})=>Menu.getApplicationMenu().items[0].submenu.items[0].accelerator),'F11');
    await page.locator('#btnHome').click();await page.locator('[data-home="fault"]').click();await page.locator('[data-fd="start"][data-level="1"]').click();
    await page.locator('#nextWrap [data-fd="hint"]').click();
    const faultIds=await page.evaluate(()=>S.fault.ids);
    await page.locator('#btnHome').click();await page.locator('[data-home="free"]').click();
    assert.equal(await page.evaluate(()=>S.tbLabels[0]),'앱 저장 확인');
    await page.evaluate(()=>{S.tbLabels[1]='종료 직전 저장';});
    await page.evaluate(()=>{location.href='https://example.com';});
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getURL()),'task1://app/index.html');
    await app.close();app=null;
    page=await launch();await page.locator('[data-home="free"]').click();
    assert.deepEqual(await page.evaluate(()=>S.tbLabels.slice(0,2)),['앱 저장 확인','종료 직전 저장']);
    await page.locator('#btnHome').click();await page.locator('[data-home="fault"]').click();await page.locator('[data-fd="resume"]').click();
    assert.deepEqual(await page.evaluate(()=>S.fault.ids),faultIds);assert.deepEqual(await page.evaluate(()=>S.fault.hints),[1]);
    if(process.env.TASK1_DESKTOP_SCREENSHOT)await page.screenshot({path:process.env.TASK1_DESKTOP_SCREENSHOT});
    assert.deepEqual(errors,[]);
  }finally{await app?.close();await rm(temp,{recursive:true,force:true,maxRetries:4,retryDelay:500});}
});
