'use strict';
const {app, BrowserWindow, Menu, protocol, session, ipcMain, dialog} = require('electron');
const {readFile, writeFile} = require('node:fs/promises');
const path = require('node:path');

const APP_URL = 'task1://app/index.html';
const userData = process.env.TASK1_USER_DATA_DIR || path.join(app.getPath('appData'), 'Task1Simulator');
app.setPath('userData', path.resolve(userData));
app.setName('1과제 제작 시뮬레이터');
app.setAppUserModelId('io.github.leemangi0923.task1');
protocol.registerSchemesAsPrivileged([{scheme:'task1', privileges:{standard:true, secure:true, supportFetchAPI:true, corsEnabled:true}}]);
let mainWindow, updates;

function createMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'게임', submenu:[
      {label:'전체 화면', accelerator:'F11', click:()=>mainWindow.setFullScreen(!mainWindow.isFullScreen())},
      {type:'separator'}, {label:'종료', role:'quit'}
    ]},
    {label:'편집', submenu:[{label:'복사', role:'copy'}, {label:'붙여넣기', role:'paste'}, {label:'모두 선택', role:'selectAll'}]},
    {label:'도움말', submenu:[
      {label:'업데이트 확인', click:()=>updates.check(true)},
      {label:'저장 위치 열기', click:()=>require('electron').shell.openPath(app.getPath('userData'))},
      {label:'앱 정보', click:()=>dialog.showMessageBox(mainWindow, {type:'info', title:'앱 정보', message:`1과제 제작 시뮬레이터 v${app.getVersion()}`, detail:'인터넷 없이 실행하는 1과제 연습 게임입니다.\n작업은 이 앱에 자동 저장됩니다. 브라우저의 작업과 따로 보관합니다.\n전체 화면: F11', buttons:['확인']})}
    ]}
  ]));
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width:1440, height:940, minWidth:1000, minHeight:680, show:false,
    title:`1과제 제작 시뮬레이터 · v${app.getVersion()}`,
    backgroundColor:'#0b1013', icon:path.join(__dirname, 'assets', 'icon.png'),
    webPreferences:{preload:path.join(__dirname, 'preload.cjs'), contextIsolation:true, nodeIntegration:false, sandbox:true, webSecurity:true}
  });
  mainWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  mainWindow.webContents.on('will-navigate', (event,url)=>{if(url!==APP_URL)event.preventDefault();});
  mainWindow.webContents.on('will-attach-webview', event=>event.preventDefault());
  mainWindow.on('page-title-updated', event=>event.preventDefault());
  mainWindow.once('ready-to-show', ()=>{mainWindow.maximize();mainWindow.show();});
  mainWindow.loadURL(APP_URL).catch(error=>{dialog.showErrorBox('실행하지 못했어요',error.message);app.quit();});
  // Native close/quit can otherwise end the renderer before beforeunload persists work.
  const window = mainWindow; let closing = false, savedClose = false;
  window.on('close',event=>{
    if(savedClose)return;
    event.preventDefault();if(closing)return;closing=true;
    const save = window.webContents.executeJavaScript("typeof save === 'function' && save()").catch(()=>{});
    Promise.race([save,new Promise(resolve=>{setTimeout(resolve,2000).unref();})])
      .then(()=>session.defaultSession.flushStorageData()).catch(()=>{}).finally(()=>{
        savedClose=true;if(!window.isDestroyed())window.close();
      });
  });
  mainWindow.on('closed', ()=>{mainWindow=null;});
  createMenu();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', ()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();}});
  app.whenReady().then(async()=>{
    const html = await readFile(path.join(__dirname,'generated','index.html'),'utf8');
    protocol.handle('task1',request=>new Response(request.url===APP_URL && request.method==='GET' ? html : 'Not found', {
      status:request.url===APP_URL && request.method==='GET'?200:404,
      headers:{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff'}
    }));
    // This app has no remote content. All game pictures are embedded data URLs.
    session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('task1://app/')&&!details.url.startsWith('data:')&&!details.url.startsWith('blob:task1://app/')}));
    session.defaultSession.setPermissionRequestHandler((contents,permission,callback)=>callback(contents===mainWindow?.webContents && contents.getURL()===APP_URL && permission==='clipboard-sanitized-write'));
    session.defaultSession.setPermissionCheckHandler((contents,permission)=>contents===mainWindow?.webContents && contents.getURL()===APP_URL && permission==='clipboard-sanitized-write');
    ipcMain.handle('task1:save-wiring',async(event,payload)=>{
      if (!mainWindow || event.sender!==mainWindow.webContents || event.senderFrame!==mainWindow.webContents.mainFrame || event.senderFrame.url!==APP_URL) throw new Error('허용되지 않은 요청이에요.');
      if (!payload || typeof payload.filename!=='string' || !/^[^/\\\x00-\x1f]{1,160}\.(txt|csv)$/.test(payload.filename) || typeof payload.data!=='string' || Buffer.byteLength(payload.data,'utf8')>5*1024*1024) throw new Error('저장할 배선 목록을 확인해 주세요.');
      const ext=path.extname(payload.filename).slice(1);
      const result=await dialog.showSaveDialog(mainWindow,{title:'배선 목록 저장',defaultPath:path.join(app.getPath('documents'),payload.filename),filters:[{name:ext==='csv'?'CSV 배선 목록':'텍스트 배선 목록',extensions:[ext]}]});
      if(result.canceled||!result.filePath)return {canceled:true};
      const destination=result.filePath.toLowerCase().endsWith('.'+ext)?result.filePath:result.filePath+'.'+ext;
      await writeFile(destination,payload.data,'utf8');
      return {canceled:false};
    });
    const {autoUpdater}=require('electron-updater');
    updates=require('./updater.cjs').createUpdates(autoUpdater,app.isPackaged && process.platform==='win32',state=>{
      if(mainWindow && !mainWindow.webContents.isDestroyed())mainWindow.webContents.send('task1:update-state',state);
    },()=>session.defaultSession.flushStorageData());
    const trusted=event=>mainWindow && event.sender===mainWindow.webContents && event.senderFrame===mainWindow.webContents.mainFrame && event.senderFrame.url===APP_URL;
    ipcMain.handle('task1:update-state',event=>{if(!trusted(event))throw new Error('허용되지 않은 요청');return updates.snapshot();});
    ipcMain.handle('task1:update-action',(event,action)=>{if(!trusted(event)||!['check','download','install','dismiss'].includes(action))throw new Error('허용되지 않은 요청');return updates.action(action);});
    createWindow();
    if(app.isPackaged && process.platform==='win32') {
      setTimeout(()=>updates.check(),15000).unref();
      setInterval(()=>updates.check(),4*60*60*1000).unref();
    }
    app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
  }).catch(error=>{dialog.showErrorBox('앱 파일을 확인해 주세요',error.message);app.quit();});
  app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
}
