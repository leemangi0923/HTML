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

async function looseAssembly(){await page.evaluate(()=>{setMode('free',newState(false));S.setup={status:'active',elapsed:0,opMounted:false,opPlate:hmiPrepPosition(),panelPlate:null};buildTerms();renderAll();fitOp();});}
async function hole(h,dx=0){return page.evaluate(({h,dx})=>({x:OPW.x+(S.opBack?OP.w-OP.holes[h][0]:OP.holes[h][0])+dx,y:OPW.y+OP.holes[h][1]}),{h,dx});}
async function take(key){await page.evaluate(key=>{if(UI.carry?.key!==key)trayTap(key);},key);}
async function flip(){await page.locator('#btnFlip').click();await page.evaluate(()=>fitOp());}

test('bodies, silver nuts and emergency caps are separate stock with independent pickup and counts',async()=>{
  const positions=await page.evaluate(()=>{
    const x=STATION.topX+200,y=STATION.topY+250;
    for(const[key,dx]of [['lampW',0],['opnut',80],['ems',160],['emscap',240]]){trayTap(key);drop({x:x+dx,y});returnCarry();}
    renderAll();fitTo({x:x-50,y:y-50,w:350,h:180});return S.floor.map(f=>({key:f.key,x:f.x,y:f.y}));
  });
  assert.equal(await page.evaluate(()=>S.floor.length),4);
  assert.equal(await page.evaluate(()=>S.floor.some((a,i)=>S.floor.slice(i+1).some(b=>rectsOverlap(looseBounds(a),looseBounds(b))))),false);
  for(const key of ['opnut','emscap']){
    await clickPoint(positions.find(p=>p.key===key));
    assert.equal(await page.evaluate(()=>UI.carry?.key),key);
    assert.equal(await page.evaluate(()=>S.floor.some(f=>f.key==='ems')),true);
    await page.evaluate(()=>returnCarry());
  }
  assert.deepEqual(await page.evaluate(()=>({nuts:trayItems().find(i=>i.key==='opnut').left,cap:trayItems().find(i=>i.key==='emscap').left,ready:preparedKit('op')})),{nuts:10,cap:1,ready:{n:2,m:22,done:false}});
});

