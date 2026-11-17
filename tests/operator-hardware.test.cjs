const {test,before,after,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {readFile}=require('node:fs/promises');
const {createServer}=require('node:http');
const {join}=require('node:path');
const {chromium}=require('playwright');
let browser,server,page,context,origin,errors;
before(async()=>{
  const html=await readFile(join(__dirname,'..','index.html'));
  server=createServer((q,r)=>r.end(html));await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
});
after(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
beforeEach(async()=>{
  context=await browser.newContext({viewport:{width:1600,height:1000}});await context.route('https://fonts.googleapis.com/**',r=>r.abort());await context.route('https://fonts.gstatic.com/**',r=>r.abort());
  page=await context.newPage();errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.waitForFunction(()=>window.SIM);
  await page.evaluate(()=>{clearInterval(LIVE.timer);setMode('free',newPreparationState());});
  for(const id of ['togTray','togSide'])if(await page.locator('#'+id).getAttribute('aria-expanded')==='true')await page.locator('#'+id).click();await page.waitForTimeout(350);
});
afterEach(async()=>{await context.close();assert.deepEqual(errors,[]);});
async function clickPoint(q){const p=await page.evaluate(q=>{const a=projectWorkPoint(q),r=svg.getBoundingClientRect();return{x:r.left+(a.x-UI.cam.x)/UI.cam.w*r.width,y:r.top+(a.y-UI.cam.y)/UI.cam.h*r.height};},q);await page.mouse.click(p.x,p.y);}

test('loose operator nuts and the detached emergency cap pick up one complete kit without overlapping neighbouring stock',async()=>{
  const origin=await page.evaluate(()=>{
    const x=STATION.topX+200,y=STATION.topY+250;
    trayTap('lampW');drop({x,y});drop({x,y:y+44});returnCarry();trayTap('ems');drop({x:x+200,y});returnCarry();renderAll();fitTo({x:x-80,y:y-70,w:420,h:240});
    return{x,y,first:S.floor.find(f=>f.key==='lampW').id};
  });
  const before=await page.evaluate(()=>({count:S.floor.length,collision:S.floor.some((f,i)=>S.floor.slice(i+1).some(g=>rectsOverlap(looseBounds(f),looseBounds(g)))),stock:preparedKit('op').n}));assert.deepEqual(before,{count:3,collision:false,stock:3});
  await clickPoint({x:origin.x+13.6,y:origin.y+44});
  assert.deepEqual(await page.evaluate(()=>({kind:UI.carry?.key,n:UI.carry?.count,floor:S.floor.length,left:trayItems().find(i=>i.key==='lampW').left})),{kind:'lampW',n:1,floor:2,left:0});
  await clickPoint({x:origin.x+100,y:origin.y+90});assert.equal(await page.evaluate(()=>S.floor.length),3);
  await clickPoint({x:origin.x+238,y:origin.y+37});assert.equal(await page.evaluate(()=>UI.carry?.key),'ems');assert.equal(await page.evaluate(()=>S.floor.some(f=>f.key==='ems')),false);
  await page.evaluate(()=>returnCarry());assert.equal(await page.evaluate(()=>trayItems().find(i=>i.key==='ems').left),1);
  await page.reload();await page.waitForFunction(()=>window.SIM);assert.equal(await page.evaluate(()=>S.floor.filter(f=>f.key==='lampW').length),2);assert.equal(await page.evaluate(()=>S.floor.some(f=>f.key==='ems')),false);
});

test('a prepared operator installs with its nut, exposes the existing rear terminal and returns as one kit',async()=>{
  const nut=await page.evaluate(()=>{setMode('free',newState(false));const x=STATION.topX+200,y=STATION.topY+250;trayTap('lampW');dropOnFloor({x,y});returnCarry();renderAll();fitTo({x:x-80,y:y-60,w:220,h:220});return{x:x+13.6,y:y+44};});await clickPoint(nut);
  assert.equal(await page.evaluate(()=>UI.carry?.key),'lampW');
  const target=await page.evaluate(()=>{fitOp();return{x:OPW.x+OP.holes.h1[0],y:OPW.y+OP.holes.h1[1]};});await clickPoint(target);
  assert.deepEqual(await page.evaluate(()=>({installed:S.op.dev.h1,loose:S.floor.length,carry:UI.carry})),{installed:'lampW',loose:0,carry:null});
  const terminal=await page.evaluate(()=>{positionPanel(ROOM.deskPanelX,ROOM.deskPanelY);S.opBack=true;S.tool='wire';buildTerms();renderAll();fitOp();return{...TERM['OP.WL1.+']};});await clickPoint(terminal);assert.equal(await page.evaluate(()=>UI.pending),'OP.WL1.+');
  assert.equal(await page.locator('#gWorld [data-op-locknut="mounted"]').count(),1);assert.equal(await page.locator('#gWorld [data-op-locknut="loose"]').count(),0);
  await page.evaluate(()=>{UI.pending=null;S.tool='hand';S.opBack=false;buildTerms();renderAll();save();});await page.reload();await page.waitForFunction(()=>window.SIM);assert.equal(await page.evaluate(()=>S.op.dev.h1),'lampW');
  const remove=await page.evaluate(()=>{hideHome();fitOp();return{x:OPW.x+OP.holes.h1[0],y:OPW.y+OP.holes.h1[1]};});await clickPoint(remove);assert.equal(await page.evaluate(()=>UI.carry?.key),'lampW');await page.evaluate(()=>returnCarry());assert.equal(await page.evaluate(()=>trayItems().find(i=>i.key==='lampW').left),2);
});

test('actual v2.50 staged operators reflow for separate nuts once while preserving IDs, other materials and preparation progress',async()=>{
  const old=JSON.parse(await readFile(join(__dirname,'fixtures','operator-stock-v250.json'),'utf8'));
  const result=await page.evaluate(old=>{
    setMode('free',pClone(old));const boxes=S.floor.map(looseBounds),operator=S.floor.filter(f=>f.kind==='op'&&f.key!=='hmi'),unchanged=S.floor.filter(f=>!operator.includes(f)).every(f=>JSON.stringify(f)===JSON.stringify(old.floor.find(o=>o.id===f.id)));
    const first=JSON.stringify(S);fixState();save();
    return{ids:S.floor.map(f=>f.id),count:operator.length,unchanged,overlap:boxes.some((a,i)=>boxes.slice(i+1).some(b=>rectsOverlap(a,b))),onSurface:S.floor.every(f=>rectOnSurface(looseBounds(f),f.kind==='op'?'robotTop':'desk')),once:first===JSON.stringify(S),preparing:isPreparing(),plate:JSON.stringify(S.setup.opPlate)===JSON.stringify(old.setup.opPlate),ready:preparedKit('op')};
  },old);
  assert.deepEqual(result.ids,old.floor.map(f=>f.id));assert.equal(result.count,10);for(const k of ['unchanged','onSurface','once','preparing','plate'])assert.equal(result[k],true,k);assert.equal(result.overlap,false);assert.deepEqual(result.ready,{n:11,m:11,done:true});
  const before=await page.evaluate(()=>JSON.stringify({...S,setup:{...S.setup,elapsed:0}}));await page.reload();await page.waitForFunction(()=>window.SIM);assert.equal(await page.evaluate(()=>JSON.stringify({...S,setup:{...S.setup,elapsed:0}})),before);
});

test('the visible selector handle tip operates both ways and the buzzer plate corner picks up its whole kit',async()=>{
  await page.evaluate(()=>{setMode('free',pClone(pracRef()));S.opBack=false;S.tool='hand';S.finished=true;LIVE.inp.mcb=true;buildTerms();liveStep(0);renderAll();fitOp();});
  for(let i=0;i<2;i++){
    const state=await page.evaluate(()=>{const before=LIVE.inp.ss,a=(before==='A'?40:-40)*Math.PI/180,[x,y]=OP.holes.v3;return{before,p:{x:OPW.x+x-16.5*Math.sin(a),y:OPW.y+y+16.5*Math.cos(a)}};});
    await clickPoint(state.p);assert.notEqual(await page.evaluate(()=>LIVE.inp.ss),state.before);
  }
  const corner=await page.evaluate(()=>{LIVE.inp.mcb=false;S.opBack=false;S.tool='hand';liveStep(0);renderAll();fitOp();return{x:OPW.x+OP.holes.v4[0]+17,y:OPW.y+OP.holes.v4[1]+17};});await clickPoint(corner);
  assert.equal(await page.evaluate(()=>UI.carry?.key),'bz');assert.equal(await page.evaluate(()=>S.op.dev.v4),undefined);
});
