const{test,before,after,beforeEach,afterEach}=require('node:test');const assert=require('node:assert/strict');const{readFile}=require('node:fs/promises');const{createServer}=require('node:http');const{chromium}=require('playwright');let browser,server,page,context,origin,errors;
before(async()=>{const html=await readFile(require('node:path').join(__dirname,'..','index.html'));server=createServer((q,r)=>r.end(html));await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});});
after(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
beforeEach(async()=>{context=await browser.newContext({viewport:{width:1600,height:1000}});await context.route('https://fonts.googleapis.com/**',r=>r.abort());await context.route('https://fonts.gstatic.com/**',r=>r.abort());page=await context.newPage();errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.waitForFunction(()=>window.SIM);await page.evaluate(()=>{clearInterval(LIVE.timer);setMode('free',newState(false));});await page.waitForTimeout(80);});
afterEach(async()=>{await context.close();assert.deepEqual(errors,[]);});
async function workPoint(x,y){return page.evaluate(({x,y})=>{const p=projectWorkPoint({x,y}),r=svg.getBoundingClientRect();return{x:r.left+(p.x-UI.cam.x)/UI.cam.w*r.width,y:r.top+(p.y-UI.cam.y)/UI.cam.h*r.height};},{x,y});}
async function reference(){await page.evaluate(()=>{setMode('free',pClone(pracRef()));S.usedFill=false;S.elapsed=1000;S.selfChk={'1-4':true};renderAll();});await page.waitForTimeout(80);}

test('all four grid cells fit uniformly and allow continuous pan beyond a focused surface',async()=>{
 for(const size of [{width:1600,height:1000},{width:2560,height:900},{width:390,height:844}]){await page.setViewportSize(size);for(const id of ['desk','floor','robot','robotTop']){
  const state=await page.evaluate(id=>{fitRoom(id);const a=roomArea(id),r=svg.getBoundingClientRect(),before={...UI.cam},matrix=svg.getScreenCTM();UI.cam.x+=500;UI.cam.y-=500;UI.cam.w*=2;constrainRoomCamera();applyCam();return{a,before,after:{...UI.cam},aspect:UI.cam.w/UI.cam.h-r.width/r.height,scale:matrix.a/matrix.d,origin:{x:ROOM_X,y:ROOM_Y},clip:$('#workspaceScene').getAttribute('clip-path')};},id);
  assert.notDeepEqual(state.after,state.before);assert.ok(Math.abs(state.scale-1)<.0001);assert.ok(Math.abs(state.aspect)<.0001);const c=state.before,a=state.a;assert.ok(c.x+state.origin.x<=a.x+.01&&c.y+state.origin.y<=a.y+.01&&c.x+c.w+state.origin.x>=a.x+a.w-.01&&c.y+c.h+state.origin.y>=a.y+a.h-.01);assert.equal(state.clip,null);
 }}
});

test('opening menus overlays the full canvas without stretching, moving or resizing its scene',async()=>{
 await reference();await page.evaluate(()=>{S.controllerRight=true;renderWorld(false);fitRoom('robot');});
 const read=()=>page.evaluate(()=>{const r=svg.getBoundingClientRect(),c=$('[data-station-controller]').getBoundingClientRect(),m=svg.getScreenCTM();return{canvas:{x:r.x,y:r.y,w:r.width,h:r.height},body:{x:c.x,y:c.y,w:c.width,h:c.height},cam:{...UI.cam},scale:m.a/m.d,state:JSON.stringify({...S,elapsed:0}),score:scoreSheet().total};});
 const initial=await read();for(const id of ['togTray','togSide','togTray','togSide']){await page.locator('#'+id).click();await page.waitForTimeout(390);const next=await read();assert.deepEqual(next.canvas,initial.canvas);assert.deepEqual(next.body,initial.body);assert.deepEqual(next.cam,initial.cam);assert.equal(next.state,initial.state);assert.equal(next.score,30);assert.ok(Math.abs(next.scale-1)<.0001);}
 const controls=await page.evaluate(()=>{const l=$('.tray').getBoundingClientRect(),r=$('.side').getBoundingClientRect(),z=$('.zoom').getBoundingClientRect();return z.left>=l.right&&z.right<=r.left;});assert.equal(controls,true);
 await page.evaluate(()=>{zoomAt(svg.getBoundingClientRect().width/2,400,.6);flushCamera();endCameraGesture();});const zoomed=await read();await page.locator('#togTray').click();await page.waitForTimeout(390);assert.deepEqual((await read()).body,zoomed.body);
 await page.waitForFunction(()=>frameAtlasCovers(UI.cam)||FRAME_STREAM.disabled);assert.equal(await page.evaluate(()=>FRAME_STREAM.disabled),false);await page.evaluate(()=>{beginCameraGesture();requestCamera(svg.getBoundingClientRect());});await page.waitForFunction(()=>FRAME_STREAM.active);const ratio=await page.evaluate(()=>(FRAME_STREAM.canvas.width/UI.cam.w)/(FRAME_STREAM.canvas.height/UI.cam.h));assert.ok(Math.abs(ratio-1)<.002);await page.evaluate(()=>endCameraGesture());
 await page.locator('#btnCirc').click();await page.locator('#circ [data-c="big"]').click();const visible=await page.evaluate(()=>{const r=$('#circ').getBoundingClientRect(),i=boardInsets(),b=svg.getBoundingClientRect();return r.left>=b.left+i.left&&r.right<=b.right-i.right;});assert.equal(visible,true);await page.locator('#circ [data-c="x"]').click();
});

test('an explicit overview selection is not replaced by a pending initial room fit',async()=>{
 await page.evaluate(()=>{setMode('free',newState(false));fit();});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>UI.roomFocus),null);
 await page.evaluate(()=>{fdEnter(fdBuild([5]));fitAvoid(span2('R4.14','TB.14.t'));window.manualFaultView={...UI.cam};});await page.waitForTimeout(100);assert.deepEqual(await page.evaluate(()=>UI.cam),await page.evaluate(()=>window.manualFaultView));
 await page.evaluate(()=>fdEnter(fdBuild([5])));await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>UI.roomFocus),'desk');
 await page.evaluate(()=>{PRAC.L=null;const l=LESSONS.find(l=>l.keys.includes('mount'));localStorage.setItem(STORE_PRAC,JSON.stringify({done:Object.fromEntries(LESSONS.map(l=>[l.id,1000]))}));pracStart(l.id);fit();});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>UI.roomFocus),null);
});

