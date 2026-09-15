#!/usr/bin/env python3
"""Render the room's actual water shaders and check caustics on software adapters.

python3 tools/check_room_water.py [--webgpu] [--out /tmp/room-water]
Uses the existing Playwright environment; no npm or network assets are required.
Software-rendered timings are not a hardware performance benchmark.
"""
import argparse
import functools
import http.server
import os
from pathlib import Path
import sys
import threading

ROOT = Path(__file__).resolve().parent.parent
PW_PY = Path.home() / 'miniconda3/envs/4dre/bin/python'
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    if Path(sys.executable) != PW_PY and PW_PY.exists():
        os.execv(str(PW_PY), [str(PW_PY), __file__] + sys.argv[1:])
    raise

from shoot import WEBGPU_ARGS

EXPOSE = """
window.roomWater={THREE,renderer,scene,camera,water,simRT,causticsRT,uSwell,uTime,uDrop,pickList,
  lamp,aim,aimShown,uLampDir,uLampPos,stepWater,bakeLightDepth,renderCaustics,frame,
  render:()=>{bakeLightDepth();renderCaustics(renderer);renderer.render(scene,camera);},
  aimFloor:()=>{lamp.target.position.set(2,0,-2);lamp.target.updateMatrixWorld();
    uLampDir.value.copy(lamp.target.position).sub(lamp.position).normalize();},
  homeLight:()=>{lamp.target.position.copy(HOME_AIM);lamp.target.updateMatrixWorld();
    uLampDir.value.copy(lamp.target.position).sub(lamp.position).normalize();},
  settle:()=>{settleUntil=-1;},
  topView:()=>{cam.pitch=0.55;cam.dist=8.2;placeCamera();},
  resetView
};
"""

