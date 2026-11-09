import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { WalkingView } from './walking.mjs';
import { buildDetails } from './details.mjs';

const $ = s => document.querySelector(s);
document.title = '1과제 작업대 · 3D 미리보기';
document.body.classList.add('workshop');
$('.brand .eyebrow').textContent='산업용로봇 1과제 · 가상 작업실';
$('.scene-title').innerHTML = '<span class="dot"></span>TASK 01 / WORKBENCH <small>기존 작업대 배치 그대로</small>';
$('aside').innerHTML = `<div class="panel-intro"><span class="eyebrow">산업용로봇 1과제</span><h2>내 발로 둘러보는 작업실</h2><p>작업대 앞에 서서 걷고, 앉아서 기구를 가까이 살펴봐요.</p></div><div class="walk-settings"><button id="walkMode" class="wide" aria-pressed="true">1인칭으로 걷는 중 · 돌려보기로 전환</button><div class="workspace-actions"><button id="crouch" aria-pressed="false">앉아서 보기</button><button id="bob" aria-pressed="true">걸음 흔들림</button></div><button id="walkHome" class="wide">작업대 앞으로 돌아오기</button><p class="walk-keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 걷기 · 마우스 둘러보기<br><kbd>Shift</kbd> 빠르게 · <kbd>C</kbd> 앉기<br><kbd>E</kbd> 기구 이름 · <kbd>Esc</kbd> 마우스 해제</p></div>
<div class="workspace-actions"><button data-focus="panel">제어판 보기</button><button data-focus="op">조작판 보기</button></div><button class="wide" data-focus="conveyor">컨베이어 보기</button>
<div id="status" role="status" aria-live="polite">작업실 들어가기를 누르면 마우스로 둘러볼 수 있어요.</div>
<div class="readouts"><div><span>제어판</span><b>760 × 600</b></div><div><span>조작판</span><b>375 × 270</b></div></div>
<button id="flipOp" class="wide" aria-pressed="false">조작판 뒷면 보기</button><button id="showWires" class="wide" aria-pressed="false">예제 배선 보기</button>
<details id="help"><summary>작업대 구성과 조작법</summary><p>1인칭: WASD 이동 · 마우스 둘러보기 · C 앉기 · E 이름 확인<br>돌려보기: 왼쪽 드래그 회전<br>휠: 확대·축소<br>휠 버튼 / 오른쪽 드래그: 화면 이동</p><p>제어판 1단: MCB · FS1 · FS2 · SMPS · PLC · POS · 서보 드라이버<br>2단: R1~R6 · T1~T3 · XTB1<br>3단: 40칸 단자대 · XTB2</p><p>오른쪽: HMI · 표시등 · 버튼 · 선택 스위치 · 부저 · 비상정지<br>아래: 500mm 컨베이어 · S1 · S2</p></details>
<a class="circuit-link" href="lab-3d.html?mode=circuit">작은 24V 회로 체험으로 →</a>
<p class="scope">지금은 작업대 모양·배치와 걷기 체험 단계예요. 가로·세로 치수와 배치는 원본 기준이며 기구 높이와 작업실·사람 크기는 시각화용 근사치예요. 조립·배선 편집·전체 회로 동작은 기존 1과제 화면에서 진행해요.</p>`;
const pad=document.createElement('div');pad.className='walk-pad';pad.setAttribute('aria-label','터치 걷기');pad.innerHTML='<button data-walk="KeyW" aria-label="앞으로">↑</button><button data-walk="KeyA" aria-label="왼쪽으로">←</button><button data-walk="KeyS" aria-label="뒤로">↓</button><button data-walk="KeyD" aria-label="오른쪽으로">→</button>';$('#viewport').append(pad);
const data = await fetch('./lab-3d/reference/layout.json').then(r => { if (!r.ok) throw Error('layout'); return r.json(); });
const canvas = $('#scene'), viewport = $('#viewport');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6)); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#bcc5c8'); scene.fog=new THREE.Fog('#bcc5c8',85,150);
const camera = new THREE.PerspectiveCamera(40, 1, .07, 220);
const controls = new OrbitControls(camera, canvas); controls.enableDamping = true; controls.minDistance = 3; controls.maxDistance = 85; controls.maxPolarAngle = Math.PI*.49;
controls.mouseButtons = {LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.PAN};
let dirty = true, back = false, wireVisible = false;
controls.addEventListener('change',()=>{dirty=true});
scene.add(new THREE.HemisphereLight('#eff5fc','#365341',3));
const sun = new THREE.DirectionalLight('#fff5e2',2.2); sun.position.set(-12,30,14); sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048); Object.assign(sun.shadow.camera,{left:-22,right:22,top:22,bottom:-22,near:1,far:70}); sun.shadow.normalBias=.025; scene.add(sun);
const geometry = new THREE.BoxGeometry(1,1,1), materials = new Map(), picks = [];
function material(color) {if(!materials.has(color)) materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.75,metalness:.15}));return materials.get(color)}
function box(x,y,z,w,h,d,color,group=scene,name='') { const o=new THREE.Mesh(geometry,material(color));o.position.set(x,y,z);o.scale.set(w,h,d);o.castShadow=true;o.receiveShadow=true;group.add(o);if(name){o.userData.name=name;picks.push(o)}return o; }
const X = x => (x-620)/50, Z = y => (y-460)/50;
function block(r,height,color,name,group=scene) {return box(X(r.x+r.w/2),height/100,Z(r.y+r.h/2),r.w/50,height/50,r.h/50,color,group,name)}
const manager = new THREE.LoadingManager(), loader = new THREE.TextureLoader(manager);
const textures = new Map();
function texture(file) {if(!textures.has(file)){const t=loader.load('./lab-3d/'+file);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),4);textures.set(file,t)}return textures.get(file)}
function face(r,y,file,group=scene,crop=null) {
 let map=texture(file);
 if(crop){map=map.clone();map.offset.set(crop.x/crop.W,(crop.H-crop.y-crop.h)/crop.H);map.repeat.set(crop.w/crop.W,crop.h/crop.H)}
 const o=new THREE.Mesh(new THREE.PlaneGeometry(r.w/50,r.h/50),new THREE.MeshStandardMaterial({map,transparent:true,roughness:.8,metalness:0,side:THREE.DoubleSide}));
 o.rotation.x=-Math.PI/2;o.position.set(X(r.x+r.w/2),y,Z(r.y+r.h/2));group.add(o);return o;
}
function tag(text,x,y,z,width=2) {
 const c=document.createElement('canvas');c.width=640;c.height=96;const ctx=c.getContext('2d');ctx.fillStyle='#123127';ctx.fillRect(0,0,640,96);ctx.fillStyle='#d4e4d9';ctx.font='600 42px sans-serif';ctx.textAlign='center';ctx.fillText(text,320,63);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const o=new THREE.Sprite(new THREE.SpriteMaterial({map:t}));o.position.set(x,y,z);o.scale.set(width,width*.15,1);scene.add(o);
}
box(0,-.6,1,31,.7,26,'#244e3c');
const gridPoints=[];for(let x=-15.5;x<=15.5;x+=.5)gridPoints.push(x,-.23,-12,x,-.23,14);for(let z=-12;z<=14;z+=.5)gridPoints.push(-15.5,-.23,z,15.5,-.23,z);const grid=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(gridPoints,3)),new THREE.LineBasicMaterial({color:'#426d51'}));scene.add(grid);
// Room and workbench are illustrative; original panel footprints stay unchanged.
box(0,-15.2,0,100,.35,86,'#a4adae');
const floorGrid=new THREE.GridHelper(100,20,'#959fa0','#9da7a8');floorGrid.position.y=-15.01;scene.add(floorGrid);
box(0,14.5,-43,100,59,.5,'#d5dbd9');box(-50,14.5,0,.5,59,86,'#c6d0d0');box(50,14.5,0,.5,59,86,'#c6d0d0');box(0,14.5,43,100,59,.5,'#d5dbd9');
for(const x of [-35,-15,5,25]){box(x,20,-42.65,15,20,.15,'#819caa');box(x,20,-42.5,.18,20,.2,'#dce2e0');box(x,20,-42.5,15,.18,.2,'#dce2e0');}
for(const x of [-14.5,14.5])for(const z of [-11,13])box(x,-8,z,.85,13,.85,'#79868c');
for(const z of [-11,13])box(0,-3,z,29.8,.65,.65,'#7d8a91');
for(const x of [-14.5,14.5])box(x,-10,1,.65,.65,24,'#7d8a91');
block({x:0,y:0,w:760,h:600},5,'#a4adb2','제어판 · 760 × 600 mm');
const detailInfo=buildDetails({scene,box,block,face,material,X,Z,texture,data});
tag('제어판 · 760 × 600',X(380),.5,Z(-45),4.5);
const op=data.op, frontGroup=new THREE.Group(),backGroup=new THREE.Group();scene.add(frontGroup,backGroup);backGroup.visible=false;
block(op,5,'#a4adb2','조작판 · 375 × 270 mm');
face(op,.115,op.front,frontGroup);face(op,.115,op.back,backGroup);
function opPart(x,y,w,h,height,file,group,name){const r={x:op.x+x,y:op.y+y,w,h};block(r,height,'#252b2e',name,group);face(r,height/50+.01,file,group,{x,y,w,h,W:op.w,H:op.h});}
const cut=op.cut;opPart(cut.x-4,cut.y-4,cut.w+8,cut.h+8,23,op.front,frontGroup,'HMI · 앞면');
opPart(op.w-cut.x-cut.w-4,cut.y-4,cut.w+8,cut.h+8,48,op.back,backGroup,'HMI · 뒷면');
for(const [id,[x,y]] of Object.entries(op.holes)){
 const a=op.answer[id],color={lampW:'#e4e8e6',lampR:'#b83230',lampG:'#259948',lampY:'#cfb02e',pbG:'#259948',pbR:'#b83230',ems:'#ba2825',ss:'#292d30',bz:'#c9c9ba'}[a.type];
 const c=new THREE.Mesh(new THREE.CylinderGeometry((a.type==='ems'?14:12.5)/50,(a.type==='ems'?14:12.5)/50,.28,24),material(color));c.position.set(X(op.x+x),.23,Z(op.y+y));c.castShadow=true;c.userData.name=a.sym;picks.push(c);frontGroup.add(c);
 if(a.type==='ss'){const lever=box(X(op.x+x),.43,Z(op.y+y),.10,.18,.48,'#25292b',frontGroup);lever.rotation.y=-.5;}
 if(a.type==='bz')for(let i=-2;i<=2;i++)box(X(op.x+x)+i*.06,.38,Z(op.y+y),.018,.01,.32,'#51554d',frontGroup);
 opPart(op.w-x-13,y-14,26,28,22,op.back,backGroup,`${a.sym} · 뒷면 단자`);
}
tag('조작판 · 375 × 270',X(op.x+op.w/2),.4,Z(op.y-35),3.5);
const cv=data.conveyor;
block({x:cv.x-9,y:cv.y-9,w:cv.L+18,h:cv.w+18},32,'#858f94','컨베이어 · 500 mm');
block({x:cv.x,y:cv.y,w:cv.L,h:cv.w},35,'#1f8a43','컨베이어 벨트');
for(let x=0;x<=cv.L;x+=13)box(X(cv.x+x),.711,Z(cv.y+cv.w/2),.012,.012,cv.w/50,'#2aa457');
block({x:cv.x+cv.mx,y:cv.y-9-cv.mh,w:cv.mw,h:cv.mh},32,'#4f5b58','컨베이어 모터');
for(const [name,pos] of [['S1',cv.s1],['S2',cv.s2]]){block({x:cv.x+pos-10,y:cv.y-45,w:20,h:30},45,'#263e44',`${name} · 센서`);tag(name,X(cv.x+pos),1.15,Z(cv.y-25),.7)}
tag('컨베이어 · 500 mm',X(cv.x+250),.4,Z(cv.y+cv.w+115),3.6);
const wireGroup=new THREE.Group(), opWires=new THREE.Group();scene.add(wireGroup);wireGroup.add(opWires);wireGroup.visible=false;
const wireMat=new THREE.MeshStandardMaterial({color:'#edc22b',roughness:.6});
for(const route of data.routes){const points=route.points.filter((_,i,a)=>i===0||i===a.length-1||i%3===0).map(([x,y])=>new THREE.Vector3(X(x),.94,Z(y)));if(points.length<2)continue;
 const curve=new THREE.CatmullRomCurve3(points,false,'centripetal');const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.min(120,Math.max(16,points.length)),.018,4,false),wireMat);(route.op?opWires:wireGroup).add(mesh);}