test('continuous map navigation removes dwell arrows and keeps held stock while panning and zooming',async()=>{
 await page.evaluate(()=>{UI.carry={kind:'dev',key:'mcb',count:1};fitRoom('desk');});
 assert.equal(await page.locator('.room-nav').count(),0);
 const before=await page.evaluate(()=>({state:JSON.stringify({...S,elapsed:0}),carry:JSON.stringify(UI.carry),cam:{...UI.cam}}));
 await page.evaluate(()=>{const r=svg.getBoundingClientRect();UI.cam.x+=ROOM.width;UI.cam.y+=800;requestCamera(r);flushCamera();zoomAt(r.left+r.width/2,r.top+r.height/2,.6);flushCamera();endCameraGesture();});
 const after=await page.evaluate(()=>({state:JSON.stringify({...S,elapsed:0}),carry:JSON.stringify(UI.carry),cam:{...UI.cam},clip:$('#workspaceScene').getAttribute('clip-path')}));assert.equal(after.state,before.state);assert.equal(after.carry,before.carry);assert.notDeepEqual(after.cam,before.cam);assert.equal(after.clip,null);
});

test('grabbing the middle carries the plate directly from the floor to the desk above and undo restores it',async()=>{
 await page.locator('#togTray').click();await page.locator('#togSide').click();await page.waitForTimeout(390);
 await page.evaluate(()=>{S.tool='hand';fit();});const p=await workPoint(400,300),target=await page.evaluate(()=>{const r=svg.getBoundingClientRect();return{x:r.left+(ROOM.deskPanelX+400-ROOM_X-UI.cam.x)/UI.cam.w*r.width,y:r.top+(ROOM.deskPanelY+300-ROOM_Y-UI.cam.y)/UI.cam.h*r.height};});
 await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:8});assert.equal(await page.evaluate(()=>UI.gesture?.type),'panelmove');await page.mouse.up();
 const state=await page.evaluate(()=>({pos:S.panelPos,place:panelWorkplace(),gesture:UI.gesture,wood:{x:S.wood.x+ROOM_X,y:S.wood.y+ROOM_Y}}));assert.ok(Math.abs(state.pos.x)<1);assert.ok(Math.abs(state.pos.y+880)<1);assert.equal(state.place,'desk');assert.equal(state.gesture,null);assert.ok(Math.abs(state.wood.x-380)<1e-8&&Math.abs(state.wood.y-300)<1e-8);await page.evaluate(()=>undo());assert.deepEqual(await page.evaluate(()=>S.panelPos),{x:0,y:0});
});

