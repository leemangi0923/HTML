"""Run with Blender 4.3+: blender -b --python scripts/build-godot-character.py.
Original, smooth skinned school-uniform character; no external model dependency.
Blender uses Z-up / +Y forward. glTF export maps that to Godot Y-up / -Z forward.
"""
import bpy, math, os, random
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'godot-workshop/assets/character'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for action in list(bpy.data.actions): bpy.data.actions.remove(action)
random.seed(23)

def linear(v): return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def material(name, value, rough=.8):
    m=bpy.data.materials.new(name);m.use_nodes=True
    col=tuple(linear(int(value[i:i+2],16)/255) for i in (0,2,4))+(1,)
    m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=col
    m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=rough
    m.diffuse_color=col;return m
M={k:material(k,c) for k,c in {'Navy':'25304b','Gray':'85858b','Stripe':'e1e2da','Cuff':'19243a','Pants':'1e2940','Skin':'dfb48c','Hair':'29282c','Eye':'222126','Sole':'cdd0cd','Shoe':'303540','Glove':'c2c3bd','Grip':'555b59','Seam':'354158','Snap':'303740','Lip':'9e7158'}.items()}
objects=[]
def smooth(obj, subdivision=1):
    for p in obj.data.polygons: p.use_smooth=True
    if subdivision:
        mod=obj.modifiers.new('Surface smoothing','SUBSURF');mod.levels=subdivision
        bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

def mesh(name,verts,faces,mats,subdivision=1):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj)
    for mat in mats:data.materials.append(mat)
    smooth(obj,subdivision);objects.append(obj);return obj

def weights(obj,fn):
    groups={}
    for v in obj.data.vertices:
        for name,weight in fn(v.co).items():
            if weight>.00001:
                if name not in groups:groups[name]=obj.vertex_groups.new(name=name)
                groups[name].add([v.index],weight,'REPLACE')
    return obj

def rigid(obj,bone):return weights(obj,lambda v:{bone:1})
def mix(a,b,t):
    t=max(0,min(1,t));return {a:1-t,b:t}
def body_weight(v):
    z=v.z
    if z<1.01:return {'Hips':1}
    if z<1.16:return mix('Hips','Spine',(z-1.01)/.15)
    if z<1.29:return mix('Spine','Chest',(z-1.16)/.13)
    return {'Chest':1}

def sphere(name,center,scale,mat,bone,rot=(0,0,0),segments=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=14,location=center)
    o=bpy.context.object;o.name=name;o.scale=scale;o.rotation_euler=rot
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    o.data.materials.append(M[mat]);smooth(o,0);objects.append(o);rigid(o,bone);return o

def tube(name,points,radius,mat,bone):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=8;curve.bevel_depth=radius;curve.bevel_resolution=3
    s=curve.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
    for p,co in zip(s.bezier_points,points):p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False)
    o.data.materials.append(M[mat]);objects.append(o);rigid(o,bone);return o

def jacket_fold(x,z):
    # Shallow tension folds run diagonally from the waist and pocket openings.
    fold=0
    for height,slant,depth in [(.86,.16,.0028),(.921,-.10,-.0025),(.981,.14,.0022),(1.065,-.17,-.0018)]:
        fold+=depth*math.exp(-((z-height-slant*abs(x))/.012)**2)
    return fold*min(1,max(0,(.205-abs(x))/.035))

