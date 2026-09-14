#!/usr/bin/env python3
"""Check the Painted Room's mesh closure and winding in its actual three.js version.

python3 tools/check_room.py
Requires the Playwright environment also used by tools/shoot.py. No GPU rendering,
network requests, npm or generated files in the site are needed for these checks.
"""
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

CHECK = r"""() => {
  const {THREE,flutedColumn,ruinWall,frameSweep,MOULDING,closedTube}=window.roomGeometry;
  function audit(g,label){
    const p=g.attributes.position, ids=g.index?Array.from(g.index.array):Array.from({length:p.count},(_,i)=>i);
    const edges=new Map(); let volume=0,triangles=0;
    const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e5)).join(',');
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3();
    for(let i=0;i<ids.length;i+=3){
      const inds=ids.slice(i,i+3),k=inds.map(key);
      a.fromBufferAttribute(p,inds[0]);b.fromBufferAttribute(p,inds[1]);c.fromBufferAttribute(p,inds[2]);
      if(new Set(k).size<3 || ab.subVectors(b,a).cross(ac.subVectors(c,a)).lengthSq()<1e-18) continue;
      volume+=a.dot(ab.copy(b).cross(c))/6; triangles++;
      for(let j=0;j<3;j++){
        const x=k[j],y=k[(j+1)%3],name=x<y?x+'|'+y:y+'|'+x;
        const e=edges.get(name)||{count:0,winding:0};e.count++;e.winding+=x<y?1:-1;edges.set(name,e);
      }
    }
    const holes=[...edges.values()].filter(e=>e.count!==2).length;
    const reversed=[...edges.values()].filter(e=>e.winding!==0).length;
    if(holes || reversed || volume<=0) throw Error(`${label}: ${holes} open/nonmanifold edges, ${reversed} inconsistent edges, volume ${volume}`);
    g.dispose(); return `${label}: ${triangles} triangles, closed and outward`;
  }
  const results=[];
  for(const [r,h,seed,brk] of [[0.74,6.75,1.7,0.5],[0.46,2.15,2.2,1],[0.5,3.65,2.2,0.65],[0.46,0.85,6.1,0.9]]){
    results.push(audit(flutedColumn(r,h,seed,brk),'column '+h));
  }
  for(const tilt of [-0.48,0.55]) results.push(audit(ruinWall(6.2,4.85,0.55,1.3,tilt),'wall '+tilt));
  results.push(audit(frameSweep(3.4,1.9,MOULDING),'gilt frame'));
  results.push(audit(closedTube([[0,0,0],[0.2,0.5,0.1],[0,1,0]],0.03,24),'capped scroll'));
  results.push(audit(closedTube([[1,0,0],[0,1,0],[-1,0,0],[0,-1,0],[1,0,0]],0.03,48),'closed scroll'));
  return results;
}"""

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    src = (ROOT / 'misc/museum/room/index.html').read_text()
    src = src.replace("import {carvedFrame, dressRoom}", "import {carvedFrame, dressRoom, closedTube}")
    src = src.replace('\nboot();', '\nwindow.roomGeometry={THREE,flutedColumn,ruinWall,frameSweep,MOULDING,closedTube};')
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=['--no-sandbox'])
            page = browser.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.route('https://**/*', lambda route: route.abort())
            page.route('**/misc/museum/room/', lambda route: route.fulfill(body=src, content_type='text/html'))
            page.goto('http://127.0.0.1:%d/misc/museum/room/' % server.server_port)
            page.wait_for_function('window.roomGeometry', timeout=30000)
            for result in page.evaluate(CHECK):
                print(result)
            assert not errors, errors
            browser.close()
    finally:
        server.shutdown()

if __name__ == '__main__':
    main()
