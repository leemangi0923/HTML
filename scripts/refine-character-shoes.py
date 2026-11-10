"""Anatomical sneaker profiles for the uploaded character; retain original materials."""
import bpy, math
from mathutils import Vector
PROFILE=[(-.124,.006,.115),(-.108,.047,.151),(-.072,.065,.176),(-.025,.071,.169),(.025,.080,.149),(.075,.087,.124),(.125,.085,.105),(.174,.066,.090),(.203,.037,.078),(.214,.003,.066)]
# Interpolate the outline so the toe and heel have continuous rounded sides.
control=PROFILE
PROFILE=[]
for i in range(len(control)-1):
    a=control[max(0,i-1)];b=control[i];c=control[i+1];d=control[min(len(control)-1,i+2)]
    for j in range(6):
        t=j/6
        row=tuple(.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t*t+(-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t) for k in range(3))
        PROFILE.append(row)
PROFILE.append(control[-1])
def dims(y):
    for a,b in zip(PROFILE,PROFILE[1:]):
        if a[0]<=y<=b[0]:
            t=(y-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t
    return PROFILE[0][1:] if y<PROFILE[0][0] else PROFILE[-1][1:]
def replace(obj,verts,faces):
    materials=list(obj.data.materials)
    mesh=bpy.data.meshes.new(obj.name+' refined');mesh.from_pydata(verts,[],faces);mesh.update()
    obj.data=mesh
    for m in materials:mesh.materials.append(m)
    for p in mesh.polygons:p.use_smooth=True

def surface(obj,cx,side,part):
    verts=[];faces=[];n=32
    for y,rx,top in PROFILE:
        for j in range(n):
            t=j*math.tau/n
            if part=='upper':
                z=(top+.049)*.5+(top-.049)*.5*math.sin(t)
                width=rx
            elif part=='sole':
                arch=.008*math.exp(-((y-.015)/.05)**2)
                toe_lift=.010*max(0,(y-.14)/.074)
                bottom=.0155+arch+toe_lift
                z=(.054+bottom)*.5+(.054-bottom)*.5*math.sin(t)
                width=rx+.004
            else:
                z=.055+.004*math.sin(t);width=rx+.001
            verts.append((cx+width*math.cos(t)+side*.004*max(0,y)/.214,y,z))
    for i in range(len(PROFILE)-1):
        for j in range(n):faces.append((i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j))
    faces.extend([tuple(reversed(range(n))),tuple((len(PROFILE)-1)*n+j for j in range(n))])
    # Along +Y, radial ring direction faces inward; reverse for outward normals.
    replace(obj,verts,[tuple(reversed(f)) for f in faces])

def tubing(obj,paths,radius):
    verts=[];faces=[];n=8
    for path in paths:
        start=len(verts)
        for i,p in enumerate(path):
            p=Vector(p);t=(Vector(path[min(i+1,len(path)-1)])-Vector(path[max(0,i-1)])).normalized()
            axis=t.cross(Vector((0,0,1))).normalized()
            if axis.length<.1:axis=Vector((1,0,0))
            other=t.cross(axis)
            for j in range(n):verts.append(tuple(p+radius*(axis*math.cos(j*math.tau/n)+other*math.sin(j*math.tau/n))))
        for i in range(len(path)-1):
            for j in range(n):
                a=start+i*n+j;faces.append((a,start+i*n+(j+1)%n,start+(i+1)*n+(j+1)%n,a+n))
    replace(obj,verts,faces)

def refine_shoe(obj):
    if 'shoe /' not in obj.name:return
    side=-1 if obj.name.startswith('Left') else 1;cx=side*.137
    part=obj.name.split(' / ')[1]
    if part in ['canvas upper','off-white outsole','navy welt']:
        surface(obj,cx,side,{'canvas upper':'upper','off-white outsole':'sole','navy welt':'welt'}[part])
    elif part=='ankle':
        path=[]
        for i in range(65):
            t=i*math.tau/64
            path.append((cx+.061*math.cos(t),-.053+.060*math.sin(t),.165+.008*max(0,-math.sin(t))))
        tubing(obj,[path],.008)
    elif part=='tongue':
        verts=[];faces=[];n=10;m=14
        for i in range(m+1):
            y=-.058+i*.166/m;rx,top=dims(y)
            for j in range(n+1):
                x=(j/n-.5)*.075;z=(top+.049)*.5+(top-.049)*.5*math.sqrt(max(.01,1-(x/rx)**2))+.002
                verts.append((cx+x,y,z))
        for i in range(m):
            for j in range(n):
                a=i*(n+1)+j;faces.append((a,a+1,a+n+2,a+n+1))
        replace(obj,verts,faces)
    elif part.startswith('lace '):
        index=int(part.split()[-1])-1;y=.025+index*.024
        paths=[]
        for crossing in [-1,1]:
            path=[]
            for i in range(17):
                t=i/16;x=crossing*(-.034+t*.068);py=y+t*.020
                rx,top=dims(py)
                z=(top+.049)*.5+(top-.049)*.5*math.sqrt(max(.01,1-(x/rx)**2))+.0055
                path.append((cx+x,py,z))
            paths.append(path)
        tubing(obj,paths,.0019)
    elif part=='toe seam':
        path=[]
        for i in range(33):
            x=-.066+i*.132/32;y=.125+.018*(1-(x/.066)**2);rx,top=dims(y)
            z=(top+.049)*.5+(top-.049)*.5*math.sqrt(max(.01,1-(x/rx)**2))+.001
            path.append((cx+x,y,z))
        tubing(obj,[path],.0007)
    elif part=='sole stitching':
        path=[]
        for i in range(97):
            t=i*math.tau/96;y=.045+.163*math.sin(t);rx,_=dims(y)
            path.append((cx+(rx+.004)*math.cos(t),y,.038+.006*max(0,(y-.14)/.074)))
        tubing(obj,[path],.00065)
