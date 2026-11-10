"""Compare uploaded and skinned GLB rest geometry/materials without running Blender."""
from pathlib import Path
import json,struct,io
import numpy as np
from PIL import Image
from scipy.spatial import cKDTree
ROOT=Path(__file__).resolve().parent.parent

def read(path):
    raw=path.read_bytes();length=struct.unpack_from('<I',raw,12)[0]
    data=json.loads(raw[20:20+length]);offset=20+length
    size=struct.unpack_from('<I',raw,offset)[0]
    return data,raw[offset+8:offset+8+size]
def points(g,raw,node):
    chunks=[]
    for p in g['meshes'][node['mesh']]['primitives']:
        a=g['accessors'][p['attributes']['POSITION']];v=g['bufferViews'][a['bufferView']]
        off=v.get('byteOffset',0)+a.get('byteOffset',0)
        arr=np.ndarray((a['count'],3),dtype='<f4',buffer=raw,offset=off,strides=(v.get('byteStride',12),4)).astype(float)
        chunks.append(arr)
    arr=np.concatenate(chunks)
    if 'matrix' in node: mat=np.array(node['matrix']).reshape(4,4,order='F')
    else:
        x,y,z,w=node.get('rotation',[0,0,0,1])
        rot=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
        mat=np.eye(4);mat[:3,:3]=rot@np.diag(node.get('scale',[1,1,1]));mat[:3,3]=node.get('translation',[0,0,0])
    return (np.c_[arr,np.ones(len(arr))]@mat.T)[:,:3]
def key(name):
    if name.startswith(('Face /','Hair /','Head /')) or name=='Neck':return 'Head_'+name.replace(' / ','_')
    if ' / school patch' in name or ' / WorldSkills patch' in name:return 'Badge_'+name.replace(' / ','_')
    return name
original,ob=read(ROOT/'art-source/imported/workwear_character.glb')
rigged,rb=read(ROOT/'godot-workshop/assets/character/workwear-character-rigged.glb')
nodes={n['name']:n for n in rigged['nodes'] if 'mesh' in n}
checked=0
refined_shoes=0
for n in original['nodes']:
    if 'mesh' not in n:continue
    if 'shoe /' in n['name']:
        old=points(original,ob,n)*np.array([-1,1,-1])
        new=points(rigged,rb,nodes[key(n['name'])])
        error=max(cKDTree(old).query(new)[0].max(),cKDTree(new).query(old)[0].max())
        assert error > 0.0001, f'Shoe refinement missing: {n["name"]}'
        refined_shoes+=1
        continue
    old=points(original,ob,n)*np.array([-1,1,-1])
    new=points(rigged,rb,nodes[key(n['name'])])
    # Split normals/UV seams may duplicate vertices; compare both directions.
    error=max(cKDTree(old).query(new)[0].max(),cKDTree(new).query(old)[0].max())
    assert error < 0.00001, f'Rest geometry differs: {n["name"]}: {error} m'
    checked+=1
assert checked==101 and refined_shoes==24 and len(nodes)==125
oldm={m['name']:m for m in original['materials']}
newm={m['name']:m for m in rigged['materials']}
assert oldm.keys()==newm.keys()
for name,m in oldm.items():
    a=m['pbrMetallicRoughness'];b=newm[name]['pbrMetallicRoughness']
    for k,default in [('baseColorFactor',[1,1,1,1]),('roughnessFactor',1),('metallicFactor',1)]:
        assert np.allclose(a.get(k,default),b.get(k,default)),(name,k)
def images(g,b):
    result={}
    for image in g['images']:
        v=g['bufferViews'][image['bufferView']];offset=v.get('byteOffset',0)
        im=Image.open(io.BytesIO(b[offset:offset+v['byteLength']])).convert('RGBA')
        result[image['name']]=(im.size,im.tobytes())
    return result
assert images(original,ob)==images(rigged,rb),'Patch texture pixels changed'
print(f'PASS: {checked} body rest meshes unchanged, {refined_shoes} authorized shoe parts refined, {len(oldm)} materials and two patch textures preserved; coordinate rotation only')
