const{test,before,after,beforeEach,afterEach}=require('node:test');const assert=require('node:assert/strict');const{readFile}=require('node:fs/promises');const{createServer}=require('node:http');const{chromium}=require('playwright');let browser,server,page,context,origin,errors;
before(async()=>{const html=await readFile(require('node:path').join(__dirname,'..','index.html'));server=createServer((q,r)=>r.end(html));await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});});
after(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
beforeEach(async()=>{context=await browser.newContext({viewport:{width:1600,height:1000}});await context.route('https://fonts.googleapis.com/**',r=>r.abort());await context.route('https://fonts.gstatic.com/**',r=>r.abort());page=await context.newPage();errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.waitForFunction(()=>window.SIM);await page.evaluate(()=>{clearInterval(LIVE.timer);setMode('free',newState(false));});await page.waitForTimeout(80);});
afterEach(async()=>{await context.close();assert.deepEqual(errors,[]);});
async function workPoint(x,y){return page.evaluate(({x,y})=>{const p=projectWorkPoint({x,y}),r=svg.getBoundingClientRect();return{x:r.left+(p.x-UI.cam.x)/UI.cam.w*r.width,y:r.top+(p.y-UI.cam.y)/UI.cam.h*r.height};},{x,y});}
async function reference(){await page.evaluate(()=>{setMode('free',pClone(pracRef()));S.usedFill=false;S.elapsed=1000;S.selfChk={'1-4':true};renderAll();});await page.waitForTimeout(80);}

test('all cells fit without distortion and lock at maximum zoom-out on desktop, ultrawide and mobile',async()=>{
 for(const size of [{width:1600,height:1000},{width:2560,height:900},{width:390,height:844}]){await page.setViewportSize(size);for(const id of ['desk','floor','robot','robotTop']){
  const state=await page.evaluate(id=>{fitRoom(id);const a=roomArea(id),r=svg.getBoundingClientRect(),read=()=>({...UI.cam}),before=read(),matrix=svg.getScreenCTM();UI.cam.x+=500;UI.cam.y-=500;UI.cam.w*=2;constrainRoomCamera();applyCam();return{a,before,after:read(),aspect:UI.cam.w/UI.cam.h-r.width/r.height,scale:matrix.a/matrix.d,origin:{x:ROOM_X,y:ROOM_Y},backdrop:$('#roomBackdrop').style.display};},id);
  assert.deepEqual(state.after,state.before);assert.ok(Math.abs(state.scale-1)<.0001);assert.ok(Math.abs(state.aspect)<.0001);const c=state.before,a=state.a;assert.ok(c.x+state.origin.x<=a.x+.01&&c.y+state.origin.y<=a.y+.01&&c.x+c.w+state.origin.x>=a.x+a.w-.01&&c.y+c.h+state.origin.y>=a.y+a.h-.01);assert.notEqual(state.backdrop,'none');
 }}
});

test('opening menus overlays the full canvas without stretching, moving or resizing its scene',async()=>{
 await reference();await page.evaluate(()=>{S.controllerRight=true;renderWorld(false);fitRoom('robot');});
 const read=()=>page.evaluate(()=>{const r=svg.getBoundingClientRect(),c=$('[data-station-controller]').getBoundingClientRect(),m=svg.getScreenCTM();return{canvas:{x:r.x,y:r.y,w:r.width,h:r.height},body:{x:c.x,y:c.y,w:c.width,h:c.height},cam:{...UI.cam},scale:m.a/m.d,state:JSON.stringify({...S,elapsed:0}),score:scoreSheet().total};});
 const initial=await read();for(const id of ['togTray','togSide','togTray','togSide']){await page.locator('#'+id).click();await page.waitForTimeout(390);const next=await read();assert.deepEqual(next.canvas,initial.canvas);assert.deepEqual(next.body,initial.body);assert.deepEqual(next.cam,initial.cam);assert.equal(next.state,initial.state);assert.equal(next.score,30);assert.ok(Math.abs(next.scale-1)<.0001);}
 const controls=await page.evaluate(()=>{const l=$('.tray').getBoundingClientRect(),r=$('.side').getBoundingClientRect(),a=$('#roomPrev').getBoundingClientRect(),b=$('#roomNext').getBoundingClientRect(),z=$('.zoom').getBoundingClientRect();return a.left>=l.right&&b.right<=r.left&&z.right<=r.left;});assert.equal(controls,true);
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

test('yellow arrow ring visibly advances during its full second and starts fresh after leaving',async()=>{
 await page.evaluate(()=>fitRoom('desk'));const arrow=page.locator('#roomNext');await arrow.hover();await page.waitForTimeout(180);const first=await arrow.locator('circle').evaluate(n=>parseFloat(getComputedStyle(n).strokeDashoffset));await page.waitForTimeout(350);const second=await arrow.locator('circle').evaluate(n=>parseFloat(getComputedStyle(n).strokeDashoffset));assert.ok(first>second+20);assert.equal(await page.evaluate(()=>UI.roomFocus),'desk');await page.mouse.move(80,100);await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>UI.roomFocus),'desk');await arrow.hover();await page.waitForFunction(()=>UI.roomFocus==='floor');await page.waitForTimeout(1100);assert.equal(await page.evaluate(()=>UI.roomFocus),'floor');
});

test('grabbing the middle of the plate can carry it through a captured one-second arrow hover without dropping',async()=>{
 await page.evaluate(()=>{S.tool='hand';fitRoom('floor');});const p=await workPoint(400,300),nav=await page.locator('#roomPrev').boundingBox();await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(nav.x+nav.width/2,nav.y+nav.height/2,{steps:5});await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>UI.roomFocus),'floor');assert.equal(await page.evaluate(()=>UI.gesture?.type),'panelmove');await page.waitForFunction(()=>UI.roomFocus==='desk');assert.equal(await page.evaluate(()=>UI.gesture?.moved),true);
 const target=await page.evaluate(()=>{const r=svg.getBoundingClientRect(),a={x:ROOM.deskPanelX+400,y:ROOM.deskPanelY+300};return{x:r.left+(a.x-(UI.cam.x+ROOM_X))/UI.cam.w*r.width,y:r.top+(a.y-(UI.cam.y+ROOM_Y))/UI.cam.h*r.height};});await page.mouse.move(target.x,target.y,{steps:6});await page.mouse.up();
 const state=await page.evaluate(()=>({pos:S.panelPos,room:UI.roomFocus,gesture:UI.gesture,wood:{x:S.wood.x+ROOM_X,y:S.wood.y+ROOM_Y}}));assert.ok(Math.abs(state.pos.x+1200)<1);assert.ok(Math.abs(state.pos.y+80)<1);assert.equal(state.room,'desk');assert.equal(state.gesture,null);assert.ok(Math.abs(state.wood.x-380)<1e-8&&Math.abs(state.wood.y-300)<1e-8);await page.evaluate(()=>undo());assert.deepEqual(await page.evaluate(()=>S.panelPos),{x:0,y:0});
});

