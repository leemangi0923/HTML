"""Run with Blender 4.3+: blender -b --python scripts/build-godot-character.py.
Original, smooth skinned school-uniform character; no external model dependency.
Blender uses Z-up / +Y forward. glTF export maps that to Godot Y-up / -Z forward.
"""
import bpy, math, os, random
from pathlib import Path
from mathutils import Vector, Quaternion
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
M={k:material(k,c) for k,c in {'Navy':'263247','Gray':'85858b','Stripe':'bfc3bd','Cuff':'222e43','Pants':'243047','Skin':'d3aa8c','Nail':'d1b4a1','Hair':'29282c','Eye':'222126','Sole':'cdd0cd','Shoe':'303540','Seam':'39445a','Facing':'9b9b98','Snap':'79735d','Lip':'9e7158'}.items()}
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
    if rings[-1][2]<rings[0][2]:
        faces=[tuple(reversed(face)) for face in faces]
    o=mesh(name,verts,faces,mats,0)
    if mat_fn:
        for p in o.data.polygons:p.material_index=mat_fn(p.center if False else sum((o.data.vertices[v].co for v in p.vertices),Vector())/len(p.vertices))
    smooth(o,sub)
    if weight_fn:weights(o,weight_fn)
    return o

# Continuous coat silhouette, with gray shoulder/yoke faces in the same mesh.
TORSO=[(.800,.177,.101),(.808,.184,.107),(.84,.190,.110),(.865,.191,.111),(.885,.190,.109),(.91,.190,.108),(.94,.188,.106),(.97,.184,.103),(1.00,.181,.100),(1.035,.182,.102),(1.065,.182,.104),(1.10,.183,.107),(1.18,.197,.120),(1.26,.211,.124),(1.31,.214,.117),(1.33,.214,.111),(1.36,.207,.101),(1.39,.190,.091),(1.405,.153,.079),(1.412,.111,.066)]
coat=loft('Jacket',[(0,0,z,x,y) for z,x,y in TORSO],[M['Navy'],M['Gray']],lambda p:1 if p.z>1.33 and p.y<-.025 else 0,body_weight,segments=48,sub=2)

def torso_r(z):
    for a,b in zip(TORSO,TORSO[1:]):
        if a[0]<=z<=b[0]:
            t=(z-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t
    return TORSO[-1][1:]
def front_y(x,z):
    rx,ry=torso_r(z);return ry*math.sqrt(max(.03,1-(x/rx)**2))+jacket_fold(x,z)
def cloth_patch(name,z0,z1,x0,x1,mat,back=False,offset=.0008):
    verts=[];faces=[];nz=12;nx=10
    for i in range(nz+1):
        z=z0+(z1-z0)*i/nz
        for j in range(nx+1):
            x=x0+(x1-x0)*j/nx;y=front_y(x,z)+offset
            verts.append((x,-y if back else y,z))
    for i in range(nz):
        for j in range(nx):
            a=i*(nx+1)+j;faces.append((a,a+nx+1,a+nx+2,a+1) if not back else (a,a+1,a+nx+2,a+nx+1))
    return weights(mesh(name,verts,faces,[M[mat]],0),body_weight)
placket=cloth_patch('Concealed_zipper_fabric_placket',.805,1.405,-.028,.028,'Navy',offset=.003)
mod=placket.modifiers.new('Overlapping cloth flap','SOLIDIFY');mod.thickness=.0015
bpy.context.view_layer.objects.active=placket;bpy.ops.object.modifier_apply(modifier=mod.name)
# Very subtle placket stitch, no zipper teeth or pull tab.
for x in [-.025,.025]:
    o=tube('Placket_stitch',[(x,front_y(x,z)+.0038,z) for z in [.82,.98,1.14,1.30,1.39]],.00045,'Seam','Chest')
    o.vertex_groups.clear();weights(o,body_weight)
sphere('Top_snap',(0,front_y(0,1.393)+.005,1.393),(.005,.002,.005),'Snap','Chest')
o=tube('Placket_inner_gray_edge',[(.028,front_y(.028,z)+.003,z) for z in [1.26,1.31,1.36,1.40]],.00085,'Facing','Chest')
o.vertex_groups.clear();weights(o,body_weight)
for side in [-1,1]:
    x0,x1=(.029,.193) if side>0 else (-.193,-.029)
    cloth_patch('Chest_reflective_stripe',1.201,1.218,x0,x1,'Stripe')
    pocket=tube('Pocket_seam',[(side*.134,front_y(side*.134,z)+.002,z) for z in [.87,.91,.95]],.0008,'Seam','Spine');pocket.vertex_groups.clear();weights(pocket,body_weight)
    seam=tube('Jacket_side_topstitch',[(side*torso_r(z)[0]*.94,.034,z) for z in [.82,.89,.96,1.04,1.12,1.20,1.26]],.00065,'Seam','Spine');seam.vertex_groups.clear();weights(seam,body_weight)
cloth_patch('Chest_name_patch',1.247,1.267,-.148,-.089,'Gray')
cloth_patch('Back_reflective_yoke_stripe',1.305,1.315,-.190,.190,'Stripe',True)
cloth_patch('Back_hem_stripe',.819,.826,-.17,.17,'Stripe',True)
# Soft collar leaves, snug rather than floating shoulder plates.
for side in [-1,1]:
    vs=[(side*.014,.069,1.418),(side*.051,.063,1.441),(side*.080,.067,1.409),(side*.055,.085,1.390)]
    o=mesh('Collar',vs,[(0,1,2,3)],[M['Navy']],0)
    mod=o.modifiers.new('Fabric thickness','SOLIDIFY');mod.thickness=.003;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name);rigid(o,'Chest')
