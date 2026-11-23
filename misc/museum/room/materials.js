// Surface finishes for the Painted Room. Values that feed a BRDF are linear;
// the painting textures are tagged sRGB by the loader.
import * as THREE from './vendor/three.webgpu.min.js';

const {Fn,abs,clamp,float,max,mix,mx_noise_float,normalView,positionLocal,positionView,positionWorld,
       sin,smoothstep,texture,uv,vec2,vec3}=THREE.TSL;

// Recover a view-space normal from a height in metres. This differentiates the
// height field itself, including on carvings and fractured stone with no UVs.
const reliefNormal=Fn(([height])=>{
  const n=normalView.normalize(),dx=positionView.dFdx(),dy=positionView.dFdy();
  const r1=dy.cross(n),r2=n.cross(dx),det=dx.dot(r1);
  const gradient=r1.mul(height.dFdx()).add(r2.mul(height.dFdy()))
    .mul(det.sign().div(max(abs(det),1e-9)));
  return n.sub(gradient).normalize();
});

export function marble(){
  const mat=new THREE.MeshPhysicalNodeMaterial({ior:1.52});
  const p=positionWorld,cloud=mx_noise_float(p.mul(0.94)),grain=mx_noise_float(p.mul(11));
  const bed=p.y.mul(2.8).add(p.x.mul(1.65)).sub(p.z.mul(0.7)).add(cloud.mul(6.4)).add(grain.mul(0.18));
  const seam=abs(sin(bed)),halo=smoothstep(0.06,0.38,seam).oneMinus();
  const calcite=smoothstep(0.015,0.10,seam).oneMinus();
  const matrix=mix(vec3(0.069,0.052,0.077),vec3(0.29,0.24,0.26),cloud.mul(0.5).add(0.5));
  const mineral=mix(matrix,vec3(0.33,0.27,0.25),halo.mul(0.29)).add(calcite.mul(vec3(0.072,0.054,0.042)));
  const wet=smoothstep(-0.10,0.48,p.y.add(cloud.mul(0.12))).oneMinus();
  const pits=smoothstep(0.18,0.61,mx_noise_float(p.mul(48)));
  mat.colorNode=mineral.mul(grain.mul(0.13).add(1)).mul(pits.mul(-0.15).add(1)).mul(wet.mul(-0.38).add(1));
  mat.roughnessNode=clamp(float(0.75).add(pits.mul(0.20)).sub(calcite.mul(0.19)),0.42,0.98);
  mat.normalNode=reliefNormal(grain.mul(0.0025).sub(pits.mul(0.00065)).add(calcite.mul(0.0006)));
  // A smoother film lies over the porous substrate up to the tide mark.
  mat.clearcoatNode=wet.mul(0.52);
  mat.clearcoatRoughnessNode=mix(float(0.28),float(0.16),wet);
  return mat;
}

export function goldLeaf(){
  const mat=new THREE.MeshStandardNodeMaterial({vertexColors:true});
  const p=positionWorld, wear=mx_noise_float(p.mul(8.3)), hammer=mx_noise_float(p.mul(38));
  // A single coverage mask reveals the red clay ground under broken leaf.
  // Exposed ground reflects diffusely; intact gold has a coloured specular lobe.
  const coverage=smoothstep(-0.66,-0.24,wear.add(hammer.mul(0.20)));
  const bole=vec3(0.16,0.058,0.026),gold=vec3(0.81,0.555,0.26);
  mat.colorNode=mix(bole,gold,coverage);
  mat.metalnessNode=coverage;
  mat.roughnessNode=mix(float(0.79),clamp(float(0.37).add(wear.mul(0.16)).add(hammer.mul(0.065)),0.27,0.52),coverage);
  mat.normalNode=reliefNormal(hammer.mul(0.0007).add(coverage.mul(0.00018)));
  return mat;
}

export function bronzeHardware(){
  const mat=new THREE.MeshStandardNodeMaterial();
  const tarnish=smoothstep(0.18,0.70,mx_noise_float(positionWorld.mul(12)));
  mat.colorNode=mix(vec3(0.35,0.205,0.105),vec3(0.14,0.095,0.068),tarnish);
  mat.metalnessNode=mix(float(0.98),float(0.20),tarnish);
  mat.roughnessNode=mix(float(0.47),float(0.72),tarnish);
  return mat;
}