test('an inspected plate moves across the continuous grid and docks with its work intact',async()=>{
 await reference();await page.locator('#togTray').click();await page.locator('#togSide').click();await page.waitForTimeout(390);
 const before=await page.evaluate(()=>{disconnectForTransport();fit();return{wires:JSON.stringify(S.wires),inst:JSON.stringify(S.inst)};});const p=await workPoint(400,300),target=await page.evaluate(()=>{const d=panelDockPosition(),r=svg.getBoundingClientRect();return{x:r.left+(d.x+400-ROOM_X-UI.cam.x)/UI.cam.w*r.width,y:r.top+(d.y+300-ROOM_Y-UI.cam.y)/UI.cam.h*r.height};});await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:8});await page.mouse.up();const after=await page.evaluate(()=>({docked:S.panelDocked,score:scoreSheet().total,wires:JSON.stringify(S.wires),inst:JSON.stringify(S.inst),connected:panelExternalConnected()}));assert.equal(after.docked,true);assert.equal(after.score,30);assert.equal(after.wires,before.wires);assert.equal(after.inst,before.inst);assert.equal(after.connected,false);
});

test('clicking a device still operates it while dragging the same plate can start inside the populated surface',async()=>{
 await reference();const pos=await page.evaluate(()=>({...S.panelPos})),handle=await page.evaluate(()=>{const i=S.inst.find(i=>i.type==='mcb'),r=mcbSwRect(i);return{x:r.x+r.w/2,y:r.y+r.h/2};}),p=await workPoint(handle.x,handle.y);await page.mouse.click(p.x,p.y);assert.equal(await page.evaluate(()=>LIVE.inp.mcb),true);await page.mouse.click(p.x,p.y);assert.equal(await page.evaluate(()=>LIVE.inp.mcb),false);assert.deepEqual(await page.evaluate(()=>S.panelPos),pos);assert.equal(await page.evaluate(()=>UI.carry),null);
});

test('external connections block carrying, disconnecting preserves the passed inspection, and real circuit changes invalidate it',async()=>{
 await reference();const before=await page.evaluate(()=>({...S.panelPos})),p=await workPoint(400,330);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+30,p.y+15);await page.mouse.up();assert.deepEqual(await page.evaluate(()=>S.panelPos),before);assert.match(await page.locator('#toast').textContent(),/연결.*해제/);
 await page.evaluate(()=>{LIVE.inp.mcb=true;});await page.locator('#zUnplug').click();assert.equal(await page.evaluate(()=>panelExternalConnected()),true);await page.evaluate(()=>{LIVE.inp.mcb=false;});await page.locator('#zUnplug').click();
 assert.deepEqual(await page.evaluate(()=>({connected:panelExternalConnected(),passed:inspectionPassed(),score:scoreSheet().total,leadCount:Object.keys(S.convLeads).length,plug:S.cables.plugged})),{connected:false,passed:true,score:30,leadCount:0,plug:false});
 await page.evaluate(()=>save());await page.reload();await page.waitForFunction(()=>window.SIM);assert.equal(await page.evaluate(()=>transportInspectionValid()&&scoreSheet().total===30),true);
 assert.equal(await page.evaluate(()=>{S.cables.powerLeads={R:'TB.2.b'};buildTerms();return transportInspectionValid();}),false);await page.evaluate(()=>{S.cables.powerLeads={};S.wires.pop();buildTerms();});assert.equal(await page.evaluate(()=>inspectionPassed()),false);
});