def loft(name,rings,mats,mat_fn=None,weight_fn=None,segments=24,sub=1):
    # rings: center x/y/z, cross-section radii x/y; gentle cloth waviness only.
    verts=[]
    for i,(x,y,z,rx,ry) in enumerate(rings):
        for j in range(segments):
            t=2*math.pi*j/segments
            wrinkle=1+.004*math.sin(j*3+i*1.8)
            vx=x+rx*math.cos(t)*wrinkle;vy=y+ry*math.sin(t)*wrinkle
            if name=='Jacket':
                vy+=jacket_fold(vx,z)*math.sin(t)
            elif name.startswith('Sleeve_'):
                amount=.0035*math.exp(-((z-1.105)/.09)**2)+.002*math.exp(-((z-.92)/.035)**2)
                ripple=amount*math.sin(z*115+t*2.5)
                vx+=math.cos(t)*ripple;vy+=math.sin(t)*ripple
            elif name.startswith('Trouser_leg_'):
                amount=.0035*math.exp(-((z-.49)/.10)**2)+.003*math.exp(-((z-.17)/.07)**2)
                ripple=amount*math.sin(z*87+t*2)
                vx+=math.cos(t)*ripple;vy+=math.sin(t)*ripple
            verts.append((vx,vy,z))
    faces=[]
    for i in range(len(rings)-1):
        for j in range(segments):faces.append((i*segments+j,i*segments+(j+1)%segments,(i+1)*segments+(j+1)%segments,(i+1)*segments+j))
    faces.extend([tuple(reversed(range(segments))),tuple((len(rings)-1)*segments+j for j in range(segments))])
    o=mesh(name,verts,faces,mats,0)
    if mat_fn:
        for p in o.data.polygons:p.material_index=mat_fn(p.center if False else sum((o.data.vertices[v].co for v in p.vertices),Vector())/len(p.vertices))
    smooth(o,sub)
    if weight_fn:weights(o,weight_fn)
    return o

# Continuous coat silhouette, with gray shoulder/yoke faces in the same mesh.
TORSO=[(.800,.177,.101),(.808,.184,.107),(.84,.190,.110),(.865,.191,.111),(.885,.190,.109),(.91,.190,.108),(.94,.188,.106),(.97,.184,.103),(1.00,.181,.100),(1.035,.182,.102),(1.065,.182,.104),(1.10,.183,.107),(1.18,.197,.120),(1.26,.211,.124),(1.31,.214,.117),(1.33,.214,.111),(1.36,.207,.101),(1.39,.190,.091),(1.405,.153,.079),(1.412,.111,.066)]
coat=loft('Jacket',[(0,0,z,x,y) for z,x,y in TORSO],[M['Navy'],M['Gray']],lambda p:1 if p.z>1.33 else 0,body_weight,segments=48,sub=2)

def torso_r(z):
    for a,b in zip(TORSO,TORSO[1:]):
        if a[0]<=z<=b[0]:
            t=(z-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t
    return TORSO[-1][1:]
def front_y(x,z):
    rx,ry=torso_r(z);return ry*math.sqrt(max(.03,1-(x/rx)**2))+jacket_fold(x,z)
def cloth_patch(name,z0,z1,x0,x1,mat,back=False):
    verts=[];faces=[];nz=12;nx=10
    for i in range(nz+1):
        z=z0+(z1-z0)*i/nz
        for j in range(nx+1):
            x=x0+(x1-x0)*j/nx;y=front_y(x,z)+.0015
            verts.append((x,-y if back else y,z))
    for i in range(nz):
        for j in range(nx):
            a=i*(nx+1)+j;faces.append((a,a+nx+1,a+nx+2,a+1) if not back else (a,a+1,a+nx+2,a+nx+1))
    return weights(mesh(name,verts,faces,[M[mat]],0),body_weight)
cloth_patch('Concealed_zipper_fabric_placket',.805,1.405,-.016,.016,'Navy')
# Very subtle placket stitch, no zipper teeth or pull tab.
for x in [-.013,.013]:
    o=tube('Placket_stitch',[(x,front_y(x,z)+.002,z) for z in [.82,.98,1.14,1.30,1.39]],.00065,'Seam','Chest')
    o.vertex_groups.clear();weights(o,body_weight)
sphere('Top_snap',(0,front_y(0,1.393)+.004,1.393),(.005,.002,.005),'Snap','Chest')
for side in [-1,1]:
    x0,x1=(.018,.193) if side>0 else (-.193,-.018)
    cloth_patch('Chest_reflective_stripe',1.211,1.223,x0,x1,'Stripe')
    pocket=tube('Pocket_seam',[(side*.134,front_y(side*.134,z)+.002,z) for z in [.87,.91,.95]],.0008,'Seam','Spine');pocket.vertex_groups.clear();weights(pocket,body_weight)
    seam=tube('Jacket_side_topstitch',[(side*torso_r(z)[0]*.94,.034,z) for z in [.82,.89,.96,1.04,1.12,1.20,1.26]],.00065,'Seam','Spine');seam.vertex_groups.clear();weights(seam,body_weight)
cloth_patch('Chest_name_patch',1.247,1.270,-.148,-.089,'Stripe')
cloth_patch('Back_reflective_yoke_stripe',1.305,1.315,-.190,.190,'Stripe',True)
cloth_patch('Back_hem_stripe',.819,.826,-.17,.17,'Stripe',True)
# Soft collar leaves, snug rather than floating shoulder plates.
for side in [-1,1]:
    vs=[(side*.012,.074,1.418),(side*.062,.069,1.444),(side*.105,.067,1.403),(side*.070,.103,1.374)]
    o=mesh('Collar',vs,[(0,1,2,3)],[M['Navy']],0)
    mod=o.modifiers.new('Fabric thickness','SOLIDIFY');mod.thickness=.003;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name);rigid(o,'Chest')