loft('Head_Neck',[(0,0,1.39,.047,.044),(0,0,1.47,.047,.044),(0,0,1.49,.045,.043)],[M['Skin']],weight_fn=lambda v:{'Neck':1},sub=1)

# Smooth complete sleeves, graded weights across elbow and wrist.
def arm_center(side,z):
    # Upper arms hang near the ribs. The neutral forearm already has a small
    # anatomical bend; animation adds flexion around the elbow, not a sideways kink.
    if z>=1.095:
        t=max(0,min(1,(1.365-z)/.270));return side*(.205+.020*t),.010+.018*t
    t=max(0,min(1,(1.095-z)/.230));return side*.225,.028+.097*t

def arm_weight(side,v):
    s='L' if side<0 else 'R';z=v.z
    if z>1.31:return mix('UpperArm.'+s,'Chest',(z-1.31)/.10)
    if z>1.15:return {'UpperArm.'+s:1}
    if z>1.055:return mix('Forearm.'+s,'UpperArm.'+s,(z-1.055)/.095)
    # Cloth follows the forearm. Wrist pronation belongs to the bare hand and
    # must not twist or flare the sleeve opening with the hand.
    return {'Forearm.'+s:1}

for side in [-1,1]:
    suffix='L' if side<0 else 'R'
    rings=[]
    for z,rx,ry in [(1.39,.030,.040),(1.37,.047,.059),(1.33,.057,.065),(1.27,.058,.063),(1.20,.054,.059),(1.16,.052,.056),(1.13,.053,.056),(1.105,.053,.056),(1.08,.050,.053),(1.055,.047,.050),(1.02,.046,.050),(.97,.043,.048),(.92,.038,.043),(.89,.032,.036),(.88,.030,.033)]:
        x,y=arm_center(side,z);rings.append((x,y,z,rx,ry))
    loft('Sleeve_'+suffix,rings,[M['Navy'],M['Gray']],lambda v,s=side:1 if (v.x-arm_center(s,v.z)[0])*s>.028 else 0,lambda v,s=side:arm_weight(s,v),segments=48,sub=2)
    x,y=arm_center(side,.885)
    loft('Navy_cuff_'+suffix,[(x,y,z,.030,.033) for z in [.864,.868,.889,.894]],[M['Cuff']],weight_fn=lambda v,s=side:arm_weight(s,v),sub=1)
    for z in [.869,.889]:
        cx,cy=arm_center(side,z)
        seam=tube('Cuff_stitch_'+suffix,[(cx+.0306*math.cos(t*math.tau/24),cy+.0335*math.sin(t*math.tau/24),z) for t in range(25)],.00045,'Seam','Hand.'+suffix)
        seam.vertex_groups.clear();weights(seam,lambda v,s=side:arm_weight(s,v))
    # Outward-facing upper-arm decal, curved to the sleeve. UVs never mirrored.
    file='school' if side<0 else 'worldskills';mat=bpy.data.materials.new('Badge_'+file);mat.use_nodes=True
    bs=mat.node_tree.nodes.get('Principled BSDF');image=mat.node_tree.nodes.new('ShaderNodeTexImage');image.image=bpy.data.images.load(str(ROOT/'art-source/decals'/f'{file}.png'));image.image.pack();mat.node_tree.links.new(image.outputs['Color'],bs.inputs['Base Color']);mat.node_tree.links.new(image.outputs['Alpha'],bs.inputs['Alpha']);bs.inputs['Roughness'].default_value=.88;mat.surface_render_method='DITHERED';mat.use_backface_culling=True
    verts=[];uv=[];faces=[];n=12
    for j in range(n+1):
        v=j/n;z=1.255+(v-.5)*.072;cx,cy=arm_center(side,z)
        for i in range(n+1):
            u=i/n;dy=side*(u-.5)*.064
            verts.append((cx+side*(.058*math.sqrt(max(.03,1-(dy/.063)**2))+.0015),cy+dy,z));uv.append((u,v))
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

