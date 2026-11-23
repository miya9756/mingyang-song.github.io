import * as THREE from './vendor/three.webgpu.min.js';
import {bronzeHardware, linenShade, velvet as makeVelvet} from './materials.js';

// All ornament is solid geometry. Repeated parts are merged by material, keeping the
// reflection and shadow passes affordable without turning the relief into a texture.
const sphere=new THREE.SphereGeometry(1,12,8);
const box=new THREE.BoxGeometry(1,1,1);
const leaf=new THREE.SphereGeometry(1,12,10);
{
  const p=leaf.attributes.position;
  for(let i=0;i<p.count;i++){
    const t=(p.getY(i)+1)/2;
    const fold=1+0.16*Math.sin(t*24);
    p.setXYZ(i,p.getX(i)*(0.25+0.75*(1-t))*fold,p.getY(i),p.getZ(i)*0.28+0.40*t*t);
  }
  leaf.computeVertexNormals();
}

class Carving {
  constructor(){this.parts=new Map();}
  add(geometry,material,position=[0,0,0],rotation=[0,0,0],scale=[1,1,1]){
    const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(...scale));
    const g=geometry.index?geometry.toNonIndexed():geometry.clone();
    g.applyMatrix4(matrix);
    if(!this.parts.has(material)) this.parts.set(material,{p:[],n:[]});
    const out=this.parts.get(material);
    for(const v of g.attributes.position.array) out.p.push(v);
    for(const v of g.attributes.normal.array) out.n.push(v);
    g.dispose();
  }
  finish(){
    const group=new THREE.Group();
    for(const [mat,{p,n}] of this.parts){
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
      g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));
      g.computeBoundingSphere();
      const mesh=new THREE.Mesh(g,mat);
      mesh.castShadow=true; mesh.receiveShadow=true; group.add(mesh);
    }
    return group;
  }
}