test('real pointer assembly inserts bodies before nuts and cap, then mounts the completed loose HMI plate',async()=>{
  await looseAssembly();
  await take('opnut');await clickPoint(await hole('h1'));assert.equal(await page.evaluate(()=>nOpNuts()),0);assert.match(await page.locator('#toast').textContent(),/먼저 본체/);
  await page.evaluate(()=>returnCarry());await take('hmi');await clickPoint(await page.evaluate(()=>({x:OPW.x+OP.cut.x+OP.cut.w/2,y:OPW.y+OP.cut.y+OP.cut.h/2})));
  const bodies=await page.evaluate(()=>Object.entries(OP.answer).map(([h,a])=>[h,a.type]));
  for(const[h,type]of bodies){await take(type);await clickPoint(await hole(h));}
  assert.deepEqual(await page.evaluate(()=>[opPlaced(),nOpNuts(),nEmergencyCaps(),opPlateMounted()]),[11,0,0,false]);
  await take('emscap');await clickPoint(await hole('h6'));assert.equal(await page.evaluate(()=>nEmergencyCaps()),0);assert.match(await page.locator('#toast').textContent(),/고정 링/);
  await page.evaluate(()=>{returnCarry();fitOp();});
  await clickPoint(await page.evaluate(()=>({x:OPW.x+15,y:OPW.y+15})));assert.equal(await page.evaluate(()=>UI.carry?.key),'opplate');
  await page.evaluate(()=>fitRoom('robotTop'));const dock=await page.evaluate(()=>opDockRect());await clickPoint({x:dock.x+dock.w/2,y:dock.y+dock.h/2});
  assert.equal(await page.evaluate(()=>opPlateMounted()),false);assert.equal(await page.evaluate(()=>UI.carry?.key),'opplate');
  await page.evaluate(()=>{returnCarry();fitOp();});await flip();await take('opnut');
  for(const[h]of bodies)await clickPoint(await hole(h));
  assert.equal(await page.evaluate(()=>nOpNuts()),10);assert.equal(await page.locator('#gWorld [data-op-locknut="mounted"]').count(),10);
  await take('emscap');await clickPoint(await hole('h6'));assert.equal(await page.evaluate(()=>nEmergencyCaps()),0);await flip();await clickPoint(await hole('h6'));
  assert.equal(await page.evaluate(()=>opAssemblyComplete()),true);assert.equal(await page.evaluate(()=>opPlateMounted()),false);
  await page.reload();await page.waitForFunction(()=>window.SIM);await page.locator('[data-home="free"]').click();await page.evaluate(()=>fitOp());
  assert.equal(await page.evaluate(()=>opAssemblyComplete()),true);
  await clickPoint(await page.evaluate(()=>({x:OPW.x+15,y:OPW.y+15})));await page.evaluate(()=>fitRoom('robotTop'));await clickPoint({x:dock.x+dock.w/2,y:dock.y+dock.h/2});
  assert.equal(await page.evaluate(()=>opPlateMounted()),true);assert.equal(await page.evaluate(()=>S.setup.opPlate),null);assert.equal(await page.evaluate(()=>UI.carry),null);
  assert.deepEqual(await page.evaluate(()=>[opPlaced(),nOpNuts(),nEmergencyCaps()]),[11,10,1]);
  await page.evaluate(()=>undo());assert.equal(await page.evaluate(()=>opPlateMounted()),false);assert.equal(await page.evaluate(()=>opAssemblyComplete()),true);
});

test('removing a nut leaves its body in place and emergency caps come off before their nut',async()=>{
  await page.evaluate(()=>{setMode('free',pClone(pracRef()));S.finished=true;LIVE.inp.mcb=false;S.tool='hand';S.opBack=false;renderAll();fitOp();});
  await clickPoint(await hole('h1'));assert.equal(await page.evaluate(()=>UI.carry),null);assert.equal(await page.evaluate(()=>S.op.dev.h1),'lampW');
  await clickPoint(await hole('h6'));assert.equal(await page.evaluate(()=>UI.carry?.key),'emscap');assert.equal(await page.evaluate(()=>S.op.dev.h6),'ems');
  await page.evaluate(()=>returnCarry());await flip();await clickPoint(await hole('h6',14));
  assert.equal(await page.evaluate(()=>UI.carry?.key),'opnut');assert.equal(await page.evaluate(()=>S.op.dev.h6),'ems');assert.equal(await page.evaluate(()=>!!S.op.nuts.h6),false);
  await page.evaluate(()=>returnCarry());await flip();await clickPoint(await hole('h6'));assert.equal(await page.evaluate(()=>UI.carry?.key),'ems');
});

test('v2.50 preparation saves split old kits once without losing original items or readiness',async()=>{
  const old=JSON.parse(await readFile(join(__dirname,'fixtures','operator-stock-v250.json'),'utf8'));
  const result=await page.evaluate(old=>{
    setMode('free',pClone(old));const first=JSON.stringify(S),boxes=S.floor.map(looseBounds);fixState();save();
    return{originals:old.floor.every(f=>S.floor.some(g=>g.id===f.id&&g.kind===f.kind&&g.key===f.key)),nuts:S.floor.filter(f=>f.kind==='opnut').length,caps:S.floor.filter(f=>f.kind==='emscap').length,overlap:boxes.some((a,i)=>boxes.slice(i+1).some(b=>rectsOverlap(a,b))),onSurface:S.floor.every(f=>rectOnSurface(looseBounds(f),isOperatorMaterial(f.kind)?'robotTop':'desk')),once:first===JSON.stringify(S),preparing:isPreparing(),plate:JSON.stringify(S.setup.opPlate)===JSON.stringify(old.setup.opPlate),ready:preparedKit('op')};
  },old);
  for(const k of ['originals','onSurface','once','preparing','plate'])assert.equal(result[k],true,k);
  assert.equal(result.nuts,10);assert.equal(result.caps,1);assert.equal(result.overlap,false);assert.deepEqual(result.ready,{n:22,m:22,done:true});
  await page.reload();await page.waitForFunction(()=>window.SIM);assert.deepEqual(await page.evaluate(()=>[S.floor.filter(f=>f.kind==='opnut').length,S.floor.filter(f=>f.kind==='emscap').length]),[10,1]);
});

