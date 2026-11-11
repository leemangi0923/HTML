const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
let server,browser,origin;
before(async()=>{
  await require('../scripts/build-preview.cjs').buildPreview();
  const root=path.resolve(__dirname,'..');
  const files=new Map(await Promise.all(['index.html','preview25d.html'].map(async name=>['/'+name,await readFile(path.join(root,name))])));
  server=createServer((req,res)=>{const data=files.get(req.url==='/'?'/index.html':req.url);res.writeHead(data?200:404,{'Content-Type':'text/html; charset=utf-8'});res.end(data||'Not found');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
async function session(fn,{disabled=false,mobile=false}={}){
  const context=await browser.newContext({viewport:mobile?{width:480,height:850}:{width:1440,height:960},hasTouch:mobile});
  const page=await context.newPage();const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',req=>requests.push(req.url()));
  await context.route('https://**',route=>route.abort());
  if(disabled)await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};});
  try{await fn(page,context,requests);assert.deepEqual(errors,[]);}finally{await context.close();}
}
async function open(page){await page.goto(origin+'/preview25d.html');await page.waitForFunction(()=>window.PREVIEW25D?.snapshot().available);await settle(page);}
const snapshot=page=>page.evaluate(()=>PREVIEW25D.snapshot());
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function pan(page,dx,dy){const r=await page.locator('#view').boundingBox();await page.mouse.move(r.x+r.width*.57,r.y+r.height*.52);await page.mouse.down({button:'middle'});await page.mouse.move(r.x+r.width*.57+dx,r.y+r.height*.52+dy,{steps:8});await page.mouse.up({button:'middle'});await settle(page);}
async function clickProbes(page){
  const r=await page.locator('#view').boundingBox();
  for(const probe of (await snapshot(page)).probes){assert.ok(probe.screen.visible,probe.id);await page.mouse.click(r.x+probe.screen.x,r.y+probe.screen.y);await settle(page);assert.equal((await snapshot(page)).selectedProbe,probe.id,`${probe.id} selects the surface at its own height`);}
}

test('2.5D preview changes perspective on pan, picks raised surfaces, locks angles and renders only when needed',async()=>session(async(page,context,requests)=>{
  await open(page);const initial=await snapshot(page);await clickProbes(page);await pan(page,95,-40);const moved=await snapshot(page);
  assert.notEqual(moved.yaw,initial.yaw);assert.notEqual(moved.pitch,initial.pitch);await clickProbes(page);
  await page.mouse.move(30,30);await page.waitForTimeout(100);const still=await snapshot(page);await page.waitForTimeout(160);const later=await snapshot(page);
  assert.equal(still.renderCount,later.renderCount);assert.equal(still.yaw,later.yaw);assert.equal(still.pitch,later.pitch);
  await page.locator('#lock').check();await settle(page);const locked=await snapshot(page);await pan(page,-70,45);const lockedMoved=await snapshot(page);
  assert.equal(lockedMoved.yaw,locked.yaw);assert.equal(lockedMoved.pitch,locked.pitch);assert.notDeepEqual(lockedMoved.target,locked.target);
  await page.locator('#lock').uncheck();await settle(page);assert.equal((await snapshot(page)).yaw,locked.yaw);
  await page.locator('#front').click();await settle(page);await pan(page,35,20);const front=await snapshot(page);assert.equal(front.yaw,0);assert.equal(front.pitch,0);assert.equal(front.locked,true);await clickProbes(page);
  await page.locator('#depth').click();await page.locator('#fit').click();await settle(page);
  const r=await page.locator('#view').boundingBox(),a=(await snapshot(page)).probes[0].screen;await page.mouse.move(r.x+a.x,r.y+a.y);await page.mouse.wheel(0,-150);await settle(page);
  const zoomed=await snapshot(page);assert.ok(zoomed.zoom>1);assert.ok(Math.hypot(zoomed.probes[0].screen.x-a.x,zoomed.probes[0].screen.y-a.y)<2,'zoom keeps the point under the pointer');await clickProbes(page);
  await page.setViewportSize({width:1000,height:780});await settle(page);await page.locator('#fit').click();await settle(page);await clickProbes(page);
  assert.equal(requests.filter(url=>!url.startsWith(origin)).length,0,'standalone preview has no external assets');
  if(process.env.TASK1_PREVIEW_SCREENSHOT)await page.screenshot({path:process.env.TASK1_PREVIEW_SCREENSHOT});
}));

test('home preview opens and closes offline without changing work, score or stored profiles',async()=>session(async(page,context)=>{
  await page.goto(origin);await page.waitForFunction(()=>window.SIM);await page.evaluate(()=>{clearInterval(LIVE.timer);setMode('free',pClone(pracRef()));S.usedFill=false;showHome();save();localStorage.setItem(STORE_EXAM,JSON.stringify({...newState(),elapsed:12345}));});
  const state=()=>page.evaluate(()=>({work:JSON.stringify(S),score:scoreSheet().total,stores:[STORE,STORE_EXAM,STORE_FAULT,STORE_PRAC].map(k=>localStorage.getItem(k))}));
  const before=await state();await page.locator('[data-home="preview25"]').click();const frame=page.frameLocator('#preview25 iframe');
  await frame.locator('#view').waitFor();await page.waitForFunction(()=>document.querySelector('#preview25 iframe').contentWindow.PREVIEW25D);
  assert.equal(await frame.locator('#unavailable').isHidden(),true);await frame.locator('#front').click();await frame.locator('#view').press('ArrowRight');await frame.locator('#view').press('Escape');
  await page.locator('#preview25').waitFor({state:'hidden'});assert.deepEqual(await state(),before);assert.equal(await page.locator('#home').evaluate(el=>el.inert),false);
  await page.locator('[data-home="preview25"]').click();await frame.locator('#view').waitFor();await page.locator('.preview25-close').click();assert.deepEqual(await state(),before);
}));

test('unavailable WebGL gives a useful return path and leaves the existing game usable',async()=>session(async page=>{
  await page.goto(origin);await page.waitForFunction(()=>window.SIM);await page.locator('[data-home="preview25"]').click();const frame=page.frameLocator('#preview25 iframe');
  await frame.locator('#unavailable').waitFor();assert.match(await frame.locator('#unavailableText').textContent(),/기존 작업 화면/);assert.equal(await frame.locator('#front').isDisabled(),true);
  await page.locator('.preview25-close').click();await page.locator('[data-home="free"]').click();assert.equal(await page.locator('#home').isHidden(),true);
},{disabled:true}));

test('touch pan and pinch work on a narrow screen without horizontal overflow',async()=>session(async page=>{
  await open(page);const cdp=await page.context().newCDPSession(page),r=await page.locator('#view').boundingBox();const x=r.x+r.width*.5,y=r.y+r.height*.5;
  const touch=async(type,points)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y}))});await settle(page);};
  const initial=await snapshot(page);await touch('touchStart',[[1,x,y]]);await touch('touchMove',[[1,x+45,y+15]]);await touch('touchEnd',[]);const moved=await snapshot(page);assert.notDeepEqual(moved.target,initial.target);assert.notEqual(moved.yaw,initial.yaw);
  await touch('touchStart',[[1,x-35,y],[2,x+35,y]]);await touch('touchMove',[[1,x-70,y],[2,x+70,y]]);await touch('touchEnd',[]);assert.ok((await snapshot(page)).zoom>moved.zoom*1.8);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.locator('#fit').click();await settle(page);await clickProbes(page);
},{mobile:true}));