let focus='all',walker;
function modeUI(mode){controls.enabled=mode==='orbit';document.body.classList.toggle('walking',mode==='walk');$('#walkMode').setAttribute('aria-pressed',String(mode==='walk'));$('#walkMode').textContent=mode==='walk'?'1인칭으로 걷는 중 · 돌려보기로 전환':'돌려보는 중 · 1인칭으로 걷기';$('.scene-hint').textContent=mode==='walk'?'WASD 이동 · 마우스 둘러보기 · C 앉기 · E 기구 이름 · Esc 해제':'드래그 회전 · 휠 확대 · 휠 버튼 / 오른쪽 드래그 이동';}
function view(type='iso',section=focus){if(walker)walker.setMode('orbit');focus=section;const p=section==='panel'?[-4.8,0,-3.2]:section==='op'?[8,0,-3]:section==='conveyor'?[-5,0,9]:[0,0,1];controls.target.set(...p);
 const dist=section==='all'?1:section==='panel'?.64:.36;const ratio=Math.min(1.7,Math.max(1,1.05/camera.aspect));const v=type==='top'?[0,43,.01]:[20,29,32];camera.position.set(p[0]+v[0]*dist*ratio,p[1]+v[1]*dist*ratio,p[2]+v[2]*dist*ratio);controls.update();dirty=true;}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>view(b.dataset.view==='top'?'top':'iso',b.dataset.view==='close'?'panel':'all')));