test('the fixed five-socket grounded strip stays in the floor upper-right and accepts a plug in every socket',async()=>{
 await reference();if(await page.locator('#togSide').getAttribute('aria-expanded')==='true')await page.locator('#togSide').click();await page.waitForTimeout(380);await page.evaluate(()=>{S.cables.plugged=false;renderAll();fitRoom('floor');});
 assert.equal(await page.locator('[data-outlet-port]').count(),5);assert.equal(await page.evaluate(()=>trayItems().some(i=>i.key==='outlet')),false);
 const strip=await page.evaluate(()=>({r:powerStripRect(),a:roomArea('floor'),origin:{x:ROOM_X,y:ROOM_Y}}));assert.ok(strip.r.x+strip.origin.x>strip.a.x+strip.a.w/2);assert.ok(strip.r.y+strip.origin.y<strip.a.y+60);
 for(let i=0;i<5;i++){await page.evaluate(()=>{UI.powerPlug=true;S.cables.plugged=false;});const point=await page.evaluate(i=>powerStripSocket(i),i),screen=await workPoint(point.x,point.y);await page.mouse.click(screen.x,screen.y);assert.equal(await page.evaluate(()=>S.cables.outletPort),i);assert.equal(await page.evaluate(()=>S.cables.plugged),true);}
 await page.evaluate(()=>{S.cables.plugged=false;UI.powerPlug=false;});const point=await page.evaluate(()=>powerStripSocket(2)),screen=await workPoint(point.x,point.y);await page.mouse.click(screen.x,screen.y);assert.equal(await page.evaluate(()=>UI.carry),null);assert.equal(await page.locator('[data-power-strip]').getAttribute('data-fixed-surface'),'floor');
});

test('loose devices can touch and snap to the nearer side without intersecting each other',async()=>{
 const result=await page.evaluate(()=>{setMode('free',newPreparationState());const x=ROOM.deskLeft+600,y=roomTop('desk')+300;trayTap('fuse');drop({x,y});drop({x:x+5,y});trayTap('mcb');drop({x:x-5,y});return S.floor.map(f=>({key:f.key,...floorRect(f)}));});assert.equal(result.length,3);const fuse=result.filter(f=>f.key==='fuse');assert.ok(Math.abs(fuse[0].x+fuse[0].w-fuse[1].x)<.1);const m=result.find(f=>f.key==='mcb');assert.ok(Math.abs(m.x+m.w-fuse[0].x)<.1);
 const physical=await page.evaluate(()=>{const a=S.floor;return a.every((f,i)=>a.slice(i+1).every(g=>!rectsOverlap(looseBounds(f),looseBounds(g))));});assert.equal(physical,true);
});

