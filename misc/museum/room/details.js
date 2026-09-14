import * as THREE from './vendor/three.webgpu.min.js';

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

function curlPoints(x,y,sx,sy,size,z){
  const points=[];
  for(let i=0;i<=32;i++){
    const t=i/32,angle=t*Math.PI*3.1, r=size*(1-t*0.88);
    points.push([x+sx*Math.cos(angle)*r,y+sy*Math.sin(angle)*r,z+t*0.025]);
  }
  return points;
}

export function carvedFrame(w,h,k,gold){
  const c=new Carving(), crest=h/2+0.15*k;
  for(const sx of [-1,1]){
    for(const sy of [-1,1]){
      const x=sx*(w/2+0.065*k),y=sy*(h/2+0.06*k);
      c.add(closedTube(curlPoints(x,y,sx,sy,0.13*k,0.06*k),0.015*k),gold);
      for(let j=0;j<3;j++) c.add(leaf,gold,
        [x-sx*j*0.07*k,y-sy*j*0.035*k,0.075*k],[0,0,-sx*sy*(0.55+j*0.3)],
        [0.06*k,0.12*k,0.06*k]);
    }
    // Paired volutes and a fan-shaped crest above each canvas.
    c.add(closedTube(curlPoints(sx*0.19*k,crest,sx,1,0.18*k,0.07*k),0.018*k),gold);
    for(let j=0;j<4;j++) c.add(leaf,gold,[sx*(0.055+j*0.066)*k,crest+0.045*k,0.07*k],
      [0,0,-sx*(0.16+j*0.28)],[0.065*k,(0.17-j*0.017)*k,0.09*k]);
  }
  c.add(sphere,gold,[0,crest+0.04*k,0.11*k],[0,0,0],[0.068*k,0.095*k,0.042*k]);
  // Leaf-and-dart course. The broad, alternating relief catches light at room scale.
  for(const sy of [-1,1]){
    const count=Math.floor(w/(0.13*k));
    for(let i=0;i<count;i++) c.add(leaf,gold,
      [-w/2+(i+0.5)*w/count,sy*(h/2+0.09*k),0.06*k],
      [0,0,sy*0.55],[0.028*k,0.058*k,0.035*k]);
  }
  for(const sx of [-1,1]){
    const count=Math.floor(h/(0.13*k));
    for(let i=0;i<count;i++) c.add(leaf,gold,
      [sx*(w/2+0.09*k),-h/2+(i+0.5)*h/count,0.06*k],
      [0,0,sx*0.85],[0.032*k,0.065*k,0.035*k]);
  }
  return c.finish();
}

function archStone(radius,thickness,a,b,depth){
  const s=new THREE.Shape();
  s.absarc(0,0,radius+thickness,a,b,false);
  s.lineTo(Math.cos(b)*radius,Math.sin(b)*radius);
  s.absarc(0,0,radius,b,a,true); s.closePath();
  const geo=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSize:0.025,
    bevelThickness:0.025,bevelSegments:1,curveSegments:3,steps:1});
  geo.translate(0,0,-depth/2); return geo;
}

