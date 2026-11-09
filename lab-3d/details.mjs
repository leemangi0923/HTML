import * as THREE from 'three';

// Shapes are based on the original product drawings; unverified depths remain estimates.
export function buildDetails({scene,box,block,face,material,X,Z,texture,data}) {
  const screws=[],fingers=[];
  const metal=material('#9da8af'),dark=material('#343a3e');
  function cylinder(x,y,z,r,h,mat,segments=20) {
    const o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,segments),mat);o.position.set(x,y,z);o.castShadow=true;scene.add(o);return o;
  }
  function instances(positions,geometry,mat) {
    const mesh=new THREE.InstancedMesh(geometry,mat,positions.length),dummy=new THREE.Object3D();
    positions.forEach((p,i)=>{dummy.position.set(...p.slice(0,3));dummy.scale.set(...p.slice(3,6));dummy.rotation.set(0,p[6]||0,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix)});
    mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);return mesh;
  }
  const heights={mcb:65,fuse:55,smps:65,plc:55,pos:55,relay:48,timer:57,xtb40:30,tb:25,xtb50:30,servo:80};
  for(const f of data.frames) {
    if(f.type!=='duct'){block(f,8,'#bbc3c7','딘레일 · 35 mm');face(f,.167,f.image);continue}
    block(f,5,'#d5d6d2','와이어링 덕트 · 40 × 40 mm');face(f,.105,f.image);
    const vertical=f.o==='v',length=vertical?f.h:f.w;
    for(let k=3;k<length-2;k+=10)for(const side of [2,f.w-2])if(vertical)fingers.push([X(f.x+side),.45,Z(f.y+k),.05,.7,.10]);
    for(let k=3;k<length-2;k+=10)for(const side of [2,f.h-2])if(!vertical)fingers.push([X(f.x+k),.45,Z(f.y+side),.10,.7,.05]);
  }
  for(const d of data.devices) {
    const h=heights[d.type],top=h/50;
    if(['relay','timer'].includes(d.type)) {
      block(d,12,'#292e31',`${d.name} · ${d.type==='relay'?'릴레이':'타이머'} 소켓`);face(d,.247,d.image);
      const r=d.type==='relay'?{x:d.x+1.2,y:d.y+16.8,w:28.6,h:41}:{x:d.x+1,y:d.y+11.6,w:38,h:48.6};
      if(d.type==='relay') {
        const coil=new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,.31,16),material('#bb793b'));coil.rotation.z=Math.PI/2;coil.position.set(X(d.x+15.5),.65,Z(d.y+37));scene.add(coil);
        box(X(d.x+15.5),.42,Z(d.y+37),.43,.12,.34,'#e1dfd3');
        for(let i=0;i<4;i++)box(X(d.x+6+i*6),.68,Z(d.y+24),.05,.28,.16,'#c58e56');
        const shell=box(X(r.x+r.w/2),(.24+top)/2,Z(r.y+r.h/2),r.w/50,top-.24,r.h/50,'#a7bac3');
        shell.material=new THREE.MeshStandardMaterial({color:'#d2e1e7',transparent:true,opacity:.2,depthWrite:false,roughness:.25});
        const edges=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(r.w/50,top-.24,r.h/50)),new THREE.LineBasicMaterial({color:'#a3b7c0',transparent:true,opacity:.7}));edges.position.copy(shell.position);scene.add(edges);
      } else {
        box(X(r.x+r.w/2),(.24+top)/2,Z(r.y+r.h/2),r.w/50,top-.24,r.h/50,'#dedbce');
        for(const offset of [-1,1])box(X(d.x+d.w/2+offset*20),.59,Z(d.y+36),.045,.36,.24,'#349dda');
      }
      face(r,top+.007,d.image,scene,{x:r.x-d.x,y:r.y-d.y,w:r.w,h:r.h,W:d.w,H:d.h});
      if(d.type==='timer') {
        cylinder(X(d.x+20),top+.028,Z(d.y+36.6),.268,.045,metal,32);
        const map=texture(d.image).clone();map.offset.set(6.6/d.w,(d.h-50)/d.h);map.repeat.set(26.8/d.w,26.8/d.h);
        const dial=new THREE.Mesh(new THREE.CircleGeometry(.26,40),new THREE.MeshStandardMaterial({map,roughness:.55}));dial.rotation.x=-Math.PI/2;dial.position.set(X(d.x+20),top+.053,Z(d.y+36.6));scene.add(dial);
      }
    } else {
      block(d,h,['tb','servo'].includes(d.type)?'#30373a':'#c3c8c5',`${d.name} · ${d.w} × ${d.h} mm`);face(d,top+.008,d.image);
      if(['plc','smps','servo','pos'].includes(d.type)) {
        for(let k=9;k<d.h-8;k+=7)box(X(d.x+d.w)+.006,top*.53,Z(d.y+k),.018,top*.44,.037,'#646d72');
      }
      if(d.type==='plc') {
        box(X(d.x+d.w/2),top*.5,Z(d.y-.8),.64,.32,.1,'#2b3339');
        box(X(d.x+d.w/2-15),top*.5,Z(d.y-1.1),.19,.12,.05,'#477580');
      }
      if(d.type==='servo') {
        for(const z of [d.y+30,d.y+69,d.y+110])box(X(d.x-2),.65,Z(z),.18,.7,.3,'#303d48');
        box(X(d.x-4),.9,Z(d.y+69),.06,.32,.14,'#de8334');
      }
      if(d.type==='tb')for(let i=0;i<40;i++)box(X(d.x+2+i*8.6),top*.5,Z(d.y+d.h/2),.025,top,.86,'#1c2328');
      if(d.type==='mcb')box(X(d.x+d.w/2),top+.075,Z(d.y+d.h*.48),.42,.13,.33,'#20282c');
    }
    const screwTop=['relay','timer'].includes(d.type)?.27:top+.028;
    for(const t of d.terminals||[]){if(d.type==='servo')continue;screws.push([X(d.x+t.x),screwTop,Z(d.y+t.y)])}
  }
  instances(fingers,new THREE.BoxGeometry(1,1,1),material('#dbddd9'));
  if(screws.length){
    instances(screws.map(p=>[...p,.046,.038,.046]),new THREE.CylinderGeometry(1,1,1,10),metal);
    instances(screws.flatMap(([x,y,z])=>[[x,y+.021,z,.062,.006,.013,0],[x,y+.021,z,.062,.006,.013,Math.PI/2]]),new THREE.BoxGeometry(1,1,1),dark);
  }
  return {screws:screws.length,ductFingers:fingers.length,depths:'estimated'};
}
