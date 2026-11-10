import * as THREE from 'three';

const geometryCache = new Map();
const textureCache = new Map();
export const UNIFORM = Object.freeze({
  school: '국립전북기계공업고등학교', innerText: '마이스터고',
  english: 'Chonbuk Mechanical Technical High School',
  leftBadge: '학교 마크', rightBadge: 'WorldSkills KOREA',
  closure: '남색 덮개와 맨 위 똑딱단추', firstPersonBadges: false
});
function rounded(w,h,d,r=.18) {
  const key=[w,h,d,r].join('/');
  if(geometryCache.has(key)) return geometryCache.get(key);
  const bevel=Math.min(r*.45,w/5,h/5,d/5),x=w/2-bevel,y=h/2-bevel,corner=Math.min(r-bevel,x*.45,y*.45);
  const s=new THREE.Shape();
  s.moveTo(-x+corner,-y);s.lineTo(x-corner,-y);s.quadraticCurveTo(x,-y,x,-y+corner);
  s.lineTo(x,y-corner);s.quadraticCurveTo(x,y,x-corner,y);s.lineTo(-x+corner,y);
  s.quadraticCurveTo(-x,y,-x,y-corner);s.lineTo(-x,-y+corner);s.quadraticCurveTo(-x,-y,-x+corner,-y);
  const g=new THREE.ExtrudeGeometry(s,{depth:d-2*bevel,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,steps:1,curveSegments:4});
  g.translate(0,0,-d/2+bevel);geometryCache.set(key,g);return g;
}
function badgeTexture(file,onLoad) {
  if(!textureCache.has(file)) {
    const t=new THREE.TextureLoader().load(`./lab-3d/uniform/${file}.svg`,()=>onLoad?.());
    t.colorSpace=THREE.SRGBColorSpace;textureCache.set(file,t);
  }
  return textureCache.get(file);
}
export function createUniformAvatar(onLoad) {
  const root=new THREE.Group();root.name='school-uniform-avatar';
  const upper=new THREE.Group();upper.name='upper-body';root.add(upper);
  const mats={};
  for(const [key,color] of Object.entries({navy:'#182238',gray:'#767982',stripe:'#dce1df',seam:'#28334a',cuff:'#111d30',pants:'#172239',shoe:'#242c38',sole:'#ced2d1',glove:'#bfc1bf',palm:'#555956',skin:'#d8ac82',hair:'#252528',black:'#202429'}))mats[key]=new THREE.MeshStandardMaterial({color,roughness:.92});
  const part=(group,name,x,y,z,w,h,d,mat,r=.16)=>{
    const m=new THREE.Mesh(rounded(w,h,d,r),mats[mat]);m.name=name;m.position.set(x,y,z);group.add(m);return m;
  };
  const sphere=(group,name,x,y,z,w,h,d,mat)=>{
    const o=new THREE.Mesh(new THREE.SphereGeometry(1,16,12),mats[mat]);o.position.set(x,y,z);o.scale.set(w,h,d);o.name=name;group.add(o);return o;
  };
  part(upper,'jacket',0,19.7,.15,7.8,13.8,4.2,'navy',.65);
  part(upper,'waist-band',0,13.1,.15,7.45,.7,4.05,'cuff',.18);
  // The zipper is concealed entirely by the overlapping navy fabric placket.
  part(upper,'closed-placket',0,19.8,-2.04,.72,13.45,.15,'navy',.07);
  part(upper,'placket-seam',.32,19.8,-2.129,.025,13.1,.012,'seam',.006);
  for(const side of [-1,1]) {
    part(upper,`chest-stripe-${side}`,side*2.02,22.55,-2.01,3.25,.21,.09,'stripe',.03);
    const patch=new THREE.Shape();patch.moveTo(side*3.65,23.6);patch.lineTo(side*3.3,25.7);patch.lineTo(side*1.8,26.1);patch.lineTo(side*1.65,25.3);patch.lineTo(side*2.55,24.55);patch.closePath();const shoulder=new THREE.Mesh(new THREE.ShapeGeometry(patch),new THREE.MeshStandardMaterial({color:'#767982',roughness:.92,side:THREE.DoubleSide}));shoulder.name=`gray-shoulder-${side}`;shoulder.position.z=-1.956;upper.add(shoulder);
    const pocket=part(upper,`pocket-${side}`,side*2.45,16.55,-2.02,.19,2.4,.12,'seam',.04);pocket.rotation.z=side*-.32;
    const collar=part(upper,`collar-${side}`,side*1.05,26.45,-1.14,2.25,1.35,.6,'navy',.16);collar.rotation.z=side*.28;
  }
  const snap=sphere(upper,'top-snap',0,26.1,-2.17,.18,.18,.055,'black');
  part(upper,'name-tag',-2.15,23.7,-2.06,1.45,.52,.045,'stripe',.035);
  part(upper,'back-gray-yoke',0,25.1,2.28,7.4,2.7,.10,'gray',.2);
  part(upper,'back-upper-stripe',0,23.7,2.3,7.2,.2,.10,'stripe',.025);
  part(upper,'back-hem-stripe',0,13.9,2.22,7.2,.18,.10,'stripe',.025);

  const badges=[];
  for(const [side,file] of [[-1,'school'],[1,'worldskills']]) {
    // -X is the wearer's left while facing -Z. Never mirror the texture.
    const arm=new THREE.Group();arm.name=side<0?'left-arm':'right-arm';arm.position.set(side*4.7,25.1,.55);arm.rotation.x=.10;arm.rotation.z=side*-.055;upper.add(arm);
    part(arm,'upper-sleeve',0,-3.1,0,2.15,6.35,2.55,'gray',.42);
    part(arm,'navy-inner-sleeve',-side*.98,-3.1,.25,.12,5.6,1.7,'navy',.05);
    const forearm=new THREE.Group();forearm.position.y=-6.05;forearm.rotation.x=.48;arm.add(forearm);
    part(forearm,'lower-sleeve',0,-2.7,0,2.0,5.5,2.4,'gray',.4);
    part(forearm,'navy-cuff',0,-5.25,0,1.95,.65,2.22,'cuff',.16);
    const hand=new THREE.Group();hand.position.set(0,-6.3,-.1);hand.rotation.x=-.15;forearm.add(hand);
    part(hand,'glove-palm',0,0,0,1.6,1.85,1.0,'glove',.28);
    part(hand,'dark-glove-palm',0,-.12,-.48,1.23,1.25,.09,'palm',.13);
    for(let i=0;i<4;i++) {
      const finger=part(hand,`finger-${i}`,(i-1.5)*.35,-1.15,-.1,.31,1.05,.59,'glove',.14);finger.rotation.x=.32;
      part(hand,`finger-pad-${i}`,(i-1.5)*.35,-1.25,-.39,.28,.62,.12,'palm',.08);
    }
    const thumb=part(hand,'thumb',side*-.92,-.15,-.25,.55,1.25,.7,'glove',.23);thumb.rotation.z=side*-.42;
    const badge=new THREE.Mesh(new THREE.PlaneGeometry(1.65,file==='school'?1.65:1.4),new THREE.MeshStandardMaterial({map:badgeTexture(file,onLoad),transparent:true,roughness:1,side:THREE.FrontSide}));
    badge.position.set(side*1.09,-1.95,0);badge.rotation.y=side*Math.PI/2;badge.name=side<0?'left-school-badge':'right-worldskills-badge';badge.layers.set(1);arm.add(badge);badges.push(badge);
  }

  const head=new THREE.Group();head.name='head';upper.add(head);
  part(head,'neck',0,26.95,.3,2.6,1.5,2.8,'skin',.35);
  part(head,'head-shape',0,30.7,.05,6.2,6.5,5.3,'skin',1.1);
  for(const side of [-1,1]) {
    sphere(head,'ear',side*3.12,30.4,.2,.6,.9,.45,'skin');
    sphere(head,'eye',side*1.06,31.2,-2.62,.19,.37,.08,'black');
  }
  sphere(head,'nose',0,30.35,-2.68,.28,.34,.23,'skin');
  const smile=new THREE.CatmullRomCurve3([new THREE.Vector3(-.65,29.6,-2.65),new THREE.Vector3(0,29.34,-2.7),new THREE.Vector3(.65,29.6,-2.65)]);
  head.add(new THREE.Mesh(new THREE.TubeGeometry(smile,16,.045,6,false),mats.black));
  part(head,'hair-cap',0,33.25,.1,6.45,2.1,5.5,'hair',.65);
  for(let i=0;i<7;i++){const tuft=part(head,`hair-tuft-${i}`,(i-3)*.75,34.05+(i%3)*.15,(i%2)*1.2-.15,2.4,1.55,2.5,'hair',.5);tuft.rotation.z=(i-3)*.15;tuft.rotation.y=(i%2?1:-1)*.2;}
  for(let i=0;i<5;i++) {
    const fringe=part(head,`fringe-${i}`,(i-2)*1.12,32.75,-2.55,1.75,2.0,.9,'hair',.3);fringe.rotation.z=(i-2)*.15;
  }
  head.traverse(o=>o.layers.set(1));

  const pelvis=part(root,'trouser-waist',0,12.8,.25,6.65,2.5,3.65,'pants',.42);
  const legs=[];
  for(const side of [-1,1]) {
    const thigh=part(root,'trouser-thigh',side*1.65,9.3,.2,2.75,1,3.1,'pants',.32);
    const shin=part(root,'trouser-shin',side*1.65,3.8,0,2.5,1,2.65,'pants',.28);
    const knee=sphere(root,'cloth-knee',side*1.65,7,0,1.32,.95,1.4,'pants');
    const foot=new THREE.Group();foot.position.set(side*1.65,0,-1.2);root.add(foot);
    part(foot,'shoe-sole',0,.24,0,2.6,.4,4.6,'sole',.18);
    part(foot,'shoe',0,.94,.04,2.46,1.14,4.3,'shoe',.37);
    for(let i=0;i<3;i++)part(foot,'laces',0,1.55,-.28+i*.4,1.4,.04,.075,'seam',.016);
    legs.push({side,thigh,shin,foot,knee});
  }
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(5.4,32),new THREE.MeshBasicMaterial({color:'#101820',transparent:true,opacity:.13,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.025;root.add(shadow);
  const up=new THREE.Vector3(0,1,0);
  function bone(mesh,a,b) {const delta=b.clone().sub(a);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.scale.y=delta.length();mesh.quaternion.setFromUnitVectors(up,delta.normalize());}
  function pose(stride=0,crouch=0) {
    upper.position.y=-5.6*crouch;pelvis.position.y=12.8-5.6*crouch;
    for(const leg of legs) {
      const step=stride*leg.side,lift=Math.max(0,step)*.9;
      const hip=new THREE.Vector3(leg.side*1.65,12.6-5.6*crouch,.5);
      const ankle=new THREE.Vector3(leg.side*1.65,1.45+lift,-.2-step*.8);
      const dir=ankle.clone().sub(hip),distance=Math.min(dir.length(),11.59);dir.normalize();
      const a=5.8,b=5.8,along=(a*a-b*b+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,a*a-along*along));
      const knee=hip.clone().addScaledVector(dir,along).add(new THREE.Vector3(0,-dir.z,dir.y).multiplyScalar(height));
      bone(leg.thigh,hip,knee);bone(leg.shin,knee,ankle);leg.knee.position.copy(knee);leg.foot.position.set(leg.side*1.65,lift,-1.2-step*.8);
    }
  }
  pose();root.userData.uniform={...UNIFORM};root.userData.rig={pose,badges,head,snap};
  return root;
}