// TubeGeometry leaves its ends open. Cap the exact end rings, with outward winding,
// before using it for scrolls, stems, furniture legs or decorative ribs.
export function closedTube(points,radius=0.025,segments=24){
  const vertices=points.map(p=>new THREE.Vector3(...p));
  const closed=vertices[0].distanceTo(vertices[vertices.length-1])<1e-6;
  if(closed) vertices.pop();
  const curve=new THREE.CatmullRomCurve3(vertices,closed);
  const sides=8, g=new THREE.TubeGeometry(curve,segments,radius,sides,closed);
  if(closed) return g;
  const pos=Array.from(g.attributes.position.array), idx=Array.from(g.index.array);
  for(const end of [0,1]){
    const center=curve.getPoint(end), wanted=curve.getTangent(end).multiplyScalar(end?1:-1);
    const ci=pos.length/3; pos.push(center.x,center.y,center.z);
    const start=end*segments*(sides+1);
    for(let j=0;j<sides;j++){
      const a=start+j,b=a+1;
      const va=new THREE.Vector3().fromArray(pos,a*3).sub(center);
      const vb=new THREE.Vector3().fromArray(pos,b*3).sub(center);
      if(va.cross(vb).dot(wanted)>0) idx.push(ci,a,b); else idx.push(ci,b,a);
    }
  }
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.deleteAttribute('uv'); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// A shallow carving has a modelled face, a back and a narrow cut edge. The
// edge has its own normals so the gilded lip stays crisp in a raking light.
function reliefGrid(columns,rows,sample){
  const pos=[],idx=[],stride=columns+1,count=stride*(rows+1);
  const back=[];
  for(let y=0;y<=rows;y++) for(let x=0;x<=columns;x++){
    const [px,py,face,base]=sample(x/columns,y/rows);
    pos.push(px,py,face); back.push(px,py,base);
  }
  pos.push(...back);
  for(let y=0;y<rows;y++) for(let x=0;x<columns;x++){
    const a=y*stride+x,b=a+1,d=a+stride,c=d+1;
    idx.push(a,b,c,a,c,d, count+a,count+c,count+b,count+a,count+d,count+c);
  }
  const rim=[];
  for(let x=0;x<columns;x++) rim.push(x);
  for(let y=0;y<rows;y++) rim.push(y*stride+columns);
  for(let x=columns;x>0;x--) rim.push(rows*stride+x);
  for(let y=rows;y>0;y--) rim.push(y*stride);
  const start=pos.length/3;
  for(const i of rim) for(const j of [i,i+count]) pos.push(pos[j*3],pos[j*3+1],pos[j*3+2]);
  for(let i=0;i<rim.length;i++){
    const a=start+2*i,b=start+2*((i+1)%rim.length);
    idx.push(a,a+1,b+1,a,b+1,b);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// Nine radiating ribs swell from the hinge of a scallop. The same ribs
// scallop its silhouette, so the shell still reads from across the water.
export function shellCrest(){
  return reliefGrid(72,9,(u,v)=>{
    const angle=(u-0.5)*2.16;
    const rib=0.5-0.5*Math.cos(2*Math.PI*9*u);
    const r=0.048+v*(0.29+0.037*rib);
    const x=Math.sin(angle)*r*1.16, y=Math.cos(angle)*r;
    const back=0.014+0.039*v*v;
    const face=back+0.016+0.061*Math.sin(Math.PI*v)+0.040*rib*v;
    return [x,y,face,back];
  });
}

// A leaf in the carver's local XY plane. The outline breaks into lobes,
// while a raised midrib and oblique furrows give the blade a folded face.
export function acanthusLeaf(){
  return reliefGrid(10,16,(u,t)=>{
    const s=u*2-1, blade=Math.sin(Math.PI*t);
    const lobes=0.87+0.13*Math.cos(6*Math.PI*t);
    const width=0.025+0.36*blade*lobes*(1-0.26*t);
    const x=0.21*t*t+s*width;
    const back=0.11*t*t;
    const ribs=Math.cos(8*Math.PI*t-3.8*Math.abs(s));
    const face=back+0.018+blade*(0.035+0.088*Math.exp(-10*s*s)+0.014*ribs*(1-s*s));
    return [x,t,face,back];
  });
}

// An eight-petal patera cut from a single boss. The rounded blank is flattened
// at the rim and lobed before raising the petals and the central seed.
export function cornerRosette(){
  const g=new THREE.SphereGeometry(1,48,12);
  g.rotateX(Math.PI/2);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),r=Math.hypot(x,y);
    const petal=0.5+0.5*Math.cos(8*Math.atan2(y,x));
    const outline=1-0.19*Math.pow(r,3)*(1-petal);
    const relief=z>0?0.27*petal*Math.sin(Math.PI*r)**2+0.32*Math.exp(-22*r*r):0;
    p.setXYZ(i,x*outline,y*outline,0.26*z+relief);
  }
  g.computeVertexNormals();
  return g;
}

const foliage=acanthusLeaf(),rosette=cornerRosette(),shell=shellCrest();

export function carvedFrame(w,h,k,gold,crest){
  const c=new Carving(),crestY=h/2+0.073*k;
  // A floral boss is carved in two depths: the petals have deep grooves,
  // and the round seed stands proud of their meeting point.
  function flower(x,y,z,rx,ry){
    c.add(rosette,gold,[x,y,z],[0,0,Math.PI/8],[rx,ry,Math.min(rx,ry)]);
    c.add(sphere,gold,[x,y,z+0.56*Math.min(rx,ry)],[0,0,0],[0.19*rx,0.19*ry,0.16*Math.min(rx,ry)]);
  }
  if(crest==='shell'){
    c.add(shell,gold,[0,crestY,0.045*k],[0,0,0],[k,k,k]);
    flower(0,crestY+0.035*k,0.087*k,0.058*k,0.045*k);
    // Reflect the stalk's path to keep the triangle winding intact.
    for(const side of [-1,1]){
      const path=[[0.035,0.037],[0.18,0.010],[0.34,0.026],[0.43,0.118],
        [0.397,0.196],[0.321,0.202],[0.286,0.155],[0.302,0.119],[0.334,0.124]];
      c.add(closedTube(path.map(([x,y])=>[side*x*k,crestY+y*k,(0.076+y*0.16)*k]),0.015*k,36),gold);
      c.add(foliage,gold,[side*0.19*k,crestY+0.012*k,0.069*k],[0,0,-side*0.94],[0.16*k,0.23*k,0.22*k]);
    }
  }else{
    // A low, spreading crest on the broad landscapes leaves the sky open.
    for(const side of [-1,1]){
      const stem=[[0.02,0.01],[0.16,0.03],[0.31,0.06],[0.46,0.11],[0.50,0.16]];
      c.add(closedTube(stem.map(([x,y])=>[side*x*k,crestY+y*k,0.073*k]),0.010*k,20),gold);
      for(let j=0;j<4;j++){
        const x=(0.065+0.11*j)*k,y=(0.016+0.010*j*j)*k;
        const length=(0.16-0.014*j)*k;
        c.add(foliage,gold,[side*x,crestY+y,0.070*k],[0,0,-side*0.69],[0.090*k,length,0.14*k]);
        c.add(foliage,gold,[side*x,crestY+y,0.074*k],[0,0,-side*1.85],[0.086*k,length,0.11*k]);
      }
    }
    flower(0,crestY+0.054*k,0.076*k,0.094*k,0.087*k);
  }

  for(const sx of [-1,1]) for(const sy of [-1,1]){
    const x=sx*(w/2+0.076*k), y=sy*(h/2+0.076*k);
    // Two sprays follow the mitre out along its rails. Keep the sight edge
    // clear of the leaves, even on the narrow portrait canvas.
    for(const alongTop of [true,false]){
      const heading=alongTop?sx*Math.PI/2:(sy>0?Math.PI:0);
      for(let i=0;i<3;i++){
        const offset=(0.018+i*0.069)*k;
        const lean=(i%2===0?1:-1)*0.24;
        c.add(foliage,gold,[x-(alongTop?sx*offset:0),y-(alongTop?0:sy*offset),0.067*k],
          [0,0,heading+lean],[0.126*k,(0.17-i*0.017)*k,0.19*k]);
      }
    }
    flower(x,y,0.078*k,0.086*k,0.086*k);
  }
  return c.finish();
}

// Sweep one moulded cross-section around the arch. Each wedge has a deep
// reveal, a bead around its inner lip and two stepped bands on its front face.
export function archStone(radius,thickness,a,b,depth){
  const t=thickness, z=depth/2;
  const profile=[[0,-z+0.02],[0.02,-z],[t-0.02,-z],[t,-z+0.02],
    [t,z+0.015],[t-0.02,z+0.042],[0.84*t,z+0.042],[0.80*t,z+0.012],
    [0.70*t,z+0.012],[0.64*t,z-0.018],[0.31*t,z-0.018],[0.25*t,z+0.025],
    [0.19*t,z+0.055],[0.11*t,z+0.060],[0.05*t,z+0.044],[0,z+0.015]];
  const point=(angle,k)=>{const [r,front]=profile[k];return [(radius+r)*Math.cos(angle),(radius+r)*Math.sin(angle),front];};
  const pos=[], steps=4;
  for(let i=0;i<steps;i++){
    const u=a+(b-a)*i/steps,v=a+(b-a)*(i+1)/steps;
    for(let k=0;k<profile.length;k++){
      const n=(k+1)%profile.length;
      pos.push(...point(u,k),...point(v,k),...point(v,n),...point(u,k),...point(v,n),...point(u,n));
    }
  }
  const ends=THREE.ShapeUtils.triangulateShape(profile.map(p=>new THREE.Vector2(...p)),[]);
  for(const [i,j,k] of ends) pos.push(...point(a,i),...point(a,j),...point(a,k),...point(b,k),...point(b,j),...point(b,i));
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.computeVertexNormals();
  return g;
}

// The button caps sit at the bottoms of the same depressions that shape the
// velvet. Work in chair-local metres so a pull has the same width on each row.
const tufts=[];
for(let row=0;row<4;row++) for(let col=0;col<3;col++){
  tufts.push([(col-1)*0.28+(row%2?0.07:-0.07),-0.54+row*0.34]);
}
function tuftDepth(x,y){
  let depth=0;
  for(const [bx,by] of tufts){
    const dx=x-bx,dy=y-by;
    const d2=dx*dx+dy*dy;
    if(d2>0.052) continue;
    const crease=Math.abs(Math.abs(dx)-Math.abs(dy)*0.80);
    depth+=0.052*Math.exp(-d2/0.0033)+0.022*Math.exp(-d2/0.019-crease*crease/0.00023);
  }
  return depth;
}
export function tuftedBack(){
  const g=new THREE.SphereGeometry(1,96,64), p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i)*0.61, y=p.getY(i)*0.90, z=p.getZ(i);
    const pull=z>0?tuftDepth(x,y)*Math.min(1,z*3):0;
    p.setXYZ(i,x,y,0.16*z-pull);
  }
  g.computeVertexNormals();
  return g;
}

