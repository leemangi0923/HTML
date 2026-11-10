"""Add a rig to the supplied static model; retain its mesh vertices and materials.
Run: blender --disable-autoexec -b --python scripts/rig-imported-character.py
"""
import bpy, math, json, hashlib
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
ROOT=Path(__file__).resolve().parent.parent
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art-source/imported/workwear_character.blend'))
# Bake existing modeling modifiers without changing the evaluated appearance.
import struct
raw=(ROOT/'art-source/imported/workwear_character.glb').read_bytes()
n=struct.unpack_from('<I',raw,12)[0]
allowed={n.get('name') for n in json.loads(raw[20:20+n])['nodes']}
meshes=[o for o in bpy.data.objects if o.type=='MESH' and o.name in allowed]
for obj in list(bpy.data.objects):
    if obj not in meshes:bpy.data.objects.remove(obj,do_unlink=True)
exec((ROOT/'scripts/refine-character-shoes.py').read_text())
rotate=Matrix.Rotation(math.pi,4,'Z')
source_stats={}
for obj in meshes:
    bpy.context.view_layer.objects.active=obj
    for mod in list(obj.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
    source_stats[obj.name]={'vertices':len(obj.data.vertices),'materials':[m.name for m in obj.data.materials]}
    # Original is -Y forward, +X left. Existing workshop uses +Y forward, -X left.
    transform=rotate@obj.matrix_world
    obj.data.transform(transform);obj.matrix_world=Matrix.Identity(4)
    obj.vertex_groups.clear()
    refine_shoe(obj)
    if obj.name.startswith(('Face /','Hair /','Head /')) or obj.name=='Neck':obj.name='Head_'+obj.name.replace(' / ','_')
    elif ' / school patch' in obj.name or ' / WorldSkills patch' in obj.name:obj.name='Badge_'+obj.name.replace(' / ','_')
for image in bpy.data.images:
    if image.source=='FILE' and image.has_data:image.pack()
bpy.ops.object.armature_add(enter_editmode=True)
rig=bpy.context.object;rig.name='UploadedWorkwearRig';rig.data.edit_bones.remove(rig.data.edit_bones[0]);bones={}
def bone(name,a,b,parent=None,deform=True):
    x=rig.data.edit_bones.new(name);x.head=a;x.tail=b;x.use_deform=deform
    if parent:x.parent=bones[parent]
    bones[name]=x
bone('Root',(0,0,0),(0,0,.10));bone('Hips',(0,0,.84),(0,0,.98),'Root')
bone('Spine',(0,0,.98),(0,0,1.14),'Hips');bone('Chest',(0,0,1.14),(0,0,1.32),'Spine')
bone('Neck',(0,0,1.32),(0,0,1.43),'Chest');bone('Head',(0,0,1.43),(0,0,1.75),'Neck')
for side in [-1,1]:
    s='L' if side<0 else 'R'
    bone('Clavicle.'+s,(side*.045,0,1.32),(side*.215,0,1.32),'Chest')
    bone('UpperArm.'+s,(side*.215,0,1.32),(side*.317,.004,1.08),'Clavicle.'+s)
    bone('Forearm.'+s,(side*.317,.004,1.08),(side*.394,.012,.842),'UpperArm.'+s)
    bone('Hand.'+s,(side*.394,.012,.842),(side*.397,.020,.735),'Forearm.'+s)
    bone('Thigh.'+s,(side*.13,0,.84),(side*.13,.003,.49),'Hips')
    bone('Shin.'+s,(side*.13,.003,.49),(side*.13,0,.14),'Thigh.'+s)
    bone('Foot.'+s,(side*.13,0,.14),(side*.13,.18,.075),'Shin.'+s)
    bone('TargetFoot.'+s,(side*.13,0,.14),(side*.13,.18,.075),'Root',False)
    bone('PoleKnee.'+s,(side*.13,.8,.49),(side*.13,.8,.59),'Root',False)
bpy.ops.object.mode_set(mode='OBJECT')
def mix(a,b,t):
    t=max(0,min(1,t));return {a:1-t,b:t}
def body_weight(p):
    if p.z<.95:return {'Hips':1}
    if p.z<1.09:return mix('Hips','Spine',(p.z-.95)/.14)
    if p.z<1.21:return mix('Spine','Chest',(p.z-1.09)/.12)
    return {'Chest':1}
for obj in meshes:
    name=obj.name
    side='L' if ('Left' in name) else 'R'
    def weight(p):
        if name.startswith('Head_'):return {'Neck' if name=='Head_Neck' else 'Head':1}
        if 'glove /' in name:return {'Hand.'+side:1}
        if 'shoe /' in name:return {'Foot.'+side:1}
        if 'sleeve' in name:
            if p.z>1.29:return mix('UpperArm.'+side,'Chest',(p.z-1.29)/.09)
            if p.z>1.13:return {'UpperArm.'+side:1}
            if p.z<1.03:return {'Forearm.'+side:1}
            return mix('Forearm.'+side,'UpperArm.'+side,(p.z-1.03)/.10)
        if 'trouser' in name.lower() and name!='Trousers / hip':
            if p.z>.55:return {'Thigh.'+side:1}
            if p.z<.42:return {'Shin.'+side:1}
            return mix('Shin.'+side,'Thigh.'+side,(p.z-.42)/.13)
        return body_weight(p)
    groups={}
    for v in obj.data.vertices:
        for key,value in weight(v.co).items():
            if value>.00001:
                if key not in groups:groups[key]=obj.vertex_groups.new(name=key)
                groups[key].add([v.index],value,'REPLACE')
    obj.parent=rig;mod=obj.modifiers.new('Workshop skin','ARMATURE');mod.object=rig
for side in ['L','R']:
    ik=rig.pose.bones['Shin.'+side].constraints.new('IK');ik.target=rig;ik.subtarget='TargetFoot.'+side;ik.chain_count=2;ik.pole_target=rig;ik.pole_subtarget='PoleKnee.'+side;ik.pole_angle=math.pi/2
    copy=rig.pose.bones['Foot.'+side].constraints.new('COPY_TRANSFORMS');copy.target=rig;copy.subtarget='TargetFoot.'+side;copy.target_space='POSE';copy.owner_space='POSE'
for pb in rig.pose.bones:pb.rotation_mode='XYZ'
def offset(pb,delta):pb.location=pb.bone.matrix_local.to_3x3().inverted()@Vector(delta)
def world_rotation(pb,q):
    rest=pb.bone.matrix_local.to_quaternion()
    pb.rotation_euler=(rest.inverted()@q@rest).to_euler()
bpy.context.scene.render.fps=30
for name,crouched,moving,period in [('Idle',False,False,60),('Walk',False,True,24),('CrouchIdle',True,False,60),('CrouchWalk',True,True,24)]:
    action=bpy.data.actions.new(name);action.use_fake_user=True;rig.animation_data_create();rig.animation_data.action=action
    for frame in range(period+1):
        phase=math.tau*frame/period
        for pb in rig.pose.bones:pb.location=(0,0,0);pb.rotation_euler=(0,0,0)
        offset(rig.pose.bones['Hips'],(0,-.09 if crouched else 0,(-.31 if crouched else 0)+(.004*math.cos(phase*2) if moving else .001*math.sin(phase))))
        world_rotation(rig.pose.bones['Spine'],Quaternion((1,0,0),-.20 if crouched else -.01))
        world_rotation(rig.pose.bones['Chest'],Quaternion((1,0,0),-.08 if crouched else 0))
        world_rotation(rig.pose.bones['Neck'],Quaternion((1,0,0),.20 if crouched else 0))
        for i,s in enumerate(['L','R']):
            t=(frame/period+i*.5)%1
            if moving:
                travel=.15 if crouched else .25
                if t<.6:y=travel*(1-2*t/.6);z=0
                else:u=(t-.6)/.4;y=travel*(-1+2*u);z=math.sin(math.pi*u)*.06
                offset(rig.pose.bones['TargetFoot.'+s],(0,y,z))
            # Bring the A-pose arms close to the body without altering the mesh.
            side=-1 if s=='L' else 1
            swing=math.sin(phase+i*math.pi)*.20 if moving else 0
            world_rotation(rig.pose.bones['UpperArm.'+s],Quaternion((1,0,0),.03+swing)@Quaternion((0,1,0),side*.30))
            world_rotation(rig.pose.bones['Forearm.'+s],Quaternion((1,0,0),.55 if crouched else .26))
        for pb in rig.pose.bones:pb.keyframe_insert('location',frame=frame);pb.keyframe_insert('rotation_euler',frame=frame)
rig.animation_data.action=bpy.data.actions['Idle'];bpy.context.scene.frame_set(0)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art-source/imported/workwear_character_rigged.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'godot-workshop/assets/character/workwear-character-rigged.glb'),export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_def_bones=True,export_force_sampling=True,export_bake_animation=True)
(ROOT/'art-source/imported/rig-manifest.json').write_text(json.dumps({'source_sha256':hashlib.sha256((ROOT/'art-source/imported/workwear_character.blend').read_bytes()).hexdigest(),'source_meshes':source_stats,'shoe_refinement':'Rounded toe, instep, padded ankle, arch, sole and laces; supplied shoe materials retained','deform_bones':20,'coordinate_change':'180 degrees around Z; meters preserved','animations':['Idle','Walk','CrouchIdle','CrouchWalk']},indent=2))
print('IMPORTED CHARACTER RIGGED:',len(meshes),'meshes',len(bones),'bones')