test('completed v2.51 saves retain score, wiring and their valid transport inspection',async()=>{
  const result=await page.evaluate(()=>{
    const old=pClone(pracRef());setMode('free',old);S.selfChk={'1-4':true};S.usedFill=false;rememberTransportInspection();const sig=JSON.stringify(S.wires),score=scoreSheet().total;
    delete S.operatorAssemblyV;delete S.op.nuts;delete S.op.emsCaps;
    S.transportInspection.core=JSON.stringify([wireSig(),fuseState(),plugMap(),tsetMap(),S.inst,S.servo,S.op.hmi,S.op.dev]);fixState();const first=JSON.stringify(S);fixState();
    return{score:scoreSheet().total,before:score,wiring:sig===JSON.stringify(S.wires),ready:opAssemblyComplete(),inspection:transportInspectionValid(),once:first===JSON.stringify(S)};
  });
  assert.deepEqual(result,{score:30,before:30,wiring:true,ready:true,inspection:true,once:true});
});

test('the visible selector tip still operates both ways with its retaining nut fitted',async()=>{
  await page.evaluate(()=>{setMode('free',pClone(pracRef()));S.opBack=false;S.tool='hand';S.finished=true;LIVE.inp.mcb=true;buildTerms();liveStep(0);renderAll();fitOp();});
  for(let i=0;i<2;i++){
    const state=await page.evaluate(()=>{const before=LIVE.inp.ss,a=(before==='A'?40:-40)*Math.PI/180,[x,y]=OP.holes.v3;return{before,p:{x:OPW.x+x-16.5*Math.sin(a),y:OPW.y+y+16.5*Math.cos(a)}};});
    await clickPoint(state.p);assert.notEqual(await page.evaluate(()=>LIVE.inp.ss),state.before);
  }
});

test('operator openings are transparent through all material layers on front, rear and preparation sheet',async()=>{
  const result=await page.evaluate(async()=>{
    const checks=[];
    for(const materials of [true,false]){SET.materials=materials;
      for(const back of [false,true]){
        const source=operatorSheet(back),xml='<svg xmlns="http://www.w3.org/2000/svg" width="375" height="270">'+source+'</svg>',url=URL.createObjectURL(new Blob([xml],{type:'image/svg+xml'})),img=new Image();img.src=url;await img.decode();
        const canvas=document.createElement('canvas');canvas.width=375;canvas.height=270;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);URL.revokeObjectURL(url);
        const [hx,hy]=OP.holes.h1,x=back?OP.w-hx:hx,cut=back?OP.w-OP.cut.x-OP.cut.w:OP.cut.x;
        checks.push({hole:ctx.getImageData(x,hy,1,1).data[3],cut:ctx.getImageData(cut+OP.cut.w/2,OP.cut.y+OP.cut.h/2,1,1).data[3],metal:ctx.getImageData(10,10,1,1).data[3],open:source.includes('data-operator-cutouts="open"')});
      }
    }
    return{checks,prep:prepPlateMarkup('opplate',hmiPrepPosition()).includes('data-operator-cutouts="open"')};
  });
  assert.equal(result.prep,true);for(const r of result.checks){assert.equal(r.hole,0);assert.equal(r.cut,0);assert.ok(r.metal>0);assert.equal(r.open,true);}
});