test('an inspected plate stays held across two right-arrow transitions and docks with its work intact',async()=>{
 await reference();const before=await page.evaluate(()=>{disconnectForTransport();fitRoom('desk');return{wires:JSON.stringify(S.wires),inst:JSON.stringify(S.inst)};});const p=await workPoint(400,300);await page.mouse.move(p.x,p.y);await page.mouse.down();
 for(const room of ['floor','robot']){const box=await page.locator('#roomNext').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2,{steps:6});await page.waitForFunction(room=>UI.roomFocus===room,room);assert.equal(await page.evaluate(()=>UI.gesture?.type),'panelmove');if(room==='floor'){const b=await page.locator('#board').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:5});}}
 const target=await page.evaluate(()=>{const d=panelDockPosition(),r=svg.getBoundingClientRect();return{x:r.left+(d.x+400-ROOM_X-UI.cam.x)/UI.cam.w*r.width,y:r.top+(d.y+300-ROOM_Y-UI.cam.y)/UI.cam.h*r.height};});await page.mouse.move(target.x,target.y,{steps:6});await page.mouse.up();const after=await page.evaluate(()=>({docked:S.panelDocked,score:scoreSheet().total,wires:JSON.stringify(S.wires),inst:JSON.stringify(S.inst),connected:panelExternalConnected()}));assert.equal(after.docked,true);assert.equal(after.score,30);assert.equal(after.wires,before.wires);assert.equal(after.inst,before.inst);assert.equal(after.connected,false);
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
 await reference();await page.evaluate(()=>{S.cables.plugged=false;renderAll();fitRoom('floor');});
 assert.equal(await page.locator('[data-outlet-port]').count(),5);assert.equal(await page.evaluate(()=>trayItems().some(i=>i.key==='outlet')),false);
 const strip=await page.evaluate(()=>({r:powerStripRect(),a:roomArea('floor'),origin:{x:ROOM_X,y:ROOM_Y}}));assert.ok(strip.r.x+strip.origin.x>strip.a.x+strip.a.w/2);assert.ok(strip.r.y+strip.origin.y<strip.a.y+60);
 for(let i=0;i<5;i++){await page.evaluate(()=>{UI.powerPlug=true;S.cables.plugged=false;});const point=await page.evaluate(i=>powerStripSocket(i),i),screen=await workPoint(point.x,point.y);await page.mouse.click(screen.x,screen.y);assert.equal(await page.evaluate(()=>S.cables.outletPort),i);assert.equal(await page.evaluate(()=>S.cables.plugged),true);}
 await page.evaluate(()=>{S.cables.plugged=false;UI.powerPlug=false;});const point=await page.evaluate(()=>powerStripSocket(2)),screen=await workPoint(point.x,point.y);await page.mouse.click(screen.x,screen.y);assert.equal(await page.evaluate(()=>UI.carry),null);assert.equal(await page.locator('[data-power-strip]').getAttribute('data-fixed-surface'),'floor');
});

test('loose devices can touch and snap to the nearer side without intersecting each other',async()=>{
 const result=await page.evaluate(()=>{setMode('free',newPreparationState());const x=ROOM.deskLeft+600,y=200;trayTap('fuse');drop({x,y});drop({x:x+5,y});trayTap('mcb');drop({x:x-5,y});return S.floor.map(f=>({key:f.key,...floorRect(f)}));});assert.equal(result.length,3);const fuse=result.filter(f=>f.key==='fuse');assert.ok(Math.abs(fuse[0].x+fuse[0].w-fuse[1].x)<.1);const m=result.find(f=>f.key==='mcb');assert.ok(Math.abs(m.x+m.w-fuse[0].x)<.1);
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