export function dressRoom({scene,stoneMat,frameMat:gold,woodMat:wood}){
  const c=new Carving();
  const bronze=new THREE.MeshStandardNodeMaterial({color:0x694832,metalness:0.7,roughness:0.48});
  const velvet=new THREE.MeshStandardNodeMaterial({color:0x643340,roughness:0.92});
  const green=new THREE.MeshStandardNodeMaterial({color:0x354537,roughness:0.66,metalness:0.15});
  const petal=new THREE.MeshStandardNodeMaterial({color:0xc39243,roughness:0.46,metalness:0.5});
  const seeds=new THREE.MeshStandardNodeMaterial({color:0x38231c,roughness:0.95});
  const paper=new THREE.MeshStandardNodeMaterial({color:0xb4a38c,roughness:0.96});

  // Layered arcades recede behind the surviving wall fragments. Every voussoir is
  // a closed, bevelled wedge; a missing block is a deliberate break in the arch.
  for(const [x,z,r,spring,missing] of [[-4.1,-7.85,2.3,3.5,3],[2.9,-8.0,2.3,3.5,-1],[-0.5,-8.5,1.15,4.2,12]]){
    for(let i=0;i<17;i++){
      if(i===missing||i===missing+1&&missing>=0) continue;
      c.add(archStone(r,0.36,i*Math.PI/17+0.012,(i+1)*Math.PI/17-0.012,0.65),stoneMat,[x,spring,z]);
      if(i%3===0) c.add(archStone(r-0.05,0.055,i*Math.PI/17+0.016,(i+1)*Math.PI/17-0.016,0.04),bronze,[x,spring,z+0.36]);
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
  for(const [x,z,r,h] of [[-3.60,-0.70,0.74,5.0],[3.95,-1.10,0.68,4.6],[0.30,-6.40,0.48,5.18]]){
    for(const y of [0.22,0.35,h,h+0.18]) c.add(new THREE.TorusGeometry(r*1.035,0.028,6,48),gold,[x,y,z],[Math.PI/2,0,0]);
    for(let i=0;i<16;i++){
      const a=i/16*Math.PI*2;
      c.add(leaf,bronze,[x+Math.sin(a)*r,h-0.19,z+Math.cos(a)*r],[0,a,0],[0.115,0.32,0.18]);
    }
  }

  // Fallen cornice stones and smaller chips; deterministic placement, concentrated
  // at the feet of the ruins so the central water still has room for reflections.
  let seed=917;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<65;i++){
    const side=i%2?1:-1, x=side*(2.9+rand()*4.3),z=-6.9+rand()*6.5;
    const size=0.08+rand()*0.30;
    c.add(new THREE.DodecahedronGeometry(size,0),stoneMat,[x,-0.035+size*0.4,z],
      [rand(),rand()*6,rand()],[1+rand(),0.65,1]);
  }
  for(const [x,z,ry] of [[-5.8,-2.6,0.4],[5.8,-3.2,-0.6]]){
    for(let j=0;j<3;j++) c.add(box,stoneMat,[x,0.1+j*0.13,z],
      [0.08,ry,0.05],[1.5+j*0.12,0.16,0.6+j*0.13]);
  }

  // An empty salon chair, slightly off-axis beneath the paintings: plum velvet,
  // tufted buttons, bowed gilt legs and a carved crown echo the illustrated room.
  const chair=new THREE.Group(),cc=new Carving();
  cc.add(sphere,wood,[0,1.52,0],[0,0,0],[0.73,1.05,0.19]);
  cc.add(sphere,velvet,[0,1.52,0.14],[0,0,0],[0.61,0.90,0.16]);
  const rim=[];
  for(let i=0;i<=64;i++){
    const a=i/64*Math.PI*2;rim.push([Math.cos(a)*0.67,1.52+Math.sin(a)*0.97,0.17]);
  }
  cc.add(closedTube(rim,0.045,72),gold);
  cc.add(sphere,wood,[0,0.69,0.38],[0,0,0],[0.80,0.18,0.70]);
  cc.add(sphere,velvet,[0,0.82,0.40],[0,0,0],[0.72,0.16,0.64]);
  for(const sx of [-1,1]){
    for(const z of [-0.05,0.90]) cc.add(closedTube([[sx*0.63,0.73,z],[sx*0.59,0.38,z+0.03],[sx*0.76,0.04,z+0.10]],0.055,16),gold);
    cc.add(closedTube([[sx*0.60,1.44,0.02],[sx*0.84,1.18,0.43],[sx*0.78,1.15,0.91],[sx*0.65,0.7,0.94]],0.045,24),gold);
    for(let j=0;j<3;j++) cc.add(leaf,gold,[sx*(0.08+j*0.13),2.49,0.13],[0,0,-sx*(0.2+j*0.35)],[0.11,0.25-j*0.03,0.13]);
  }
  for(let row=0;row<4;row++) for(let col=0;col<3;col++){
    const x=(col-1)*0.28+(row%2)*0.09,y=0.95+row*0.34;
    cc.add(sphere,gold,[x,y,0.30],[0,0,0],[0.024,0.024,0.012]);
  }
  chair.add(cc.finish());chair.position.set(0.65,0,-3.55);chair.rotation.y=-0.20;scene.add(chair);

  // A tall shaded lamp with ribs and crystal fringe. The practical casts warm
  // light onto the chair and flowers; the visitor's overhead beam remains aimable.
  const lx=-1.4,lz=-3.3,ly=3.0;
  c.add(new THREE.CylinderGeometry(0.032,0.046,2.7,12),gold,[lx,1.35,lz]);
  c.add(sphere,bronze,[lx,0.10,lz],[0,0,0],[0.42,0.12,0.42]);
  // A closed section revolved into a hollow shade with a real rim and inner face.
  const section=[[0.42,0.42],[0.72,-0.43],[0.68,-0.43],[0.385,0.42],[0.42,0.42]];
  const shadeGeo=new THREE.LatheGeometry(section.map(p=>new THREE.Vector2(...p)),48);
  const shadeMat=new THREE.MeshStandardNodeMaterial({color:0xbda078,emissive:0xffbe77,
    emissiveIntensity:0.22,roughness:0.74});
  c.add(shadeGeo,shadeMat,[lx,ly,lz]);
  for(const [y,r] of [[ly+0.42,0.42],[ly-0.43,0.72]]) c.add(new THREE.TorusGeometry(r,0.022,8,48),gold,[lx,y,lz],[Math.PI/2,0,0]);
  for(let i=0;i<16;i++){
    const a=i/16*Math.PI*2,s=Math.sin(a),co=Math.cos(a);
    c.add(closedTube([[lx+s*0.425,ly+0.42,lz+co*0.425],[lx+s*0.57,ly,lz+co*0.57],[lx+s*0.725,ly-0.43,lz+co*0.725]],0.012,12),gold);
    c.add(new THREE.OctahedronGeometry(0.065),gold,[lx+s*0.72,ly-0.60-(i%2)*0.06,lz+co*0.72],[0,a,0],[0.5,1.7,0.5]);
  }
  const warm=new THREE.PointLight(0xffbd80,36,11,2);warm.position.set(lx,ly-0.50,lz);scene.add(warm);

  // Sunflowers lean into the light on the right: two irregular petal courses,
  // raised seed heads and broad green leaves, with all faces modelled.
  for(const [x,z,height,r,lean] of [[3.10,-3.0,3.2,0.39,-0.22],[3.55,-2.95,2.35,0.32,0.22],[3.35,-3.3,4.10,0.31,0.20]]){
    c.add(closedTube([[x-lean,0.1,z],[x-0.15,height*0.5,z+0.1],[x,height,z]],0.022,22),green);
    for(let j=0;j<4;j++){
      const sx=j%2?1:-1;
      c.add(leaf,green,[x+sx*0.18,height*(0.18+j*0.15),z],
        [0.25,0,-sx*1.05],[0.16,0.40,0.10]);
    }
    c.add(sphere,seeds,[x,height,z+0.04],[0,0,0],[r*0.54,r*0.54,0.12]);
    for(let ring=0;ring<2;ring++) for(let j=0;j<17;j++){
      const a=(j+ring*0.5)/17*Math.PI*2;
      c.add(leaf,petal,[x+Math.sin(a)*r*0.66,height+Math.cos(a)*r*0.66,z+ring*0.045],
        [0.16*Math.sin(j),0,-a],[r*0.24,r*(0.68-ring*0.13),r*0.19]);
    }
    for(let j=0;j<65;j++){
      const a=j*2.39996,rr=Math.sqrt(j/65)*r*0.49;
      c.add(sphere,bronze,[x+Math.cos(a)*rr,height+Math.sin(a)*rr,z+0.14],
        [0,0,a],[0.014,0.019,0.009]);
    }
  }
  const vaseSection=[[0,0],[0.25,0],[0.30,0.15],[0.23,0.48],[0.16,0.66],[0.19,0.70],[0.15,0.70],[0.12,0.61],[0.19,0.45],[0.25,0.15],[0,0.06]];
  c.add(new THREE.LatheGeometry(vaseSection.map(p=>new THREE.Vector2(...p)),32),bronze,[3.35,-0.03,-3.1]);

  // Books and a cup survive on a low round table near the water.
  const tx=4.3,tz=-2.1;
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
  c.add(new THREE.CylinderGeometry(0.12,0.065,0.16,24),paper,[tx+0.32,1.09,tz+0.13]);
  c.add(new THREE.TorusGeometry(0.064,0.014,8,20),gold,[tx+0.45,1.1,tz+0.13]);
  c.add(new THREE.CylinderGeometry(0.17,0.15,0.018,24),paper,[tx+0.32,1.02,tz+0.13]);

  const group=c.finish();group.name='Carved architecture and still life';scene.add(group);
  return {glows:[]};
}
