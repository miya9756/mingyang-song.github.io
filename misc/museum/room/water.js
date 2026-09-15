import * as THREE from './vendor/three.webgpu.min.js';

const {Fn, vec2, vec3, vec4, float, texture, positionGeometry, positionWorld, cameraPosition,
       cameraViewMatrix, cameraProjectionMatrix, normalize, refract, reflector, screenUV,
       viewportSharedTexture, viewportSafeUV, mix, clamp, max, abs, exp, pow, dot, length,
       fract, floor, smoothstep, oneMinus, mx_noise_float, varying, dFdx, dFdy, step} = THREE.TSL;

// One normal field drives reflection, refraction and light focusing. The caustics are a
// rasterised bundle of refracted rays landing on a flat floor, in both GLSL and WGSL.
// This is a shallow-water approximation: submerged vertical faces do not receive caustics.
export function shallowWater({scene, floorMat, simTexture, simSize, halfSize, waterY, floorY,
                              time, swell, lampPos, lampDir, lampTint, lampIntensity,
                              cosOuter, cosInner, lightVP, lightDepth, shadowFlip, shadowBias,
                              moonDirection, moonColor}){
  const depth=waterY-floorY, toUV=1/(2*halfSize), e=1/simSize;
  const waterNormal=Fn(([p])=>{
    const wuv=p.xz.mul(toUV).add(0.5);
    // Explicit level zero also permits sampling the simulation from a vertex shader.
    const h=o=>texture(simTexture,wuv.add(o)).level(0).x;
    const dx=h(vec2(e,0)).sub(h(vec2(-e,0))).mul(9);
    const dz=h(vec2(0,e)).sub(h(vec2(0,-e))).mul(9);
    // A scalar height gives a coherent slope; fine capillary waves concentrate light
    // even in a shallow pool. Their amplitude is zero under reduced motion.
    const t=time.mul(0.22);
    const height=o=>mx_noise_float(vec3(p.xz.add(o).mul(3.6),t));
    const sx=height(vec2(0.04,0)).sub(height(vec2(-0.04,0))).mul(swell);
    const sz=height(vec2(0,0.04)).sub(height(vec2(0,-0.04))).mul(swell);
    return normalize(vec3(dx.add(sx).negate(),1,dz.add(sz).negate()));
  });

  // 512², two 160² grids, no room geometry or additional scene capture. Additive
  // blending accumulates folds where multiple surface patches focus on the same spot.
  const causticsRT=new THREE.RenderTarget(512,512,{type:THREE.HalfFloatType,
    depthBuffer:false,stencilBuffer:false});
  causticsRT.texture.generateMipmaps=false;
  const causticScene=new THREE.Scene();
  const causticCamera=new THREE.OrthographicCamera(-halfSize,halfSize,halfSize,-halfSize,0.1,4);
  causticCamera.position.set(0,2,0);
  causticCamera.up.set(0,0,-1);
  causticCamera.lookAt(0,0,0);
  const grid=new THREE.PlaneGeometry(2*halfSize,2*halfSize,160,160);
  grid.rotateX(-Math.PI/2);

  const lampVisibility=Fn(([p])=>{
    const clip=lightVP.mul(vec4(p,1));
    const uv0=clip.xy.div(max(clip.w,0.0001)).mul(0.5).add(0.5);
    const luv=vec2(uv0.x,mix(uv0.y,oneMinus(uv0.y),shadowFlip.mul(-0.5).add(0.5)));
    const inside=step(0,clip.w).mul(step(0,luv.x)).mul(step(luv.x,1))
      .mul(step(0,luv.y)).mul(step(luv.y,1));
    return step(length(p.sub(lampPos)),texture(lightDepth,clamp(luv,0,1)).x.add(shadowBias)).mul(inside);
  });

  for(const isLamp of [false,true]){
    const m=new THREE.NodeMaterial();
    m.depthTest=false; m.depthWrite=false; m.toneMapped=false;
    m.side=THREE.DoubleSide; m.transparent=true; m.blending=THREE.AdditiveBlending;
    // positionGeometry stays unchanged when positionNode moves the mesh to the floor.
    const source=vec3(positionGeometry.x,waterY,positionGeometry.z);
    const incident=isLamp?normalize(source.sub(lampPos)):vec3(moonDirection);
    const ray=refract(incident,waterNormal(source),float(1/1.333));
    const hit=source.add(ray.mul(float(depth).div(max(ray.y.negate(),0.1))));
    m.positionNode=vec3(hit.x,0,hit.z);
    const original=varying(source.xz), landing=varying(hit.xz);
    const area=p=>abs(dFdx(p).x.mul(dFdy(p).y).sub(dFdx(p).y.mul(dFdy(p).x)));
    // The surface footprint divided by its floor footprint conserves the ray bundle's
    // power. A finite cap keeps subpixel focal lines from flickering or overflowing.
    const focus=clamp(area(original).div(max(area(landing),0.000001)),0,8);
    let energy=float(1);
    if(isLamp){
      const p=varying(source), incoming=normalize(p.sub(lampPos));
      const cone=smoothstep(cosOuter,cosInner,dot(incoming,lampDir));
      energy=cone.mul(lampVisibility(p)).mul(max(incoming.y.negate(),0))
        .mul(lampIntensity/Math.PI).div(max(dot(p.sub(lampPos),p.sub(lampPos)),1));
    }
    m.fragmentNode=isLamp?vec4(0,focus.mul(energy),0,1):vec4(focus,0,0,1);
    const mesh=new THREE.Mesh(grid,m);
    mesh.frustumCulled=false;
    causticScene.add(mesh);
  }

  // World-space slabs make the submerged floor's depth and optical distortion visible.
  const p=positionWorld.xz;
  const tileUV=fract(p.div(1.35));
  const edge=tileUV.min(oneMinus(tileUV));
  const grout=oneMinus(smoothstep(0.012,0.027,edge.x.min(edge.y)));
  const checker=floor(p.x.div(1.35)).add(floor(p.y.div(1.35))).mod(2).abs();
  const grain=mx_noise_float(positionWorld.mul(7)).mul(0.035).add(1);
  const stone=mix(vec3(0.052,0.055,0.053),vec3(0.038,0.047,0.048),checker).mul(grain);
  floorMat.colorNode=mix(stone,vec3(0.027,0.032,0.030),grout);
  const cuv=p.mul(toUV).add(0.5);
  // The top-down camera's up axis is -Z, so its texture V runs opposite world Z.
  // TSL additionally handles the backend's render-target orientation.
  const light=texture(causticsRT.texture,vec2(cuv.x,oneMinus(cuv.y))).rg;
  const moon=vec3(new THREE.Color(moonColor));
  const focused=moon.mul(max(light.r.sub(1),0).mul(1.8)).add(lampTint.mul(max(light.g,0)));
  const onFloor=oneMinus(smoothstep(0.01,0.05,abs(positionWorld.y.sub(floorY))));
  floorMat.emissiveNode=floorMat.colorNode.mul(focused).mul(onFloor);

  const water=new THREE.Mesh(new THREE.PlaneGeometry(2*halfSize,2*halfSize),
    new THREE.MeshBasicNodeMaterial({transparent:true,depthWrite:true}));
  water.rotation.x=-Math.PI/2;
  water.position.y=waterY;
  water.renderOrder=1;
  scene.add(water);
  const reflection=reflector({resolutionScale:0.4});
  reflection.target.rotation.x=-Math.PI/2;
  reflection.target.position.y=waterY;
  scene.add(reflection.target);

  const pw=positionWorld, n=waterNormal(pw), view=normalize(cameraPosition.sub(pw));
  const fresnel=float(0.02).add(pow(oneMinus(max(dot(n,view),0)),5).mul(0.98));
  reflection.uvNode=(reflection.uvNode||screenUV.flipX()).add(n.xz.mul(0.026));

  // Reuse the already drawn opaque room. Refract a view ray to the floor, project
  // that point back to the screen, and reject offsets crossing a foreground silhouette.
  // This adds framebuffer copies, not another render of every column and painting.
  const transmitted=refract(view.negate(),n,float(1/1.333));
  const travel=float(depth).div(max(transmitted.y.negate(),0.15));
  const below=pw.add(transmitted.mul(travel));
  const clip=cameraProjectionMatrix.mul(cameraViewMatrix.mul(vec4(below,1)));
  const refractedUV=clip.xy.div(max(clip.w,0.0001)).mul(vec2(0.5,-0.5)).add(0.5);
  const safeUV=viewportSafeUV(clamp(refractedUV,0.002,0.998));
  const transmission=exp(vec3(-0.95,-0.30,-0.20).mul(travel));
  const body=viewportSharedTexture(safeUV).rgb.mul(transmission)
    .add(vec3(0.018,0.045,0.048).mul(oneMinus(transmission)));
  const toLamp=lampPos.sub(pw), L=normalize(toLamp), H=normalize(L.add(view));
  const cone=smoothstep(cosOuter,cosInner,dot(L.negate(),lampDir));
  const spec=pow(max(dot(n,H),0),420).mul(2.6).mul(cone).mul(lampVisibility(pw));
  const atten=float(1).div(float(1).add(dot(toLamp,toLamp).mul(0.0484)));
  // Keep this RGB: mixing the reflector's RGBA and then adding RGB specular would
  // promote that specular to alpha=1 and make transparent blending overshoot.
  // A small reflection floor keeps the surface legible in this dark room, even
  // when looking down through it; grazing views still follow Fresnel to a mirror.
  const reflectionAmount=clamp(fresnel.mul(0.90).add(0.10),0,1);
  water.material.colorNode=mix(body,reflection.rgb.mul(0.90),reflectionAmount)
    .add(lampTint.mul(spec.mul(atten)));

  function renderCaustics(renderer){
    const previous=renderer.getRenderTarget();
    renderer.setRenderTarget(causticsRT);
    renderer.render(causticScene,causticCamera);
    renderer.setRenderTarget(previous);
  }
  return {water,renderCaustics,causticsRT};
}
