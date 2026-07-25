# mingyang-song.github.io

Personal site. Fully static — no bundler, no npm, no backend. Published to GitHub
Pages by `.github/workflows/pages.yml` on every push to `main`.

```
index.html                  landing page
assets/                     css / js / images for the site shell
projects/
└── smv/                    SmoothMotionVectors web player (self-contained)
    ├── index.html          viewer: WebGL2 renderer + timeline + UI (single file)
    ├── decode.js           reference.npz -> keyframe (dequant, shared statics, SH codebook)
    ├── decode_motion.js    ffmpeg.wasm decode of xyz/rot motion streams (2-way decode pool)
    ├── dequant_worker.js   Web Worker: off-thread offset dequant + apply (parity-critical)
    ├── sw.js               service worker: caches vendor/ (~31 MB wasm) across sessions
    ├── make_scenes_index.py  regenerate scenes.json from scenes/ (stdlib only)
    ├── scenes.json         scene-picker manifest (GENERATED — do not hand-edit)
    ├── scenes/             19 scenes: dnerf ×10, nerfds ×7, hypernerf ×2 (Git LFS)
    └── vendor/             ffmpeg.wasm core + fflate (vendored, read-only)
tools/
└── visitor_worker/         Cloudflare Worker behind the viewer's "live viewers" globe
                            (a deploy artifact — served from Cloudflare, not from Pages)
```

## Local preview

ES modules + WebGL2 need `http://`, not `file://`:

```bash
python3 -m http.server 8137      # from the repo root, then open http://localhost:8137/
```

Working on the cluster? Tunnel first: `ssh -L 8137:<compute-node>:8137 <login-node>`.
First viewer load fetches the ~31 MB `ffmpeg.wasm` once; `sw.js` caches it after that.

## Git LFS

Scene binaries (`*.mkv`, `*.npz`) are in Git LFS — see `.gitattributes`. Clone and CI
must smudge them or the viewer serves pointer stubs; the Pages workflow already sets
`lfs: true`. Visitors are served from the Pages CDN, so viewer traffic costs no LFS
bandwidth — only CI checkouts do.

## Adding a scene

Drop a folder under `projects/smv/scenes/<dataset>/<name>/` (needs `scene.json` plus
per-GOP `reference.npz` + `.mkv` streams), then regenerate the index:

```bash
python3 projects/smv/make_scenes_index.py
```

Scenes are produced by `build_web_bundle.py` in the training repo
(`/cluster/home/misong/4d-relight/web/player_browser/`), which needs the dataset and
the `smv` conda env. Ship only publishable content — `neur3d` contains human faces.

## Upstream

The viewer originates from `/cluster/home/misong/4d-relight/web/player_browser/`
(source of truth for the decode path) and `/cluster/home/misong/SMV_webviewer` (the
former Pages mirror, source of truth for viewer/render/UI). See `CLAUDE.md` for what
was merged from which and what deliberately was not.
