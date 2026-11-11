import * as THREE from 'three';
import {ViewCamera} from './camera.js';
import {buildScene,PROBES} from './scene.js';

const $=id=>document.getElementById(id);
const embedded=window.parent!==window;
$('back').addEventListener('click',event=>{if(embedded){event.preventDefault();window.parent.postMessage({type:'task1:preview25-close'},'*');}});
if(embedded)$('back').hidden=true;
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&embedded)window.parent.postMessage({type:'task1:preview25-close'},'*');});
$('retry').addEventListener('click',()=>location.reload());

const canvas=$('view'),viewport=$('viewport');
const unavailable=message=>{
  $('unavailable').hidden=false;if(message)$('unavailableText').textContent=message;
  for(const id of ['depth','front','lock','zoomOut','zoomIn','fit'])$(id).disabled=true;
};
let renderer,world,rig,raf=0,renders=0,lost=false,disposed=false,selectedProbe=null,resizeObserver;
const labels=new Map();
function init(){
  const context=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'low-power'});
  if(!context){unavailable();window.PREVIEW25D=Object.freeze({snapshot:()=>({available:false})});return;}
  renderer=new THREE.WebGLRenderer({canvas,context,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
  world=buildScene();rig=new ViewCamera();
  for(const probe of PROBES){const label=document.createElement('span');label.className='probe-label';label.textContent=`${probe.id}  ${probe.label}`;$('probeLabels').appendChild(label);labels.set(probe.id,label);}
  resizeObserver=new ResizeObserver(resize);resizeObserver.observe(viewport);resize();
  wireInput();
  window.PREVIEW25D=Object.freeze({snapshot:()=>({available:true,lost,renderCount:renders,drawCalls:renderer.info.render.calls,mode:rig.front?'front':'depth',locked:rig.locked,yaw:rig.yaw,pitch:rig.pitch,zoom:rig.zoom,target:rig.target.toArray(),selectedProbe,probes:PROBES.map(p=>({...p,screen:rig.project(p.point)})),selected:$('partName').textContent})});
}
function resize(){
  if(disposed)return;
  const {width,height}=viewport.getBoundingClientRect();if(!width||!height)return;
  renderer.setSize(width,height,false);rig.resize(width,height);schedule();
}
function schedule(){if(!raf&&!lost&&!disposed&&!document.hidden)raf=requestAnimationFrame(draw);}
function draw(){
  raf=0;if(lost||disposed)return;
  world.scene.updateMatrixWorld(true);renderer.render(world.scene,rig.camera);renders++;
  for(const probe of PROBES){
    const p=rig.project(probe.point),label=labels.get(probe.id);label.hidden=!p.visible;
    label.style.left=`${p.x}px`;label.style.top=`${p.y}px`;label.classList.toggle('selected',selectedProbe===probe.id);
  }
  $('zoomText').value=`${Math.round(rig.zoom*100)}%`;
  $('angleText').textContent=rig.front?'정면':`좌우 ${Math.round(rig.yaw)}° · 위 ${Math.round(rig.pitch)}°`;
  $('lock').checked=rig.locked;$('front').setAttribute('aria-pressed',String(rig.front));$('depth').setAttribute('aria-pressed',String(!rig.front));
}
function selectAt(x,y){
  world.scene.updateMatrixWorld(true);
  const ray=rig.rayAt(x,y,canvas.getBoundingClientRect());const hit=ray.intersectObjects(world.pickables,false)[0];
  if(!hit)return;
  const part=hit.object.userData.part;if(!part)return;
  $('partName').textContent=part.name;$('partInfo').textContent=part.info;$('partSpec').textContent=part.spec;$('partHeight').textContent=part.height;
  selectedProbe=hit.object.userData.probe||null;
  $('probeStatus').textContent=selectedProbe?`${selectedProbe} 지점 선택됨 · ${PROBES.find(p=>p.id===selectedProbe).label} 위`:'부품을 선택했어요. A·B·C 표시도 눌러 보세요.';
  world.highlight.box.setFromObject(world.groups.get(part.id));world.highlight.visible=true;schedule();
}
function wireInput(){
  const pointers=new Map();let drag=null,pinch=null,pending=null;
  const rect=()=>canvas.getBoundingClientRect();
  const pinchStart=()=>{
    const [a,b]=[...pointers.values()];if(!a||!b){pinch=null;return;}
    const x=(a.x+b.x)/2,y=(a.y+b.y)/2;
    pinch={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),zoom:rig.zoom,anchor:rig.planeAt(x,y,rect())};drag=null;
  };
  const applyPending=()=>{
    pending=null;if(disposed||lost)return;
    const values=[...pointers.values()];
    if(values.length>=2&&pinch){
      const [a,b]=values,x=(a.x+b.x)/2,y=(a.y+b.y)/2,distance=Math.hypot(a.x-b.x,a.y-b.y);
      rig.zoom=THREE.MathUtils.clamp(pinch.zoom*distance/pinch.distance,.7,4);rig.update();
      if(pinch.anchor)rig.pan(pinch.anchor,x,y,rect());schedule();return;
    }
    if(drag){const p=pointers.get(drag.id);if(p&&drag.moved&&drag.anchor){rig.pan(drag.anchor,p.x,p.y,rect());schedule();}}
  };
  const flush=()=>{if(pending){cancelAnimationFrame(pending);applyPending();}};
  canvas.addEventListener('pointerdown',event=>{
    if(![0,1].includes(event.button)||lost)return;event.preventDefault();canvas.focus({preventScroll:true});
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});canvas.setPointerCapture(event.pointerId);
    if(pointers.size===1)drag={id:event.pointerId,x:event.clientX,y:event.clientY,anchor:rig.planeAt(event.clientX,event.clientY,rect()),moved:event.button===1,click:event.button===0};
    else pinchStart();canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove',event=>{
    if(!pointers.has(event.pointerId))return;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(drag&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>4)drag.moved=true;
    if(!pending)pending=requestAnimationFrame(applyPending);
  });
  const endPointer=event=>{
    if(!pointers.has(event.pointerId))return;flush();
    if(event.type==='pointerup'&&drag?.id===event.pointerId&&drag.click&&!drag.moved)selectAt(event.clientX,event.clientY);
    pointers.delete(event.pointerId);drag=null;pinch=null;
    if(pointers.size===1){const [id,p]=[...pointers.entries()][0];drag={id,x:p.x,y:p.y,anchor:rig.planeAt(p.x,p.y,rect()),moved:true,click:false};}
    else if(pointers.size>1)pinchStart();
    if(!pointers.size)canvas.classList.remove('dragging');
  };
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,endPointer);
  const cancel=()=>{if(pending)cancelAnimationFrame(pending);pending=null;pointers.clear();drag=null;pinch=null;canvas.classList.remove('dragging');};
  window.addEventListener('blur',cancel);
  canvas.addEventListener('wheel',event=>{event.preventDefault();if(lost)return;flush();rig.zoomAt(rig.zoom*Math.exp(-Math.max(-150,Math.min(150,event.deltaY))*.0015),event.clientX,event.clientY,rect());schedule();},{passive:false});
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  const change=fn=>{cancel();fn();schedule();};
  $('fit').addEventListener('click',()=>change(()=>rig.fit()));
  $('front').addEventListener('click',()=>change(()=>rig.setFront()));
  $('depth').addEventListener('click',()=>change(()=>rig.setDepth()));
  $('lock').addEventListener('change',()=>change(()=>{
    rig.setLocked($('lock').checked);
    // Unlocking changes future drags only; the view must not snap on this click.
  }));
  for(const [id,multiplier] of [['zoomIn',1.2],['zoomOut',1/1.2]])$(id).addEventListener('click',()=>change(()=>{const r=rect();rig.zoomAt(rig.zoom*multiplier,r.left+r.width/2,r.top+r.height/2,r);}));
  canvas.addEventListener('keydown',event=>{
    const delta={ArrowLeft:[-45,0],ArrowRight:[45,0],ArrowUp:[0,-45],ArrowDown:[0,45]}[event.key];
    if(delta){event.preventDefault();change(()=>rig.moveKey(...delta));}
    else if(event.key==='0'){event.preventDefault();change(()=>rig.fit());}
    else if(event.key==='+'||event.key==='='){$('zoomIn').click();event.preventDefault();}
    else if(event.key==='-'){$('zoomOut').click();event.preventDefault();}
  });
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;cancel();if(raf)cancelAnimationFrame(raf);raf=0;unavailable('입체 화면 연결이 끊겼어요. 다시 시도하거나 메인으로 돌아가 기존 작업 화면을 이용해 주세요.');});
  canvas.addEventListener('webglcontextrestored',()=>{lost=false;$('unavailable').hidden=true;for(const id of ['depth','front','lock','zoomOut','zoomIn','fit'])$(id).disabled=false;resize();});
  document.addEventListener('visibilitychange',()=>{cancel();if(document.hidden){if(raf)cancelAnimationFrame(raf);raf=0;}else schedule();});
}
window.addEventListener('pagehide',()=>{
  disposed=true;if(raf)cancelAnimationFrame(raf);resizeObserver?.disconnect();
  const textures=new Set(),materials=new Set(),geometries=new Set();
  world?.scene.traverse(object=>{if(object.geometry)geometries.add(object.geometry);for(const material of object.material?[].concat(object.material):[])materials.add(material);});
  for(const material of materials){for(const value of Object.values(material))if(value?.isTexture)textures.add(value);material.dispose();}
  for(const geometry of geometries)geometry.dispose();for(const texture of textures)texture.dispose();renderer?.dispose();
});
try{init();}catch(error){console.warn('2.5D preview could not start:',error.message);unavailable();window.PREVIEW25D=Object.freeze({snapshot:()=>({available:false})});}
