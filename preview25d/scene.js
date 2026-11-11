import * as THREE from 'three';

export const BOARD={w:760,h:600};
export const PROBES=[
  {id:'A',label:'철판',part:'plate',point:[380,378,.35]},
  {id:'B',label:'찬넬',part:'rail2',point:[350,324,8.6]},
  {id:'C',label:'스토퍼',part:'stop1',point:[114,129,25.5]}
];

function roundedRect(shape,x,y,w,h,r){
  shape.moveTo(x+r,y);shape.lineTo(x+w-r,y);shape.quadraticCurveTo(x+w,y,x+w,y+r);
  shape.lineTo(x+w,y+h-r);shape.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  shape.lineTo(x+r,y+h);shape.quadraticCurveTo(x,y+h,x,y+h-r);
  shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y);
  return shape;
}
function canvasTexture(paint,size=512){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  paint(canvas.getContext('2d'),size);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}
function brushed(){return canvasTexture((ctx,n)=>{
  ctx.fillStyle='#bec6c7';ctx.fillRect(0,0,n,n);let seed=971;
  for(let y=0;y<n;y++){seed=(seed*1664525+1013904223)>>>0;const c=175+(seed%60);ctx.fillStyle=`rgba(${c},${c+5},${c+7},.45)`;ctx.fillRect(0,y,n,1);}
});}
function grid(){const t=canvasTexture((ctx,n)=>{
  ctx.fillStyle='#183e2f';ctx.fillRect(0,0,n,n);
  for(let i=0;i<=20;i++){ctx.strokeStyle=i%5===0?'#345947':'#254a39';ctx.lineWidth=i%5===0?1.3:.7;ctx.beginPath();ctx.moveTo(i*n/20,0);ctx.lineTo(i*n/20,n);ctx.moveTo(0,i*n/20);ctx.lineTo(n,i*n/20);ctx.stroke();}
});t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(10,10);return t;}

