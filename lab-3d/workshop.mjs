import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';

const $ = s => document.querySelector(s);
document.title = '1과제 작업대 · 3D 미리보기';
$('.scene-title').innerHTML = '<span class="dot"></span>TASK 01 / WORKBENCH <small>기존 작업대 배치 그대로</small>';
$('aside').innerHTML = `<div class="panel-intro"><span class="eyebrow">산업용로봇 1과제</span><h2>익숙한 작업대, 입체로</h2><p>기존 HTML의 치수와 부품 위치를 그대로 옮겼어요. 기구를 누르면 이름을 확인할 수 있어요.</p></div>
<div class="workspace-actions"><button data-focus="panel">제어판 보기</button><button data-focus="op">조작판 보기</button></div><button class="wide" data-focus="conveyor">컨베이어 보기</button>
<div id="status" role="status" aria-live="polite">드래그로 돌리고 휠로 확대해 보세요.</div>
<div class="readouts"><div><span>제어판</span><b>760 × 600</b></div><div><span>조작판</span><b>375 × 270</b></div></div>
<button id="flipOp" class="wide" aria-pressed="false">조작판 뒷면 보기</button><button id="showWires" class="wide" aria-pressed="false">예제 배선 보기</button>
<details id="help"><summary>작업대 구성과 조작법</summary><p>왼쪽 드래그: 회전<br>휠: 확대·축소<br>휠 버튼 / 오른쪽 드래그: 화면 이동</p><p>제어판 1단: MCB · FS1 · FS2 · SMPS · PLC · POS · 서보 드라이버<br>2단: R1~R6 · T1~T3 · XTB1<br>3단: 40칸 단자대 · XTB2</p><p>오른쪽: HMI · 표시등 · 버튼 · 선택 스위치 · 부저 · 비상정지<br>아래: 500mm 컨베이어 · S1 · S2</p></details>
<a class="circuit-link" href="lab-3d.html?mode=circuit">작은 24V 회로 체험으로 →</a>
<p class="scope">지금은 작업대 모양·배치 확인 단계예요. 가로·세로 치수와 배치는 원본 기준이며 기구 높이는 시각화용 근사치예요. 조립·배선 편집·전체 회로 동작은 기존 1과제 화면에서 진행해요.</p>`;
const data = await fetch('./lab-3d/reference/layout.json').then(r => { if (!r.ok) throw Error('layout'); return r.json(); });
const canvas = $('#scene'), viewport = $('#viewport');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6)); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#173f32');
const camera = new THREE.PerspectiveCamera(40, 1, .1, 220);
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
const grid=new THREE.GridHelper(40,80,'#426d51','#2c5c43');grid.position.y=-.23;scene.add(grid);
block({x:0,y:0,w:760,h:600},5,'#a4adb2','제어판 · 760 × 600 mm');
const heights={mcb:65,fuse:55,smps:65,plc:55,pos:55,relay:48,timer:57,xtb40:30,tb:25,xtb50:30,servo:80};
for(const f of data.frames){ const h=f.type==='duct'?40:8;block(f,h,f.type==='duct'?'#dddeda':'#bbc3c7',f.type==='duct'?'와이어링 덕트 · 40 × 40 mm':'딘레일 · 35 mm');face(f,h/50+.005,f.image); }
for(const d of data.devices){const h=heights[d.type];block(d,h,['relay','timer','tb','servo'].includes(d.type)?'#30373a':'#bcc3bf',`${d.name} · ${d.w} × ${d.h} mm`);face(d,h/50+.008,d.image);}
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
let focus='all';
function view(type='iso',section=focus){focus=section;const p=section==='panel'?[-4.8,0,-3.2]:section==='op'?[8,0,-3]:section==='conveyor'?[-5,0,9]:[0,0,1];controls.target.set(...p);
 const dist=section==='all'?1:section==='panel'?.64:.36;const ratio=Math.min(1.7,Math.max(1,1.05/camera.aspect));const v=type==='top'?[0,43,.01]:[20,29,32];camera.position.set(p[0]+v[0]*dist*ratio,p[1]+v[1]*dist*ratio,p[2]+v[2]*dist*ratio);controls.update();dirty=true;}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>view(b.dataset.view==='top'?'top':'iso',b.dataset.view==='close'?'panel':'all')));
document.querySelectorAll('[data-focus]').forEach(b=>b.addEventListener('click',()=>view('iso',b.dataset.focus)));
$('#flipOp').addEventListener('click',()=>{back=!back;frontGroup.visible=!back;backGroup.visible=back;opWires.visible=back;$('#flipOp').textContent=back?'조작판 앞면 보기':'조작판 뒷면 보기';$('#flipOp').setAttribute('aria-pressed',String(back));dirty=true});
$('#showWires').addEventListener('click',()=>{wireVisible=!wireVisible;wireGroup.visible=wireVisible;opWires.visible=back;$('#showWires').textContent=wireVisible?'예제 배선 숨기기':'예제 배선 보기';$('#showWires').setAttribute('aria-pressed',String(wireVisible));$('#status').textContent=wireVisible?'완성 예제의 경로예요. 배선 편집·동작은 기존 화면을 이용해요.':'기구 배치만 보고 있어요.';dirty=true});
$('#helpToggle').addEventListener('click',()=>{$('#help').open=!$('#help').open;$('#help').scrollIntoView({block:'nearest'})});$('#help').addEventListener('toggle',()=>$('#helpToggle').setAttribute('aria-expanded',String($('#help').open)));
const ray=new THREE.Raycaster();let down=null;
canvas.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,id:e.pointerId,button:e.button,moved:false}});
canvas.addEventListener('pointermove',e=>{if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)down.moved=true});
canvas.addEventListener('pointerup',e=>{if(!down||down.id!==e.pointerId||down.button!==0||down.moved){down=null;return}down=null;const r=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);
 const hit=ray.intersectObjects(picks).find(h=>h.object.parent.visible);if(hit)$('#status').textContent=hit.object.userData.name});
for(const ev of ['pointercancel','lostpointercapture'])canvas.addEventListener(ev,()=>{down=null});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
function resize(){const r=viewport.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();dirty=true}
new ResizeObserver(resize).observe(viewport);resize();view();
let failed=false;manager.onError=()=>{failed=true;$('#loading').textContent='기구 그림 일부를 열지 못했어요. 새로고침해 주세요.'};manager.onLoad=()=>{if(!failed)$('#loading').hidden=true;dirty=true};
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();$('#loading').hidden=false;$('#loading').textContent='3D 표시가 중단됐어요. 새로고침해 주세요.'});
renderer.setAnimationLoop(()=>{controls.update();if(dirty){renderer.render(scene,camera);dirty=false}});
window.WORKSHOP3D={get layout(){return{panel:data.panel,op:{x:op.x,y:op.y,w:op.w,h:op.h},devices:data.devices.map(({name,type,x,y,w,h})=>({name,type,x,y,w,h})),frames:data.frames.length,conveyor:cv}},get state(){return{back,wireVisible,focus}},get ready(){return $('#loading').hidden}};