document.querySelectorAll('[data-focus]').forEach(b=>b.addEventListener('click',()=>view('iso',b.dataset.focus)));
$('#flipOp').addEventListener('click',()=>{back=!back;frontGroup.visible=!back;backGroup.visible=back;opWires.visible=back;$('#flipOp').textContent=back?'조작판 앞면 보기':'조작판 뒷면 보기';$('#flipOp').setAttribute('aria-pressed',String(back));renderer.shadowMap.needsUpdate=true;dirty=true});
$('#showWires').addEventListener('click',()=>{wireVisible=!wireVisible;wireGroup.visible=wireVisible;opWires.visible=back;$('#showWires').textContent=wireVisible?'예제 배선 숨기기':'예제 배선 보기';$('#showWires').setAttribute('aria-pressed',String(wireVisible));$('#status').textContent=wireVisible?'완성 예제의 경로예요. 배선 편집·동작은 기존 화면을 이용해요.':'기구 배치만 보고 있어요.';dirty=true});
$('#helpToggle').addEventListener('click',()=>{$('#help').open=!$('#help').open;$('#help').scrollIntoView({block:'nearest'})});$('#help').addEventListener('toggle',()=>$('#helpToggle').setAttribute('aria-expanded',String($('#help').open)));
const ray=new THREE.Raycaster();let down=null;
canvas.addEventListener('pointerdown',e=>{if(walker?.mode==='walk')return;down={x:e.clientX,y:e.clientY,id:e.pointerId,button:e.button,moved:false}});
canvas.addEventListener('pointermove',e=>{if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)down.moved=true});
canvas.addEventListener('pointerup',e=>{if(walker?.mode==='walk')return;if(!down||down.id!==e.pointerId||down.button!==0||down.moved){down=null;return}down=null;const r=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);
 const hit=ray.intersectObjects(picks).find(h=>h.object.parent.visible);if(hit)$('#status').textContent=hit.object.userData.name});