export function walnut(){
  const mat=new THREE.MeshPhysicalNodeMaterial({ior:1.48,clearcoat:0.14,clearcoatRoughness:0.47});
  const p=positionWorld,grain=mx_noise_float(p.mul(vec3(1.6,24,18)).add(mx_noise_float(p.mul(2)).mul(0.65)));
  const pores=smoothstep(-0.16,0.55,grain);
  mat.colorNode=mix(vec3(0.035,0.012,0.009),vec3(0.125,0.053,0.027),pores);
  mat.roughnessNode=mix(float(0.69),float(0.48),pores);
  mat.normalNode=reliefNormal(grain.mul(0.0015));
  return mat;
}

export function velvet(){
  const mat=new THREE.MeshPhysicalNodeMaterial({
    ior:1.46,specularIntensity:0.20,roughness:0.93,
    sheen:0.72,sheenColor:0xb9829b,sheenRoughness:0.72
  });
  const p=positionWorld;
  const nap=mx_noise_float(p.mul(vec3(13,4,10)));
  const pile=mx_noise_float(p.mul(vec3(61,31,54)));
  mat.colorNode=mix(vec3(0.061,0.010,0.025),vec3(0.161,0.026,0.048),nap.mul(0.44).add(0.5));
  mat.sheenRoughnessNode=clamp(float(0.72).add(nap.mul(0.16)),0.60,0.86);
  mat.normalNode=reliefNormal(pile.mul(0.0005));
  return mat;
}

// A repeating plain weave. Mip filtering averages the fine yarns as the camera
// pulls back, including in the lower-resolution water reflection.
function linenTile(){
  const size=64,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    const u=(x+0.5)*2/size,v=(y+0.5)*2/size;
    const warp=Math.pow(Math.abs(Math.sin(Math.PI*u)),0.8);
    const weft=Math.pow(Math.abs(Math.sin(Math.PI*v)),0.8);
    const lift=Math.cos(Math.PI*(u-0.5))*Math.cos(Math.PI*(v-0.5));
    const h=Math.max(warp*(0.70+0.30*lift),weft*(0.70-0.30*lift));
    const i=4*(y*size+x);
    data[i]=data[i+1]=data[i+2]=Math.round(255*h);data[i+3]=255;
  }
  const t=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;
  t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;
  return t;
}
const linen=linenTile();

export function linenShade(){
  const mat=new THREE.MeshPhysicalNodeMaterial({
    roughness:0.90,ior:1.46,specularIntensity:0.25,
    sheen:0.32,sheenColor:0xc9ab89,sheenRoughness:0.85
  });
  // U runs around the pleated shade. Use physical height for V on both
  // sides of the lathed section so the threads continue around the lip.
  const yarn=texture(linen,vec2(uv().x.mul(252),positionLocal.y.mul(76))).r;
  mat.colorNode=mix(vec3(0.44,0.32,0.20),vec3(0.58,0.45,0.31),yarn);
  const glow=smoothstep(-0.43,0.42,positionLocal.y).oneMinus();
  mat.emissiveNode=vec3(new THREE.Color(0xffbe77)).mul(glow.mul(0.13).add(0.07)).mul(yarn.mul(-0.26).add(1));
  mat.normalNode=reliefNormal(yarn.mul(0.00065));
  return mat;
}

export function oilOnLinen(tex,width,height){
  const mat=new THREE.MeshPhysicalNodeMaterial({map:tex,ior:1.48,specularIntensity:0.48,clearcoat:0.23});
  const yarn=texture(linen,uv().mul(vec2(width,height)).mul(135)).r;
  const tooth=mx_noise_float(positionWorld.mul(vec3(22,43,19)));
  // The colour is the original painting. Linen tooth breaks the ground layer
  // and a smoother, uneven varnish carries a separate reflection over it.
  mat.normalNode=reliefNormal(yarn.mul(0.00042).add(tooth.mul(0.0013)));
  mat.roughnessNode=clamp(float(0.72).sub(tooth.mul(0.17)),0.55,0.86);
  mat.clearcoatRoughnessNode=clamp(float(0.36).add(tooth.mul(0.11)),0.27,0.46);
  return mat;
}