loft('Head_Neck',[(0,0,1.39,.047,.044),(0,0,1.47,.047,.044),(0,0,1.49,.045,.043)],[M['Skin']],weight_fn=lambda v:{'Neck':1},sub=1)

# Smooth complete sleeves, graded weights across elbow and wrist.
def arm_center(side,z):
    t=max(0,min(1,(1.365-z)/.50));return side*(.205+.087*t),.01+.10*t

def arm_weight(side,v):
    s='L' if side<0 else 'R';z=v.z
    if z>1.31:return mix('UpperArm.'+s,'Chest',(z-1.31)/.10)
    if z>1.15:return {'UpperArm.'+s:1}
    if z>1.055:return mix('Forearm.'+s,'UpperArm.'+s,(z-1.055)/.095)
    if z>.91:return {'Forearm.'+s:1}
    return mix('Hand.'+s,'Forearm.'+s,(z-.86)/.05)

for side in [-1,1]:
    suffix='L' if side<0 else 'R'
    rings=[]
    for z,rx,ry in [(1.39,.034,.045),(1.37,.047,.059),(1.33,.054,.061),(1.27,.055,.059),(1.20,.051,.054),(1.14,.048,.051),(1.11,.050,.052),(1.08,.047,.050),(1.02,.045,.048),(.97,.043,.046),(.92,.040,.044),(.89,.037,.041),(.88,.035,.039)]:
        x,y=arm_center(side,z);rings.append((x,y,z,rx,ry))
    loft('Sleeve_'+suffix,rings,[M['Gray'],M['Navy']],lambda v,s=side:1 if (v.x-arm_center(s,v.z)[0])*s<-.025 else 0,lambda v,s=side:arm_weight(s,v),sub=2)
    x,y=arm_center(side,.885)
    loft('Navy_cuff_'+suffix,[(x,y,z,.037,.041) for z in [.864,.868,.889,.894]],[M['Cuff']],weight_fn=lambda v,s=side:arm_weight(s,v),sub=1)
    for z in [.869,.889]:
        cx,cy=arm_center(side,z)
        seam=tube('Cuff_stitch_'+suffix,[(cx+.0376*math.cos(t*math.tau/24),cy+.0415*math.sin(t*math.tau/24),z) for t in range(25)],.00055,'Seam','Hand.'+suffix)
        seam.vertex_groups.clear();weights(seam,lambda v,s=side:arm_weight(s,v))
    hx,hy=arm_center(side,.865)
    sphere('Glove_'+suffix,(hx,hy+.005,.824),(.038,.025,.049),'Glove','Hand.'+suffix)
    sphere('Glove_grip_'+suffix,(hx-side*.025,hy,.822),(.014,.020,.034),'Grip','Hand.'+suffix)
    for i in range(4):
        fx=hx+(i-1.5)*.017
        length=[.029,.037,.035,.027][i]
        sphere('Finger_'+suffix,(fx,hy+.012,.785-length*.30),(.008,.010,length*.68),'Glove','Hand.'+suffix,rot=(.2,0,0),segments=16)
        sphere('Finger_tip_'+suffix,(fx,hy+.019,.774-length*.5),(.0075,.008,.012),'Grip','Hand.'+suffix,segments=16)
    sphere('Thumb_'+suffix,(hx-side*.039,hy+.018,.817),(.014,.018,.027),'Glove','Hand.'+suffix,rot=(.15,side*.5,0),segments=20)
    # Outward-facing upper-arm decal, curved to the sleeve. UVs never mirrored.
    file='school' if side<0 else 'worldskills';mat=bpy.data.materials.new('Badge_'+file);mat.use_nodes=True
    bs=mat.node_tree.nodes.get('Principled BSDF');image=mat.node_tree.nodes.new('ShaderNodeTexImage');image.image=bpy.data.images.load(str(ROOT/'art-source/decals'/f'{file}.png'));image.image.pack();mat.node_tree.links.new(image.outputs['Color'],bs.inputs['Base Color']);mat.node_tree.links.new(image.outputs['Alpha'],bs.inputs['Alpha']);bs.inputs['Roughness'].default_value=.88;mat.surface_render_method='DITHERED';mat.use_backface_culling=True
    verts=[];uv=[];faces=[];n=12
    for j in range(n+1):
        v=j/n;z=1.255+(v-.5)*.072;cx,cy=arm_center(side,z)
        for i in range(n+1):
            u=i/n;dy=side*(u-.5)*.064
            verts.append((cx+side*(.054*math.sqrt(max(.03,1-(dy/.059)**2))+.001),cy+dy,z));uv.append((u,v))
    for j in range(n):
        for i in range(n):
            a=j*(n+1)+i;face=(a,a+1,a+n+2,a+n+1)
            # dU x dV points outward because the U direction follows the sleeve side.
            faces.append(face)
    o=mesh('BadgeSchool_L' if side<0 else 'BadgeWorldSkills_R',verts,faces,[mat],0)
    layer=o.data.uv_layers.new(name='UVMap')
    for polygon in o.data.polygons:
        for li in polygon.loop_indices:layer.data[li].uv=uv[o.data.loops[li].vertex_index]
    weights(o,lambda v,s=side:arm_weight(s,v))