export function pleatedShade(){
  // Revolve the inner and outer cloth together. Pleats taper to the wire hoops.
  const section=[[0.42,0.42],[0.39,0.42],[0.39,0.39],[0.52,0],[0.68,-0.40],[0.68,-0.43],
    [0.72,-0.43],[0.72,-0.40],[0.56,0],[0.42,0.39],[0.42,0.42]];
  const g=new THREE.LatheGeometry(section.map(p=>new THREE.Vector2(...p)),160);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const angle=Math.atan2(x,z), span=Math.max(0,1-Math.pow(Math.abs((y+0.005)/0.425),5));
    const scale=1-0.065*span*(1-Math.cos(angle*32))*0.5;
    p.setXYZ(i,x*scale,y,z*scale);
  }
  g.computeVertexNormals();
  return g;
}

export function dressRoom({scene,stoneMat,frameMat:gold,woodMat:wood,floorY}){
  const c=new Carving();
  const bronze=bronzeHardware();
  const velvet=makeVelvet();
  const green=new THREE.MeshStandardNodeMaterial({color:0x354537,roughness:0.77});
  const petal=new THREE.MeshStandardNodeMaterial({color:0xd8a348,roughness:0.84});
  const seeds=new THREE.MeshStandardNodeMaterial({color:0x38231c,roughness:0.95});
  const glaze=new THREE.MeshPhysicalNodeMaterial({color:0xc8b9a1,roughness:0.69,clearcoat:0.82,clearcoatRoughness:0.24});
  const paper=new THREE.MeshStandardNodeMaterial({color:0xb4a38c,roughness:0.96});

  // Layered arcades recede behind the surviving wall fragments. Every voussoir is
  // a closed, bevelled wedge; a missing block is a deliberate break in the arch.
  for(const [x,z,r,spring,missing] of [[-4.1,-8.00,2.3,3.5,3],[2.9,-8.0,2.3,3.5,-1],[-0.5,-8.99,1.15,4.2,12]]){
    for(let i=0;i<17;i++){
      if(i===missing||i===missing+1&&missing>=0) continue;
      const key=i===8, inset=0.004;
      c.add(archStone(key?r-0.065:r,key?0.54:0.36,i*Math.PI/17+inset,(i+1)*Math.PI/17-inset,key?0.77:0.65),stoneMat,[x,spring,z]);
    }
    for(const sx of [-1,1]){
      for(let row=0;row<6;row++) c.add(box,stoneMat,[x+sx*(r+0.18),row*0.55+0.20,z],
        [0,0,0],[0.55,0.53,0.74]);
      c.add(box,stoneMat,[x+sx*(r+0.18),spring-0.12,z],[0,0,0],[0.85,0.23,0.92]);
    }
  }
  // Small masonry courses on the visible rear fragments, separated by mortar joints.
  for(const [cx,width,rows] of [[-4.15,6.15,4],[2.95,5,3]]){
    for(let row=0;row<rows;row++){
      const count=7;
      for(let i=0;i<count;i++){
        const w=width/count;
        c.add(box,stoneMat,[cx-width/2+(i+0.5)*w,0.12+row*0.34,-6.908],
          [0,0,0],[w-0.025,0.315,0.035]);
      }
    }
  }
  // Bronze collars and an acanthus crown give the foreground shafts scale.
  for(const [x,z,r,h] of [[-3.60,-0.70,0.74,5.0],[3.95,-1.10,0.68,4.6],[0.30,-5.96,0.48,5.18]]){
    for(const y of [0.22,0.35,h,h+0.18]) c.add(new THREE.TorusGeometry(r*1.035,0.028,6,48),gold,[x,y,z],[Math.PI/2,0,0]);
    for(let i=0;i<16;i++){
      const a=i/16*Math.PI*2;
      c.add(leaf,bronze,[x+Math.sin(a)*r,h-0.19,z+Math.cos(a)*r],[0,a,0],[0.115,0.32,0.18]);
    }
  }

  // Fallen cornice stones and smaller chips; deterministic placement, concentrated
  // at the feet of the ruins so the central water still has room for reflections.
  // The loose chips have fixed sites between the columns and exhibits. Seat
  // each stone on its lowest rotated vertex on the floor beneath the water.
  const chipSites=[
    [-4.59,-4.17],[5.93,-0.10],[-5.27,0.44],[5.76,-6.51],[-3.28,-5.54],[6.26,-5.97],
    [-6.83,-6.09],[3.55,-4.48],[-5.18,-6.25],[6.32,-6.63],[-3.81,-5.85],[5.03,-6.41],
    [-5.32,-1.60],[4.87,-3.41],[-3.73,-3.05],[6.88,-0.40],[-3.98,-4.58],[7.71,-1.15],
    [-7.18,-2.58],[5.21,-0.68],[-7.32,-1.81],[3.62,-2.31],[-4.89,-2.51],[5.35,-5.55],
    [-4.47,-6.09],[3.08,-2.75],[-3.74,0.49],[2.97,-1.63],[-3.60,-1.86],[5.83,-5.76],
    [-4.69,-1.29],[7.51,-3.72],[-6.39,-3.40],[4.30,-5.99],[-4.49,0.19],[4.90,-5.45],
    [-3.03,-6.34],[7.03,-2.98],[-6.16,-1.06],[5.16,0.07],[-4.34,-2.08],[5.00,-2.34],
    [-4.88,-5.50],[3.68,-2.99],[-6.94,-1.16],[4.13,-4.66],[-6.21,-6.27],[5.45,-2.74],
    [-6.15,-3.75],[5.15,-4.26],[-5.84,-3.48],[6.55,0.05],[-4.19,-5.22],[6.48,-0.71],
    [-3.78,-6.51],[2.92,-2.29],[-3.37,-3.41],[4.41,-3.93],[-4.38,-2.86],[7.10,-0.67],
    [-6.11,-0.16],[3.60,-3.66],[-3.74,-2.60],[3.25,-5.51],[-7.06,-3.37]
  ];
  let seed=917;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(const [x,z] of chipSites){
    const stone=new THREE.DodecahedronGeometry(0.08+rand()*0.30,0);
    const rotation=new THREE.Euler(rand(),rand()*6,rand());
    stone.scale(1+rand(),0.65,1);
    stone.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation));
    stone.computeBoundingBox();
    c.add(stone,stoneMat,[x,floorY-stone.boundingBox.min.y,z]);
  }
  for(const [x,z,ry] of [[-6.03,-2.17,0.29],[6.73,-1.90,-0.48]]){
    const tilt=new THREE.Euler(0.08,ry,0.05);
    const up=new THREE.Vector3(0,1,0).applyEuler(tilt);
    for(let j=0;j<3;j++){
      const lift=j*0.16;
      c.add(box,stoneMat,[x+up.x*lift,-0.19+up.y*lift,z+up.z*lift],
        [tilt.x,tilt.y,tilt.z],[1.5+j*0.12,0.16,0.6+j*0.13]);
    }
  }

  // An empty salon chair, slightly off-axis beneath the paintings: plum velvet,
  // tufted buttons, bowed gilt legs and a carved crown echo the illustrated room.
  const chair=new THREE.Group(),cc=new Carving();
  const cushion=new THREE.SphereGeometry(1,48,24);
  cc.add(cushion,wood,[0,1.52,0],[0,0,0],[0.73,1.05,0.19]);
  cc.add(tuftedBack(),velvet,[0,1.52,0.14]);
  const rim=[];
  for(let i=0;i<=64;i++){
    const a=i/64*Math.PI*2;rim.push([Math.cos(a)*0.67,1.52+Math.sin(a)*0.97,0.17]);
  }
  cc.add(closedTube(rim,0.045,72),gold);
  cc.add(cushion,wood,[0,0.69,0.38],[0,0,0],[0.80,0.18,0.70]);
  cc.add(cushion,velvet,[0,0.82,0.40],[0,0,0],[0.72,0.16,0.64]);
  for(const sx of [-1,1]){
    for(const z of [-0.05,0.90]) cc.add(closedTube([[sx*0.63,0.73,z],[sx*0.59,0.38,z+0.03],[sx*0.76,0.04,z+0.10]],0.055,16),gold);
    cc.add(closedTube([[sx*0.60,1.44,0.02],[sx*0.84,1.18,0.43],[sx*0.78,1.15,0.91],[sx*0.65,0.7,0.94]],0.045,24),gold);
    for(let j=0;j<3;j++) cc.add(leaf,gold,[sx*(0.08+j*0.13),2.49,0.13],[0,0,-sx*(0.2+j*0.35)],[0.11,0.25-j*0.03,0.13]);
  }
  for(const [x,y] of tufts){
    const z=0.14+0.16*Math.sqrt(1-(x/0.61)**2-(y/0.90)**2)-tuftDepth(x,y);
    cc.add(sphere,gold,[x,1.52+y,z+0.014],[0,0,0],[0.021,0.021,0.012]);
  }
  chair.add(cc.finish());chair.position.set(0.74,0,-3.65);chair.rotation.y=-0.29;scene.add(chair);

  // A tall shaded lamp with ribs and crystal fringe. The practical casts warm
  // light onto the chair and flowers; the visitor's overhead beam remains aimable.
  const lx=-1.4,lz=-3.3,ly=3.0;
  c.add(new THREE.CylinderGeometry(0.032,0.046,2.7,12),bronze,[lx,1.35,lz]);
  c.add(sphere,bronze,[lx,0.10,lz],[0,0,0],[0.42,0.12,0.42]);
  // A closed section revolved into a hollow shade with a real rim and inner face.
  const shade=new THREE.Mesh(pleatedShade(),linenShade());
  shade.position.set(lx,ly,lz);shade.castShadow=true;shade.receiveShadow=true;
  scene.add(shade);
  for(const [y,r] of [[ly+0.42,0.42],[ly-0.43,0.72]]) c.add(new THREE.TorusGeometry(r,0.022,8,48),bronze,[lx,y,lz],[Math.PI/2,0,0]);
  for(let i=0;i<16;i++){
    const a=i/16*Math.PI*2,s=Math.sin(a),co=Math.cos(a);
    c.add(closedTube([[lx+s*0.425,ly+0.42,lz+co*0.425],[lx+s*0.57,ly,lz+co*0.57],[lx+s*0.725,ly-0.43,lz+co*0.725]],0.012,12),gold);
    c.add(new THREE.OctahedronGeometry(0.065),bronze,[lx+s*0.72,ly-0.60-(i%2)*0.06,lz+co*0.72],[0,a,0],[0.5,1.7,0.5]);
  }
  const warm=new THREE.PointLight(0xffbd80,36,11,2);warm.position.set(lx,ly-0.50,lz);scene.add(warm);

  // Sunflowers lean into the light on the right: two irregular petal courses,
  // raised seed heads and broad green leaves, with all faces modelled.
  const vaseX=3.02,vaseZ=-3.24;
  for(const [dx,dz,height,r] of [[-0.32,0.05,3.15,0.39],[0.42,0.10,2.39,0.32],[0.10,-0.15,3.96,0.31]]){
    const x=vaseX+dx,z=vaseZ+dz;
    // Keep each stalk inside the narrow mouth, then let it bend towards its flower.
    const stemPoints=[[vaseX+dx*0.10,0.55,vaseZ+dz*0.10],[vaseX+dx*0.16,0.75,vaseZ+dz*0.16],
      [vaseX+dx*0.55,height*0.60,vaseZ+dz*0.55],[x,height,z]];
    const stem=new THREE.CatmullRomCurve3(stemPoints.map(p=>new THREE.Vector3(...p)));
    c.add(closedTube(stemPoints,0.022,22),green);
    for(let j=0;j<4;j++){
      const sx=j%2?1:-1, join=stem.getPointAt(0.22+j*0.16);
      const tilt=-sx*1.05;
      // The leaf mesh is centred. Plant its lower tip on the curved stalk.
      c.add(leaf,green,[join.x-0.34*Math.sin(tilt),join.y+0.34*Math.cos(tilt),join.z],
        [0,0,tilt],[0.16,0.40,0.10]);
    }
    c.add(sphere,seeds,[x,height,z+0.04],[0,0,0],[r*0.54,r*0.54,0.12]);
    for(let ring=0;ring<2;ring++) for(let j=0;j<17;j++){
      const a=(j+ring*0.5)/17*Math.PI*2;
      c.add(leaf,petal,[x+Math.sin(a)*r*0.66,height+Math.cos(a)*r*0.66,z+ring*0.045],
        [0.16*Math.sin(j),0,-a],[r*0.24,r*(0.68-ring*0.13),r*0.19]);
    }
    for(let j=0;j<65;j++){
      const a=j*2.39996,rr=Math.sqrt(j/65)*r*0.49;
      c.add(sphere,seeds,[x+Math.cos(a)*rr,height+Math.sin(a)*rr,z+0.14],
        [0,0,a],[0.014,0.019,0.009]);
    }
  }
  const vaseSection=[[0,0],[0.25,0],[0.30,0.15],[0.23,0.48],[0.16,0.66],[0.19,0.70],[0.15,0.70],[0.12,0.61],[0.19,0.45],[0.25,0.15],[0,0.06]];
  c.add(new THREE.LatheGeometry(vaseSection.map(p=>new THREE.Vector2(...p)),32),bronze,[vaseX,-0.03,vaseZ]);

  // Books and a cup survive on a low round table near the water.
  const tx=4.46,tz=-2.76;
  c.add(new THREE.CylinderGeometry(0.72,0.74,0.09,40),wood,[tx,0.96,tz]);
  c.add(new THREE.TorusGeometry(0.73,0.023,8,40),gold,[tx,1.005,tz],[Math.PI/2,0,0]);
  c.add(new THREE.CylinderGeometry(0.055,0.09,0.95,12),bronze,[tx,0.46,tz]);
  for(let i=0;i<3;i++){
    const a=i/3*Math.PI*2;
    c.add(closedTube([[tx,0.36,tz],[tx+Math.cos(a)*0.23,0.12,tz+Math.sin(a)*0.23],[tx+Math.cos(a)*0.54,0.03,tz+Math.sin(a)*0.54]],0.04,16),bronze);
  }
  for(let i=0;i<3;i++){
    const y=1.06+i*0.13,angle=0.18-i*0.17;
    c.add(box,paper,[tx-0.16,y,tz],[0,angle,0],[0.48,0.09,0.34]);
    for(const sy of [-1,1]) c.add(box,i%2?velvet:green,[tx-0.16,y+sy*0.052,tz],[0,angle,0],[0.51,0.018,0.36]);
    c.add(box,gold,[tx-0.16,y,tz+0.177],[0,angle,0],[0.035,0.09,0.018]);
  }
  c.add(new THREE.CylinderGeometry(0.12,0.065,0.16,24),glaze,[tx+0.32,1.09,tz+0.13]);
  c.add(new THREE.TorusGeometry(0.064,0.014,8,20),gold,[tx+0.45,1.1,tz+0.13]);
  c.add(new THREE.CylinderGeometry(0.17,0.15,0.018,24),glaze,[tx+0.32,1.02,tz+0.13]);

  const group=c.finish();group.name='Carved architecture and still life';scene.add(group);
  return {glows:[]};
}