for(const ev of ['pointercancel','lostpointercapture'])canvas.addEventListener(ev,()=>{down=null});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
function resize(){const r=viewport.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();dirty=true}
new ResizeObserver(resize).observe(viewport);resize();view();
let failed=false;manager.onError=()=>{failed=true;$('#loading').textContent='기구 그림 일부를 열지 못했어요. 새로고침해 주세요.'};manager.onLoad=()=>{if(!failed)$('#loading').hidden=true;dirty=true};
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();walker?.pause();$('#loading').hidden=false;$('#loading').textContent='3D 표시가 중단됐어요. 새로고침해 주세요.'});
walker=new WalkingView(camera,canvas,{onMode:modeUI,onChange:()=>{dirty=true},onInspect:()=>{
 ray.setFromCamera(new THREE.Vector2(0,0),camera);const hit=ray.intersectObjects(picks).find(h=>h.distance<50&&h.object.parent.visible);$('#status').textContent=hit?hit.object.userData.name:'기구를 화면 가운데에 두고 조금 가까이 가보세요.';
}});scene.add(walker.body);walker.setMode('walk');$('#bob').setAttribute('aria-pressed',String(walker.bob));
$('#walkMode').addEventListener('click',()=>{if(walker.mode==='walk'){walker.setMode('orbit');view()}else walker.setMode('walk')});
$('#walkHome').addEventListener('click',()=>{walker.home();$('#crouch').setAttribute('aria-pressed','false')});
$('#crouch').addEventListener('click',()=>{walker.crouched=!walker.crouched;$('#crouch').setAttribute('aria-pressed',String(walker.crouched));dirty=true});
$('#bob').addEventListener('click',()=>{walker.bob=!walker.bob;$('#bob').setAttribute('aria-pressed',String(walker.bob));dirty=true});
renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
let previousTime=0;
renderer.setAnimationLoop(time=>{const dt=previousTime?Math.min((time-previousTime)/1000,.1):0;previousTime=time;if(controls.enabled)controls.update();if(walker.update(dt))dirty=true;if(dirty){renderer.render(scene,camera);dirty=false}});
window.WORKSHOP3D={get layout(){return{panel:data.panel,op:{x:op.x,y:op.y,w:op.w,h:op.h},devices:data.devices.map(({name,type,x,y,w,h})=>({name,type,x,y,w,h})),frames:data.frames.length,conveyor:cv}},get state(){return{back,wireVisible,focus,walk:walker?.state,details:detailInfo}},get ready(){return $('#loading').hidden}};