# Plain trousers: a hidden waist and two unbroken skinned legs, without knee pads.
loft('Trousers_waist',[(0,0,z,x,y) for z,x,y in [(.85,.174,.094),(.90,.177,.098),(.94,.173,.096)]],[M['Pants']],weight_fn=lambda v:{'Hips':1},sub=1)
for side in [-1,1]:
    suffix='L' if side<0 else 'R'
    rings=[]
    leg_radii=[(.91,.088,.080),(.86,.086,.081),(.79,.083,.087),(.71,.077,.090),(.63,.069,.081),(.57,.065,.075),(.55,.064,.074),(.53,.064,.074),(.51,.064,.073),(.49,.064,.072),(.47,.063,.071),(.45,.062,.070),(.43,.061,.069),(.35,.061,.070),(.26,.058,.067),(.22,.057,.067),(.195,.057,.066),(.17,.055,.065),(.145,.055,.063),(.12,.055,.062),(.108,.053,.060)]
    for z,rx,ry in leg_radii:rings.append((side*.096,0,z,rx,ry))
    def lw(v,s=suffix):
        if v.z>.58:return {'Thigh.'+s:1}
        if v.z<.43:return {'Shin.'+s:1}
        return mix('Shin.'+s,'Thigh.'+s,(v.z-.43)/.15)
    loft('Trouser_leg_'+suffix,rings,[M['Pants']],weight_fn=lw,sub=2)
    seam=tube('Trouser_side_seam_'+suffix,[(side*(.096+rx)+side*.0006,.005,z) for z,rx,ry in leg_radii],.0005,'Seam','Thigh.'+suffix);seam.vertex_groups.clear();weights(seam,lw)
    # Sneaker as smooth cross sections along its long axis, white sole layer.
    def shoe_surface(name,sole):
        verts=[];faces=[];n=24
        rows=[(-.070,.026),(-.059,.047),(-.01,.054),(.05,.057),(.12,.059),(.178,.050),(.205,.025)]
        for j,(y,rx) in enumerate(rows):
            for k in range(n):
                a=2*math.pi*k/n
                if sole:z=.024+.015*math.sin(a)
                else:z=.060+(.032 if y<.10 else .024)*math.sin(a)
                verts.append((side*.096+rx*math.cos(a),y,z))
        for j in range(len(rows)-1):
            for k in range(n):a=j*n+k;faces.append((a,j*n+(k+1)%n,(j+1)*n+(k+1)%n,a+n))
        faces.extend([tuple(reversed(range(n))),tuple((len(rows)-1)*n+k for k in range(n))])
        return rigid(mesh(name,verts,[tuple(reversed(f)) for f in faces],[M['Sole' if sole else 'Shoe']],1),'Foot.'+suffix)
    shoe_surface('Shoe_sole_'+suffix,True);shoe_surface('Sneaker_'+suffix,False)
    for i in range(3):tube('Shoe_lace_'+suffix,[(side*.096-.025,.025+i*.023,.092),(side*.096,.021+i*.023,.099),(side*.096+.025,.025+i*.023,.092)],.0017,'Seam','Foot.'+suffix)