test('four clamps close through the profile depth and their visible horizontal handles release the correct clamp',async()=>{
 await reference();await page.evaluate(()=>{disconnectForTransport();S.panelDocked=true;const d=panelDockPosition();positionPanel(d.x,d.y);S.mountClamps=Object.fromEntries(MOUNT_SLOTS.map(s=>[s.id,true]));renderAll();fitRoom('robot');});
 const geometry=await page.evaluate(()=>MOUNT_SLOTS.map(s=>{const m=mountClampModel(s),a=stationPoint(...m.barAxis[0]),b=stationPoint(...m.barAxis[1]),cross=Math.abs((b.x-a.x)*(500-a.y)-(b.y-a.y)*(1200-a.x))/Math.hypot(b.x-a.x,b.y-a.y);return{cross,front:m.steelContact.every(p=>Math.abs(p[2]-.4975)<1e-8),back:m.profileContact.every(p=>Math.abs(p[2]-.565)<1e-8),x:m.steelContact.map(p=>p[0]),rearX:m.profileContact.map(p=>p[0])};}));for(const g of geometry){assert.ok(g.cross<.01);assert.equal(g.front,true);assert.equal(g.back,true);assert.deepEqual(g.x,g.rearX);}
 const handles=await page.locator('[data-mount-clamp] [data-clamp-part="grip"]').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return r.width/r.height;}));assert.ok(handles.every(r=>r>3));
 for(const flat of [false,true]){if(flat)await page.evaluate(()=>{undo();closeModal();for(const k of GRAPHICS_KEYS)SET[k]=false;applyGraphics();renderAll();fitRoom('robot');});const box=await page.locator('[data-mount-clamp="lt"] [data-clamp-part="trigger"]').boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);assert.equal(await page.evaluate(()=>nMountClamps()),3);assert.equal(await page.evaluate(()=>UI.carry?.key),'quickClamp');}
});


test('photo-based controller terminals select their displayed connection point after zooming without changing the tested circuit',async()=>{
 await reference();await page.evaluate(()=>{S.controllerRight=true;S.tool='wire';renderWorld(false);fitRoom('robot');});const before=await page.evaluate(()=>JSON.stringify(S.wires));
 const click=async()=>{const r=await page.locator('[data-controller-terminal="4.2"] circle').boundingBox();await page.mouse.click(r.x+r.width/2,r.y+r.height/2);assert.deepEqual(await page.evaluate(()=>UI.controllerPin&&{bank:UI.controllerPin.bank,pin:UI.controllerPin.pin}),{bank:4,pin:2});assert.equal(await page.evaluate(()=>S.controllerRight),true);};await click();
 await page.evaluate(()=>{const p=controllerTerminalPoint(4,2);fitTo({x:p.x-130,y:p.y-140,w:260,h:280});});await click();assert.equal(await page.locator('[data-controller-selected-pin]').count(),1);assert.equal(await page.evaluate(()=>JSON.stringify(S.wires)),before);assert.equal(await page.evaluate(()=>scoreSheet().total),30);
});

test('real v2.49 row saves move each surface once and preserve completed, transported and preparing work',async()=>{
 const fixtures=JSON.parse(await readFile(require('node:path').join(__dirname,'fixtures','room-v249.json'),'utf8'));
 const result=await page.evaluate(fixtures=>{
  const rows=[];
  for(const[key,old]of Object.entries(fixtures)){
   setMode('free',pClone(old));const first=JSON.stringify(S),stock=JSON.stringify(S.floor.map(f=>({id:f.id,key:f.key,kind:f.kind})));fixState();
   const expected=key==='mounted'?{x:1480,y:100}:{x:0,y:key==='completed'?-880:0};
   const local=S.floor.every(f=>rectOnSurface(looseBounds(f),f.kind==='op'?'robotTop':'desk'));
   rows.push({key,once:first===JSON.stringify(S),pos:JSON.stringify(S.panelPos)===JSON.stringify(expected),stock:stock===JSON.stringify(old.floor.map(f=>({id:f.id,key:f.key,kind:f.kind}))),local,wires:JSON.stringify(S.wires)===JSON.stringify(old.wires),inst:JSON.stringify(S.inst)===JSON.stringify(old.inst),score:scoreSheet().total,passed:key==='mounted'?transportInspectionValid():key==='completed'?judgeRan():isPreparing(),clamps:nMountClamps(),grid:S.gridV});
  }
  save();return rows;
 },fixtures);
 for(const row of result){for(const key of ['once','pos','stock','local','wires','inst','passed'])assert.equal(row[key],true,row.key+'.'+key);assert.equal(row.grid,1);assert.equal(row.clamps,row.key==='mounted'?4:0);if(row.key!=='preparing')assert.equal(row.score,30);}
 const before=await page.evaluate(()=>JSON.stringify({...S,setup:{...S.setup,elapsed:0}}));await page.reload();await page.waitForFunction(()=>window.SIM);assert.equal(await page.evaluate(()=>JSON.stringify({...S,setup:{...S.setup,elapsed:0}})),before);
});