# Bare, inward-facing palms with softly curled fingers. Each finger has two
# deform joints; the relaxed hand no longer uses straight glove-like cylinders.
FINGER_BONES=[]
def finger_mesh(name,points,radius,b1,b2):
    points=[Vector(p) for p in points];verts=[];faces=[];segments=12;rows=13
    for i in range(rows):
        t=i/(rows-1)
        if t<=.55:
            center=points[0].lerp(points[1],t/.55);tangent=(points[1]-points[0]).normalized()
        else:
            center=points[1].lerp(points[2],(t-.55)/.45);tangent=(points[2]-points[1]).normalized()
        axis=tangent.cross(Vector((0,1,0))).normalized();other=tangent.cross(axis).normalized()
        r=radius*(.90+.10*math.sin(math.pi*t))*(max(.12,(1-t)/.13) if t>.87 else 1)
        for j in range(segments):
            angle=j*math.tau/segments
            verts.append(tuple(center+r*(axis*math.cos(angle)+other*math.sin(angle))))
    for i in range(rows-1):
        for j in range(segments):
            a=i*segments+j;faces.append((a,i*segments+(j+1)%segments,(i+1)*segments+(j+1)%segments,a+segments))
    faces.extend([tuple(reversed(range(segments))),tuple((rows-1)*segments+j for j in range(segments))])
    obj=mesh(name,verts,faces,[M['Skin']],1)
    start,end=points[0].z,points[2].z
    weights(obj,lambda v:mix(b1,b2,((start-v.z)/max(.001,start-end)-.35)/.35))
    return obj