# A narrower oval head and continuous swept hair silhouette, hidden from FP.
loft('Head_Face',[(0,0,z,x,y) for z,x,y in [(1.475,.037,.043),(1.493,.061,.065),(1.52,.082,.079),(1.56,.092,.086),(1.61,.093,.089),(1.65,.091,.086),(1.685,.077,.069),(1.705,.044,.035)]],[M['Skin']],weight_fn=lambda v:{'Head':1},segments=32,sub=2)
for side in [-1,1]:
    sphere('Head_Ear',(side*.092,.001,1.581),(.012,.018,.025),'Skin','Head')
    sphere('Head_Eye',(side*.036,.087,1.608),(.0075,.003,.0045),'Eye','Head')
    tube('Head_Eyebrow',[(side*.020,.083,1.627),(side*.036,.086,1.630),(side*.052,.079,1.626)],.0019,'Hair','Head')
sphere('Head_Nose',(0,.094,1.584),(.010,.012,.014),'Skin','Head')
tube('Head_Smile',[(-.029,.087,1.559),(0,.092,1.552),(.029,.087,1.559)],.0018,'Lip','Head')
hair=loft('Head_Hair_cap',[(0,-.006,z,x,y) for z,x,y in [(1.635,.092,.085),(1.66,.097,.089),(1.69,.090,.080),(1.713,.068,.059),(1.725,.030,.029)]],[M['Hair']],weight_fn=lambda v:{'Head':1},segments=48,sub=2)
for vertex in hair.data.vertices:
    co=vertex.co
    if co.z>1.65:
        co.z+=.002*math.sin(co.x*95+co.y*30)
for i in range(5):
    x=(i-2)*.029
    tube('Head_Hair_flow',[(x-.009,-.035,1.710),(x,.010,1.710),(x+.018,.056,1.689),(x+.020,.077,1.652)],.003,'Hair','Head')

for obj in objects:
    if obj.name.startswith('Head_'):
        for vertex in obj.data.vertices:vertex.co.z-=.020

# Humanoid skeleton, skin weights, IK-baked leg animation.
bpy.ops.object.armature_add(enter_editmode=True)
rig=bpy.context.object;rig.name='StudentRig';rig.data.name='StudentSkeleton';rig.data.edit_bones.remove(rig.data.edit_bones[0])
bones={}
def bone(name,head,tail,parent=None,deform=True):
    b=rig.data.edit_bones.new(name);b.head=head;b.tail=tail;b.use_deform=deform
    if parent:b.parent=bones[parent]
    bones[name]=b;return b
bone('Root',(0,0,0),(0,0,.12))
bone('Hips',(0,0,.90),(0,0,1.04),'Root')
bone('Spine',(0,0,1.04),(0,0,1.19),'Hips')
bone('Chest',(0,0,1.19),(0,0,1.39),'Spine')
bone('Neck',(0,0,1.39),(0,0,1.475),'Chest')
bone('Head',(0,0,1.475),(0,0,1.71),'Neck')
for side in [-1,1]:
    s='L' if side<0 else 'R'
    bone('UpperArm.'+s,(side*.205,.01,1.365),(side*.26,.06,1.10),'Chest')
    bone('Forearm.'+s,(side*.26,.06,1.10),(side*.292,.11,.88),'UpperArm.'+s)
    bone('Hand.'+s,(side*.292,.11,.88),(side*.30,.125,.76),'Forearm.'+s)
    bone('Thigh.'+s,(side*.096,0,.90),(side*.096,.005,.50),'Hips')
    bone('Shin.'+s,(side*.096,.005,.50),(side*.096,0,.09),'Thigh.'+s)
    bone('Foot.'+s,(side*.096,0,.09),(side*.096,.16,.04),'Shin.'+s)
    bone('TargetFoot.'+s,(side*.096,0,.09),(side*.096,.16,.04),'Root',False)
    bone('PoleKnee.'+s,(side*.096,.8,.50),(side*.096,.8,.62),'Root',False)
