import * as THREE from 'three';
import { ROOM, moveBody, walkingDirection } from './walk-physics.mjs';
import { createUniformAvatar } from './uniform.mjs';

export class WalkingView {
  constructor(camera, canvas, { onMode, onChange, onInspect }) {
    this.camera=camera;this.canvas=canvas;this.onMode=onMode;this.onChange=onChange;this.onInspect=onInspect;
    this.mode='orbit';this.active=false;this.keys=new Set();this.position={x:0,z:24};this.yaw=0;this.pitch=-.67;
    this.height=32;this.phase=0;this.velocity={x:0,z:0};this.crouched=false;
    this.bob=!matchMedia('(prefers-reduced-motion: reduce)').matches;this.euler=new THREE.Euler(0,0,0,'YXZ');this.drag=null;
    this.body=this.makeBody();
    this.overlay=document.createElement('div');this.overlay.className='walk-overlay';this.overlay.hidden=true;
    this.overlay.innerHTML='<button id="walkStart">작업실 들어가기 <span>WASD 이동 · 마우스로 둘러보기 · Esc 마우스 해제</span></button>';
    canvas.parentElement.append(this.overlay);
    this.crosshair=document.createElement('div');this.crosshair.className='crosshair';this.crosshair.hidden=true;this.crosshair.setAttribute('aria-hidden','true');canvas.parentElement.append(this.crosshair);
    this.overlay.querySelector('button').addEventListener('click',()=>this.engage());
    document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement===canvas){this.active=true;this.overlay.hidden=true}else{this.clear();if(this.mode==='walk')this.overlay.hidden=false}this.onChange()});
    document.addEventListener('pointerlockerror',()=>this.fallback());
    document.addEventListener('mousemove',e=>{if(this.mode==='walk'&&document.pointerLockElement===canvas)this.look(e.movementX,e.movementY)});
    document.addEventListener('keydown',e=>{
      if(e.ctrlKey||e.metaKey||e.altKey)return;
      if(document.pointerLockElement!==canvas&&document.activeElement!==canvas)return;
      if(this.mode!=='walk'||!this.active||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable)return;
      if(e.code==='Escape'){this.pause();return}
      if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','KeyC'].includes(e.code)){e.preventDefault();this.keys.add(e.code)}
      if(e.code==='KeyE'&&!e.repeat){e.preventDefault();this.onInspect()}
    });
    document.addEventListener('keyup',e=>this.keys.delete(e.code));
    document.addEventListener('focusin',e=>{if(this.mode==='walk'&&e.target!==canvas&&document.pointerLockElement!==canvas){this.clear();this.onChange()}});
    window.addEventListener('blur',()=>this.pause());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause()});
    canvas.addEventListener('pointerdown',e=>{
      if(this.mode!=='walk')return;
      if(document.pointerLockElement===canvas){if(e.button===0)this.onInspect();return}
      this.active=true;this.overlay.hidden=true;canvas.focus({preventScroll:true});
      this.drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove',e=>{if(this.mode==='walk'&&this.drag&&document.pointerLockElement!==canvas){this.look(e.clientX-this.drag.x,e.clientY-this.drag.y);this.drag.x=e.clientX;this.drag.y=e.clientY}});
    for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{this.drag=null});
    document.querySelectorAll('[data-walk]').forEach(button=>{
      const clear=()=>{this.keys.delete(button.dataset.walk);button.classList.remove('held')};
      button.addEventListener('pointerdown',e=>{if(this.mode!=='walk')return;e.preventDefault();this.active=true;this.overlay.hidden=true;button.setPointerCapture(e.pointerId);this.keys.add(button.dataset.walk);button.classList.add('held')});
      for(const ev of ['pointerup','pointercancel','lostpointercapture','blur'])button.addEventListener(ev,clear);
    });
  }
  makeBody() { return createUniformAvatar(()=>this.onChange()); }
  home(){this.pause();this.position={x:0,z:24};this.yaw=0;this.pitch=-.67;this.crouched=false;this.height=32;this.setMode('walk')}
  clear(){this.keys.clear();this.velocity.x=0;this.velocity.z=0;this.active=false;this.drag=null;document.querySelectorAll('[data-walk]').forEach(b=>b.classList.remove('held'))}
  pause(){this.clear();if(document.pointerLockElement===this.canvas)document.exitPointerLock();if(this.mode==='walk')this.overlay.hidden=false;this.onChange()}
  setMode(mode) {
    if(document.pointerLockElement===this.canvas)document.exitPointerLock();this.clear();this.mode=mode;
    const walk=mode==='walk';this.camera.layers.set(0);if(!walk)this.camera.layers.enable(1);this.overlay.hidden=!walk;this.crosshair.hidden=!walk;
    this.camera.fov=walk?68:40;this.camera.updateProjectionMatrix();this.onMode(mode);this.body.visible=walk;
    if(walk)this.updateCamera(0);this.onChange();
  }
  engage(){
    if(this.mode!=='walk')this.setMode('walk');this.active=true;this.overlay.hidden=true;this.canvas.focus({preventScroll:true});
    if(!this.canvas.requestPointerLock){this.fallback();return}
    try {Promise.resolve(this.canvas.requestPointerLock()).catch(()=>this.fallback())}catch{this.fallback()}
  }
  fallback(){if(this.mode!=='walk')return;this.active=true;this.overlay.hidden=true;document.querySelector('#status').textContent='마우스를 누른 채 드래그하면 둘러볼 수 있어요. WASD로 걸어요.';this.onChange()}
  look(dx,dy){this.yaw-=dx*.0023;this.pitch=THREE.MathUtils.clamp(this.pitch-dy*.0023,-1.53,1.1);this.updateCamera(0);this.onChange()}
  updateCamera(bob){
    this.euler.set(this.pitch,this.yaw,0);this.camera.quaternion.setFromEuler(this.euler);
    this.camera.position.set(this.position.x-Math.sin(this.yaw)*3.5,ROOM.floor+this.height+bob,this.position.z-Math.cos(this.yaw)*3.5);
    this.body.position.set(this.position.x,ROOM.floor,this.position.z);this.body.rotation.y=this.yaw;
  }
  update(dt){
    if(this.mode!=='walk')return false;dt=Math.min(Math.max(dt,0),.1);
    const crouch=this.crouched||this.keys.has('KeyC'),target=crouch?24:32;
    const heightChange=Math.abs(this.height-target)>.005;if(heightChange)this.height+=(target-this.height)*(1-Math.exp(-12*dt));else this.height=target;
    const has=(...keys)=>keys.some(k=>this.keys.has(k));
    const f=Number(has('KeyW','ArrowUp'))-Number(has('KeyS','ArrowDown')),s=Number(has('KeyD','ArrowRight'))-Number(has('KeyA','ArrowLeft'));
    const dir=walkingDirection(f,s,this.yaw),speed=crouch?15:has('ShiftLeft','ShiftRight')?38:26;
    const blend=1-Math.exp(-14*dt);this.velocity.x+=(dir.x*speed-this.velocity.x)*blend;this.velocity.z+=(dir.z*speed-this.velocity.z)*blend;
    if(!this.active){this.velocity.x=0;this.velocity.z=0}
    const old=this.position;this.position=moveBody(old,this.velocity.x*dt,this.velocity.z*dt);
    const distance=Math.hypot(old.x-this.position.x,old.z-this.position.z),moving=distance>.001;
    if(moving)this.phase+=distance*.38;
    const stride=moving?Math.sin(this.phase)*.65:0;
    this.body.userData.rig.pose(stride,THREE.MathUtils.clamp((32-this.height)/8,0,1));
    this.updateCamera(this.bob&&moving?Math.sin(this.phase*2)*.055:0);
    return moving||heightChange||Math.hypot(this.velocity.x,this.velocity.z)>.01;
  }
  get state(){return {mode:this.mode,active:this.active,locked:document.pointerLockElement===this.canvas,position:{...this.position},height:this.height,yaw:this.yaw,pitch:this.pitch,crouched:this.crouched||this.keys.has('KeyC'),keys:[...this.keys]}}
}