READ = """async () => {
  const {THREE,renderer,causticsRT}=window.roomWater;
  const pixels=await renderer.readRenderTargetPixelsAsync(causticsRT,0,0,512,512);
  const unpack=v=>THREE.DataUtils.fromHalfFloat(v);
  let sum=0,sum2=0,peak=0,lamp=0,cx=0,cy=0,count=0;
  for(let y=40;y<472;y++) for(let x=40;x<472;x++){
    const i=(y*512+x)*4, a=unpack(pixels[i]), b=unpack(pixels[i+1]);
    if(!Number.isFinite(a+b)) throw Error('Non-finite caustic irradiance');
    sum+=a;sum2+=a*a;peak=Math.max(peak,a);count++;
    lamp+=b;cx+=x*b;cy+=y*b;
  }
  const mean=sum/count;
  return {mean,variance:sum2/count-mean*mean,peak,lamp,cx:cx/Math.max(lamp,1e-8),
    cy:cy/Math.max(lamp,1e-8)};
}"""


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--webgpu', action='store_true')
    ap.add_argument('--out', default='/tmp/room-water')
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    src = (ROOT / 'misc/museum/room/index.html').read_text()
    if not args.webgpu:
        src = src.replace('antialias:true, alpha:false}', 'antialias:true, alpha:false, forceWebGL:true}')
    # Draw on demand so a slow software adapter cannot bury browser commands under rAF.
    src = src.replace('renderer.setAnimationLoop(frame);', EXPOSE)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    errors = []
    try:
        with sync_playwright() as p:
            flags = WEBGPU_ARGS if args.webgpu else ['--no-sandbox', '--use-gl=angle',
                '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
            browser = p.chromium.launch(args=flags)
            page = browser.new_page(viewport={'width': 800, 'height': 740})
            page.set_default_timeout(180000)
            page.on('pageerror', lambda e: (errors.append(str(e)), print('PAGE ERROR:', e, flush=True)))
            def console(message):
                if message.type in ('error', 'warning'):
                    print('CONSOLE:', message.type, message.text[:1200], flush=True)
                if message.type == 'error':
                    errors.append(message.text)
            page.on('console', console)
            page.route('https://**/*', lambda route: route.fulfill(body='', content_type='text/css'))
            page.route('**/misc/museum/room/', lambda route: route.fulfill(body=src, content_type='text/html'))
            page.goto('http://127.0.0.1:%d/misc/museum/room/' % server.server_port, wait_until='domcontentloaded')
            page.wait_for_function('window.roomWater')
            print('Ready:', page.locator('#backend').inner_text(), flush=True)
            assert page.evaluate('!!roomWater.renderer.backend.isWebGPUBackend') == args.webgpu
            page.evaluate('''() => {const w=roomWater; w.uDrop.value.z=0;w.uSwell.value=0;
                w.aimFloor(); w.stepWater();w.render();}''')
            print('Flat water rendered', flush=True)
            if not args.webgpu:
                flat = page.evaluate(READ)
                print('Flat:', flat, flush=True)
                assert 0.9 < flat['mean'] < 1.1 and flat['variance'] < 0.002, flat
                assert flat['lamp'] > 10, 'Lamp caustics did not reach the floor'
                # A +X/-Z aim must reach this quadrant of the top-down light map.
                assert flat['cx'] > 256 and flat['cy'] > 256, flat
                page.evaluate('''() => {const w=roomWater; w.uDrop.value.set(0.40,0.45,0.55);
                    for(let i=0;i<18;i++) w.stepWater();w.render();}''')
                ripple = page.evaluate(READ)
                print('Ripple:', ripple, flush=True)
                assert ripple['variance'] > flat['variance'] + 0.001, 'Ripples did not focus light'
                assert ripple['peak'] > 1.2, 'No concentrated caustic light'
            page.evaluate('() => {roomWater.uSwell.value=0.24;roomWater.uTime.value=3;roomWater.render();}')
            if not args.webgpu:
                page.evaluate('() => {roomWater.water.visible=false;roomWater.render();}')
                page.locator('.stage').screenshot(path=str(out / 'floor-without-water.png'))
                page.evaluate('() => {roomWater.water.visible=true;roomWater.render();}')
                page.locator('.stage').screenshot(path=str(out / 'water.png'))
                page.evaluate('() => {roomWater.topView();roomWater.render();}')
                page.locator('.stage').screenshot(path=str(out / 'water-floor.png'))
                page.evaluate('() => {roomWater.resetView();roomWater.homeLight();roomWater.render();}')
                page.locator('.stage').screenshot(path=str(out / 'water-opening.png'))
                page.set_viewport_size({'width': 390, 'height': 700})
                page.evaluate('() => {roomWater.resetView();roomWater.render();}')
                page.locator('.stage').screenshot(path=str(out / 'water-phone.png'))
            # Exercise the page's pointer handler, including its ray picking. Find an
            # exposed patch so changing the furniture cannot make this click a chair.
            point = page.evaluate('''() => {
                const w=roomWater, ray=new w.THREE.Raycaster();
                const box=document.getElementById('gl').getBoundingClientRect();
                w.uDrop.value.z=0;
                for(let y=0.9;y>0.5;y-=0.1) for(let x=0.4;x<0.8;x+=0.1){
                    ray.setFromCamera(new w.THREE.Vector2(x*2-1,1-y*2),w.camera);
                    const hit=ray.intersectObjects(w.pickList,true)[0];
                    if(hit && hit.object===w.water) return {
                        x:box.left+x*box.width,y:box.top+y*box.height,
                        worldX:hit.point.x,worldZ:hit.point.z};
                }
                throw Error('No visible water to touch');
            }''')
            page.mouse.click(point['x'], point['y'])
            touch = page.evaluate('''() => ({drop:roomWater.uDrop.value.z,
                x:roomWater.aim.x,z:roomWater.aim.z})''')
            assert touch['drop'] > 0, 'Touching water did not create a ripple'
            assert abs(touch['x']-point['worldX']) < 0.15, touch
            assert abs(touch['z']-point['worldZ']) < 0.15, touch
            print('Touch aimed the lamp and created a ripple', flush=True)
            page.emulate_media(reduced_motion='reduce')
            # frameCalls resets on renderer frames even when the room is idle. Use
            # cumulative calls in one task, also excluding pending resize callbacks.
            idle = page.evaluate('''() => {
                roomWater.frame();roomWater.settle();
                const before=roomWater.renderer.info.render.calls;
                roomWater.frame();
                return before===roomWater.renderer.info.render.calls;
            }''')
            assert idle, 'Reduced-motion idle frame redrew the scene'
            assert not errors, errors
            browser.close()
            print('Water checks passed' + (' (WebGPU compilation/render only)' if args.webgpu else ''), flush=True)
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