bpy.ops.object.mode_set(mode='OBJECT')
for side in ['L','R']:
    ik=rig.pose.bones['Shin.'+side].constraints.new('IK');ik.target=rig;ik.subtarget='TargetFoot.'+side;ik.chain_count=2;ik.pole_target=rig;ik.pole_subtarget='PoleKnee.'+side;ik.pole_angle=math.pi/2
    copy=rig.pose.bones['Foot.'+side].constraints.new('COPY_TRANSFORMS');copy.target=rig;copy.subtarget='TargetFoot.'+side;copy.target_space='POSE';copy.owner_space='POSE'
for obj in objects:
    mod=obj.modifiers.new('Skin','ARMATURE');mod.object=rig;obj.parent=rig
for b in rig.pose.bones:b.rotation_mode='XYZ'
scene=bpy.context.scene;scene.render.fps=30

def offset_global(pb,delta):pb.location=pb.bone.matrix_local.to_3x3().inverted()@Vector(delta)
for name,crouch,moving,period in [('Idle',False,False,60),('Walk',False,True,24),('CrouchIdle',True,False,60),('CrouchWalk',True,True,24)]:
    action=bpy.data.actions.new(name);rig.animation_data_create();rig.animation_data.action=action;action.use_fake_user=True
    for f in range(period+1):
        phase=2*math.pi*f/period
        for pb in rig.pose.bones:pb.location=(0,0,0);pb.rotation_euler=(0,0,0);pb.scale=(1,1,1)
        drop=.36 if crouch else 0
        offset_global(rig.pose.bones['Hips'],(.004*math.sin(phase) if moving else 0,-.10 if crouch else 0,-drop+(.006*math.cos(phase*2) if moving else .0015*math.sin(phase))))
        rig.pose.bones['Spine'].rotation_euler.x=-.24 if crouch else -.012
        rig.pose.bones['Chest'].rotation_euler.x=-.10 if crouch else 0
        rig.pose.bones['Neck'].rotation_euler.x=.23 if crouch else 0
        for i,s in enumerate(['L','R']):
            t=(f/period+i*.5)%1
            travel=.15 if crouch else .25
            if moving:
                if t<.6:y=travel*(1-2*t/.6);lift=0
                else:u=(t-.6)/.4;y=travel*(-1+2*u);lift=math.sin(math.pi*u)*(.055 if crouch else .075)
                offset_global(rig.pose.bones['TargetFoot.'+s],(0,y,lift))
            swing=math.sin(phase+i*math.pi)*(.18 if crouch else .30) if moving else 0
            rig.pose.bones['UpperArm.'+s].rotation_euler.x=swing+.06
            rig.pose.bones['Forearm.'+s].rotation_euler.x=.25+(.04*abs(math.sin(phase)) if moving else 0)
        for pb in rig.pose.bones:
            pb.keyframe_insert('location',frame=f);pb.keyframe_insert('rotation_euler',frame=f)
    for fc in action.fcurves:
        for key in fc.keyframe_points:key.interpolation='LINEAR'
rig.animation_data.action=bpy.data.actions['Idle'];scene.frame_set(0);scene.frame_start=0;scene.frame_end=60
# Authoring source lives outside the Godot project: opening the ZIP never needs Blender.
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art-source/student-uniform.blend'),compress=True)
props=bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
options=dict(filepath=str(OUT/'student-uniform.glb'),export_format='GLB',export_yup=True,export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_def_bones=True,export_force_sampling=True,export_bake_animation=True,export_apply=False)
options={k:v for k,v in options.items() if k in props}
bpy.ops.export_scene.gltf(**options)
print('CHARACTER COMPLETE',len(objects),'meshes',len(rig.data.bones),'bones',[(a.name,a.frame_range[:]) for a in bpy.data.actions])