for side in [-1,1]:
    s='L' if side<0 else 'R';hx,hy=arm_center(side,.865)
    hand_parts=[]
    palm=loft('Palm_'+s,[(hx,hy,z,rx,ry) for z,rx,ry in [(.873,.014,.023),(.854,.015,.026),(.835,.017,.033),(.808,.017,.039),(.783,.014,.036),(.771,.011,.030)]],[M['Skin']],weight_fn=lambda v,s=s:{'Hand.'+s:1},sub=2)
    hand_parts.append(palm)
    for label,offset,length,radius in [('Index',.025,.073,.0087),('Middle',.008,.083,.0090),('Ring',-.010,.077,.0084),('Little',-.026,.059,.0070)]:
        p0=(hx,hy+offset,.777);p1=(hx-side*.012,hy+offset+.001,.777-length*.55);p2=(hx-side*.029,hy+offset+.003,.777-length)
        b1='Finger'+label+'1.'+s;b2='Finger'+label+'2.'+s
        FINGER_BONES.append((b1,b2,p0,p1,p2,s))
        hand_parts.append(finger_mesh(label+'_'+s,[p0,p1,p2],radius,b1,b2))
        sphere('Nail_'+label+'_'+s,(p2[0]+side*radius*.74,p2[1],p2[2]+.009),(.0018,radius*.66,.008),'Nail',b2,segments=16)
    p0=(hx,hy+.028,.818);p1=(hx-side*.020,hy+.052,.788);p2=(hx-side*.028,hy+.040,.769)
    b1='FingerThumb1.'+s;b2='FingerThumb2.'+s;FINGER_BONES.append((b1,b2,p0,p1,p2,s))
    hand_parts.append(finger_mesh('Thumb_'+s,[p0,p1,p2],.0105,b1,b2))
    sphere('Nail_Thumb_'+s,(p2[0]+side*.008,p2[1],p2[2]+.007),(.002,.006,.007),'Nail',b2,segments=16)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in hand_parts:obj.select_set(True)
    objects[:]=[o for o in objects if o not in hand_parts or o==palm]
    bpy.context.view_layer.objects.active=palm;bpy.ops.object.join();palm.name='Bare_hand_'+s

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
    bone('Clavicle.'+s,(side*.045,.010,1.365),(side*.205,.010,1.365),'Chest')
    bone('UpperArm.'+s,(side*.205,.010,1.365),(side*.225,.028,1.095),'Clavicle.'+s)
    bone('Forearm.'+s,(side*.225,.028,1.095),(side*.225,.125,.865),'UpperArm.'+s)
    bone('Hand.'+s,(side*.225,.125,.865),(side*.225,.125,.775),'Forearm.'+s)
    bone('Thigh.'+s,(side*.096,0,.90),(side*.096,.005,.50),'Hips')
    bone('Shin.'+s,(side*.096,.005,.50),(side*.096,0,.09),'Thigh.'+s)
    bone('Foot.'+s,(side*.096,0,.09),(side*.096,.16,.04),'Shin.'+s)
    bone('TargetFoot.'+s,(side*.096,0,.09),(side*.096,.16,.04),'Root',False)
    bone('PoleKnee.'+s,(side*.096,.8,.50),(side*.096,.8,.62),'Root',False)
for b1,b2,p0,p1,p2,s in FINGER_BONES:
    bone(b1,p0,p1,'Hand.'+s);bone(b2,p1,p2,b1)
bpy.ops.object.mode_set(mode='OBJECT')
for side in ['L','R']:
    ik=rig.pose.bones['Shin.'+side].constraints.new('IK');ik.target=rig;ik.subtarget='TargetFoot.'+side;ik.chain_count=2;ik.pole_target=rig;ik.pole_subtarget='PoleKnee.'+side;ik.pole_angle=math.pi/2
    copy=rig.pose.bones['Foot.'+side].constraints.new('COPY_TRANSFORMS');copy.target=rig;copy.subtarget='TargetFoot.'+side;copy.target_space='POSE';copy.owner_space='POSE'
for obj in objects:
    mod=obj.modifiers.new('Skin','ARMATURE');mod.object=rig;obj.parent=rig
for b in rig.pose.bones:b.rotation_mode='XYZ'
scene=bpy.context.scene;scene.render.fps=30

def offset_global(pb,delta):pb.location=pb.bone.matrix_local.to_3x3().inverted()@Vector(delta)
for name,crouch,moving,working,period in [('Idle',False,False,False,60),('Walk',False,True,False,24),('CrouchIdle',True,False,False,60),('CrouchWalk',True,True,False,24),('WorkIdle',False,False,True,60),('CrouchWorkIdle',True,False,True,60)]:
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
            swing=math.sin(phase+i*math.pi)*(.12 if crouch else .22) if moving else 0
            rig.pose.bones['UpperArm.'+s].rotation_euler.x=(.65 if crouch and working else .15 if working else -.035)+swing
            rig.pose.bones['Forearm.'+s].rotation_euler.x=(1.30 if crouch and working else .97 if working else .38)+(.025*math.sin(phase+i*.4) if not moving else .04*abs(math.sin(phase)))
            rig.pose.bones['Hand.'+s].rotation_euler.y=(1 if s=='L' else -1)*(1.35 if working else .10)
            rig.pose.bones['Hand.'+s].rotation_euler.x=-.15 if working else .03
        for b1,b2,p0,p1,p2,s in FINGER_BONES:
            side=-1 if s=='L' else 1
            thumb='Thumb' in b1
            for name,angle in [(b1,.13 if thumb else .25 if working else .10),(b2,.12 if thumb else .65 if working else .30)]:
                pb=rig.pose.bones[name];axis=pb.bone.matrix_local.to_3x3().inverted()@Vector((0,1,0))
                pb.rotation_euler=Quaternion(axis,side*angle).to_euler()
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
