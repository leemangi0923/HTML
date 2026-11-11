import * as THREE from 'three';

const radians=THREE.MathUtils.degToRad;
const clamp=THREE.MathUtils.clamp;
export class ViewCamera {
  constructor(){
    this.camera=new THREE.PerspectiveCamera(32,1,1,12000);this.camera.up.set(0,1,0);
    this.target=new THREE.Vector3(380,300,0);this.zoom=1;this.yaw=-8;this.pitch=12;this.baseYaw=-8;this.basePitch=12;this.locked=false;this.front=false;
    this.ray=new THREE.Raycaster();this.plane=new THREE.Plane(new THREE.Vector3(0,0,1),0);
    this.fitDistance=1700;this.width=1;this.height=1;this.update();
  }
  resize(width,height){
    this.width=Math.max(1,width);this.height=Math.max(1,height);this.camera.aspect=this.width/this.height;
    this.fitDistance=Math.max(760/this.camera.aspect,600)/(2*Math.tan(radians(16)))*1.18;
    this.camera.updateProjectionMatrix();this.update();
  }
  update(){
    const yaw=radians(this.yaw),pitch=radians(this.pitch),distance=this.fitDistance/this.zoom;
    this.camera.position.set(this.target.x+Math.sin(yaw)*Math.cos(pitch)*distance,-this.target.y+Math.sin(pitch)*distance,Math.cos(yaw)*Math.cos(pitch)*distance);
    this.camera.lookAt(new THREE.Vector3(this.target.x,-this.target.y,0));this.camera.updateMatrixWorld();
  }
  followAngle(){
    if(this.locked||this.front)return;
    this.yaw=clamp(this.baseYaw+(this.target.x-380)*.06,-23,23);
    this.pitch=clamp(this.basePitch+(this.target.y-300)*.04,0,24);
  }
  rayAt(x,y,rect){this.ray.setFromCamera(new THREE.Vector2((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1),this.camera);return this.ray;}
  planeAt(x,y,rect){const p=this.rayAt(x,y,rect).ray.intersectPlane(this.plane,new THREE.Vector3());if(p)p.y=-p.y;return p;}
  keepAnchor(anchor,x,y,rect){
    const at=this.planeAt(x,y,rect);if(!at)return;
    this.target.add(anchor.clone().sub(at));this.target.x=clamp(this.target.x,-190,950);this.target.y=clamp(this.target.y,-150,750);this.update();
  }
  pan(anchor,x,y,rect){
    this.keepAnchor(anchor,x,y,rect);this.followAngle();this.update();this.keepAnchor(anchor,x,y,rect);
  }
  zoomAt(value,x,y,rect){
    const anchor=this.planeAt(x,y,rect);this.zoom=clamp(value,.7,4);this.update();if(anchor)this.keepAnchor(anchor,x,y,rect);
  }
  moveKey(dx,dy){
    this.target.x=clamp(this.target.x+dx/this.zoom,-190,950);this.target.y=clamp(this.target.y+dy/this.zoom,-150,750);this.followAngle();this.update();
  }
  setFront(){this.front=true;this.locked=true;this.yaw=0;this.pitch=0;this.update();}
  setDepth(){this.front=false;this.locked=false;this.baseYaw=-8;this.basePitch=12;this.followAngle();this.update();}
  setLocked(locked){
    if(!locked){this.front=false;this.baseYaw=this.yaw-(this.target.x-380)*.06;this.basePitch=this.pitch-(this.target.y-300)*.04;}
    this.locked=locked;
  }
  fit(){this.target.set(380,300,0);this.zoom=1;if(!this.locked&&!this.front)this.followAngle();this.update();}
  project(point){
    const p=new THREE.Vector3(point[0],-point[1],point[2]).project(this.camera);
    return {x:(p.x+1)*this.width/2,y:(1-p.y)*this.height/2,visible:p.z>-1&&p.z<1&&Math.abs(p.x)<1&&Math.abs(p.y)<1};
  }
}