test('tucked helical harness reaches the HMI above the mounted plate with finite aligned forward and inverse points',async()=>{
 await reference();const result=await page.evaluate(()=>{
  disconnectForTransport();S.panelDocked=true;const d=panelDockPosition();positionPanel(d.x,d.y);S.opBack=true;S.helical=2;buildTerms();renderAll();fit();
  const route=dockRoute(),curves=installedBandCurves(dockScale()),end=curves.at(-1).at(-1),start=curves[0][0];
  const errors=route.pts.map(([x,y])=>{const display=dockBandPoint({x,y}),back=dockInputPoint(display);return Math.hypot(back.x-x,back.y-y);});
  const paths=[...SCENE_PARTS.get('band-external').querySelectorAll('path')].map(p=>p.getAttribute('d'));
  const wires=S.wires.filter(isExtWire).map(w=>frontWirePts(w,S.wires.indexOf(w),opFrontTerms()));
  return{above:OPW.y+OP.h<0,end:Math.hypot(end[0]-(OPW.x+OP.cut.x+OP.cut.w/2),end[1]-(OPW.y+OP.h+55)),rises:curves.flat().every(p=>p[1]<=start[1]),finite:curves.flat().flat().every(Number.isFinite)&&wires.flat(2).every(Number.isFinite),aligned:Math.max(...errors),paint:paths.length>0&&paths.every(p=>!p.includes('NaN')),score:scoreSheet().total,clip:$('#workspaceScene').getAttribute('clip-path')};
 });assert.equal(result.above,true);assert.equal(result.rises,true);assert.ok(result.end<.001);assert.equal(result.finite,true);assert.ok(result.aligned<.5,JSON.stringify(result));assert.equal(result.paint,true);assert.equal(result.score,30);assert.equal(result.clip,null);
});

test('real pointer gather, full wrapping and upper exit tucking work across the grid seam',async()=>{
 await reference();await page.locator('#togTray').click();await page.locator('#togSide').click();await page.waitForTimeout(390);
 const before=await page.evaluate(()=>{S.helical=0;S.hgath=[];S.hcov=0;S.opBack=true;S.ties=[];S.tool='hand';for(const[,q]of frList())q.covered=false;buildTerms();renderAll();fit();trayTap('helical');return JSON.stringify(S.wires);});
 const line=await page.evaluate(()=>gatherLine()),a=await workPoint(line[0].x,line[0].y),b=await workPoint(line[1].x,line[1].y);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:10});await page.mouse.up();assert.equal(await page.evaluate(()=>allGathered()),true);
 const path=await page.evaluate(()=>bundleR()),start=await workPoint(...path[0]);await page.mouse.move(start.x,start.y);await page.mouse.down();assert.equal(await page.evaluate(()=>UI.gesture?.type),'hpush');
 for(const q of path.slice(1)){const p=await workPoint(...q);await page.mouse.move(p.x,p.y,{steps:3});}await page.mouse.up();assert.equal(await page.evaluate(()=>S.helical),1);
 await page.evaluate(()=>{S.tool='hand';fitTo({x:HOLE.x-150,y:HOLE.y-150,w:300,h:300});});const exit=await workPoint(700,3);await page.mouse.click(exit.x,exit.y);assert.equal(await page.evaluate(()=>S.helical),2);assert.equal(await page.evaluate(()=>JSON.stringify(S.wires)),before);
 await page.reload();await page.waitForFunction(()=>window.SIM);assert.equal(await page.evaluate(()=>S.helical),2);assert.equal(await page.evaluate(()=>JSON.stringify(S.wires)),before);
});