export function buildScene(){
  const scene=new THREE.Scene();scene.background=new THREE.Color('#10281f');
  // Board coordinates use y downward; render with y upward so x stays right in the camera.
  const model=new THREE.Group();model.scale.y=-1;scene.add(model);
  scene.add(new THREE.HemisphereLight(0xf3f6ef,0x374940,1.45));
  const key=new THREE.DirectionalLight(0xfff5de,3.4);key.position.set(-300,500,1000);scene.add(key);
  const fill=new THREE.DirectionalLight(0xb4d3df,.85);fill.position.set(800,-300,600);scene.add(fill);
  const metal=new THREE.MeshStandardMaterial({color:0xffffff,map:brushed(),roughness:.46,metalness:.35});
  const railMat=new THREE.MeshStandardMaterial({color:0xc7d2d6,roughness:.3,metalness:.72});
  const chrome=new THREE.MeshStandardMaterial({color:0xd4dde0,roughness:.27,metalness:.8});
  const plastic=new THREE.MeshStandardMaterial({color:0xe0e1d5,roughness:.69,metalness:.02});
  const inner=new THREE.MeshStandardMaterial({color:0xc2c6b9,roughness:.8});
  const stopperMat=new THREE.MeshStandardMaterial({color:0x8196a0,roughness:.48,metalness:.28});
  const dark=new THREE.MeshStandardMaterial({color:0x263b40,roughness:.75});
  const groups=new Map(),pickables=[],probeMeshes=[];
  const makePart=(id,name,info,spec,height)=>{
    const part=new THREE.Group();part.userData={id,name,info,spec,height};groups.set(id,part);model.add(part);return part;
  };
  const register=(mesh,parent)=>{mesh.userData.part=parent.userData;parent.add(mesh);pickables.push(mesh);return mesh;};
  const box=(parent,x,y,z,w,h,d,material)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x+w/2,y+h/2,z+d/2);return register(mesh,parent);
  };
  const extrude=(parent,shape,z,depth,material,bevel=0)=>{
    const geo=new THREE.ExtrudeGeometry(shape,{depth,steps:1,curveSegments:5,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1});
    const mesh=new THREE.Mesh(geo,material);mesh.position.z=z;return register(mesh,parent);
  };
  const screw=(part,x,y,z,r=2.6)=>{
    const head=new THREE.Mesh(new THREE.CylinderGeometry(r,r,.9,20),chrome);head.rotation.x=Math.PI/2;head.position.set(x,y,z+.45);register(head,part);
    box(part,x-r*.67,y-.26,z+.94,r*1.34,.52,.07,dark);
    box(part,x-.26,y-r*.67,z+.94,.52,r*1.34,.07,dark);
  };
  const shadowMap=canvasTexture((ctx,n)=>{
    const g=ctx.createRadialGradient(n/2,n/2,n*.07,n/2,n/2,n*.5);g.addColorStop(0,'rgba(0,0,0,.48)');g.addColorStop(.65,'rgba(0,0,0,.2)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,n,n);
  },128);
  const shadow=(x,y,w,h,z,opacity=.38)=>{
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:shadowMap,transparent:true,depthWrite:false,opacity}));
    m.position.set(x+w/2,y+h/2,z);model.add(m);
  };
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(4000,4000),new THREE.MeshStandardMaterial({map:grid(),roughness:1,color:0xb4c8ba}));ground.position.set(380,300,-6);model.add(ground);
  shadow(-58,-35,885,690,-5.8,.9);
  const plate=makePart('plate','철판','모든 부품을 받쳐 주는 바탕판이에요.','760 × 600 mm','두께 약 3.5 mm');
  const plateShape=roundedRect(new THREE.Shape(),0,0,760,600,3);
  for(const [x,y] of [[16,16],[744,16],[16,584],[744,584]]){const hole=new THREE.Path();hole.absarc(x,y,3.2,0,Math.PI*2);plateShape.holes.push(hole);}
  extrude(plate,plateShape,-3.5,3.5,metal,.25);
  const ducts=[['dL',40,0,600,true],['dR',680,0,600,true],['dT',80,0,600,false],['d1',80,240,600,false],['d2',80,400,600,false],['dB',80,560,600,false]];
  for(const [id,x,y,length,vertical] of ducts){
    const part=makePart(id,'와이어링 덕트','빗살 사이로 전선을 넣고, 안쪽에 모아 정리해요.','폭 40 × 높이 40 mm','높이 약 40 mm');
    part.position.set(vertical?x+40:x,y,0);if(vertical)part.rotation.z=Math.PI/2;
    shadow(x-7,y-5,vertical?54:length+14,vertical?length+14:54,.03,.35);
    box(part,0,0,.15,length,40,1.6,inner);
    for(const yy of [0,37.5]){
      box(part,0,yy,1.75,length,2.5,10.25,plastic);
      const fingers=new THREE.InstancedMesh(new THREE.BoxGeometry(6.6,2.5,28),plastic,Math.ceil(length/10));
      const matrix=new THREE.Matrix4();
      for(let i=0;i<fingers.count;i++){matrix.makeTranslation(i*10+3.3,yy+1.25,26);fingers.setMatrixAt(i,matrix);}
      fingers.instanceMatrix.needsUpdate=true;register(fingers,part);
    }
    for(let p=50;p<length;p+=150)screw(part,p,20,1.85,3);
  }
  for(const [index,cy,length] of [[1,140,500],[2,340,575],[3,500,575]]){
    const rail=makePart(`rail${index}`,'찬넬 · DIN 레일','낮은 금속 턱에 소켓과 기구를 걸어 고정해요.',`폭 35 × 길이 ${length} mm`,'높이 약 8 mm');rail.position.set(92.5,cy-17.5,0);
    shadow(89.5,cy-22,length+8,46,.04,.4);
    const floor=roundedRect(new THREE.Shape(),0,7.5,length,20,.3);
    for(let x=12.5;x<length-6;x+=25){const hole=roundedRect(new THREE.Path(),x-9,14.9,18,5.2,2.5);floor.holes.push(hole);}
    extrude(rail,floor,.3,1,railMat);
    box(rail,0,6.5,1.3,length,1,5.7,railMat);box(rail,0,27.5,1.3,length,1,5.7,railMat);
    box(rail,0,0,7,length,7.5,1,chrome);box(rail,0,27.5,7,length,7.5,1,chrome);
    for(const x of [62.5,length-62.5])screw(rail,x,17.5,1.4,3.1);
    for(const [end,x] of [[0,110],[1,index===1?570:645]]){
      const id=`stop${index}${end?'r':''}`;
      const part=makePart(id,'스토퍼','찬넬 위에서 기구 묶음이 옆으로 밀리지 않게 잡아 줘요.','폭 8 × 길이 44 mm','찬넬 위 약 25 mm');part.position.set(x,cy-22,0);
      const body=new THREE.Shape();body.moveTo(1.1,0);body.lineTo(6.9,0);body.lineTo(8,1.3);body.lineTo(8,42.7);body.lineTo(6.9,44);body.lineTo(1.1,44);body.lineTo(0,42.7);body.lineTo(0,1.3);body.closePath();
      extrude(part,body,8.2,16.4,stopperMat,.35);
      box(part,.6,3,7.5,6.8,2.6,2.2,chrome);box(part,.6,38.4,7.5,6.8,2.6,2.2,chrome);
      box(part,1.3,17.2,24.65,5.4,9.6,.3,dark);screw(part,4,22,25,2.2);
      for(const yy of [7,10,32,35])box(part,1.7,yy,24.65,4.6,.65,.55,chrome);
    }
  }
  for(const probe of PROBES){
    const mat=new THREE.MeshBasicMaterial({color:0xf3cf61});
    const marker=new THREE.Mesh(new THREE.RingGeometry(3.1,5.2,24),mat);marker.position.fromArray(probe.point);marker.userData.part=groups.get(probe.part).userData;marker.userData.probe=probe.id;model.add(marker);pickables.push(marker);probeMeshes.push(marker);
    const dot=new THREE.Mesh(new THREE.CircleGeometry(1.45,16),mat);dot.position.copy(marker.position);dot.userData=marker.userData;model.add(dot);pickables.push(dot);probeMeshes.push(dot);
  }
  const highlight=new THREE.Box3Helper(new THREE.Box3(),0xf5d773);highlight.visible=false;scene.add(highlight);
  return {scene,pickables,groups,probeMeshes,highlight};
}
