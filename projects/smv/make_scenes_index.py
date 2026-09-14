"""
make_scenes_index.py
--------------------
Regenerate ``web/scenes.json`` (the picker manifest) from whatever scenes are
present under ``web/scenes/``. Stdlib only — safe to run in CI with no deps.

Why separate from build_web_bundle.py: this rebuilds the *published* index from
whatever scenes are committed to the repo, so the site always lists exactly what
ships. Keep scenes free of content you can't publish (see web/.gitignore).

Usage:
    python web/make_scenes_index.py                  # all scene.json found
    python web/make_scenes_index.py --exclude foo    # skip a dataset locally
"""

from __future__ import annotations

import argparse
import json
import os

WEB_ROOT = os.path.dirname(os.path.abspath(__file__))
SCENES_DIR = os.path.join(WEB_ROOT, "scenes")

# Which navigation a scene OPENS in travels with the scene. Every scene opens orbiting (drag turns
# the object); list a dataset here to open its scenes flying instead. The reader can switch either
# way in the page. Upstream (4d-relight/web/player/make_scenes_index.py) orbits D-NeRF only and
# also declares an `up` axis; this page levels D-NeRF with PCA instead (see index.html, frameScene).
FLY_DATASETS: set = set()


def nav_for(rel: str) -> str:
    """Navigation mode for the scene at ``scenes/<rel>`` -- 'orbit' or 'fly'."""
    return "fly" if rel.replace(os.sep, "/").split("/")[0] in FLY_DATASETS else "orbit"


def _dir_mb(d: str) -> float:
    total = 0
    for dp, _, fs in os.walk(d):
        for f in fs:
            total += os.path.getsize(os.path.join(dp, f))
    return round(total / 1e6, 2)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--exclude", action="append", default=[],
                    help="path substring to skip (repeatable), e.g. --exclude foo")
    args = ap.parse_args()

    entries = []
    for dp, _, fs in os.walk(SCENES_DIR):
        if "scene.json" not in fs:
            continue
        rel = os.path.relpath(dp, SCENES_DIR)                 # e.g. "dnerf/hellwarrior"
        if any(x in rel for x in args.exclude):
            continue
        with open(os.path.join(dp, "scene.json")) as f:
            scene = json.load(f)
        mb = _dir_mb(dp)
        entries.append({
            "name": f"{rel}  ({mb} MB)",
            "url": f"scenes/{rel}/scene.json",
            "mb": mb,
            "cam": scene.get("camera"),
            "nav": nav_for(rel),
        })

    entries.sort(key=lambda s: s["name"])
    out = os.path.join(WEB_ROOT, "scenes.json")
    with open(out, "w") as f:
        json.dump(entries, f, indent=2)
    print(f"[make_scenes_index] wrote {out} with {len(entries)} scene(s): "
          + ", ".join(e["name"].split("  ")[0] for e in entries))


if __name__ == "__main__":
    main()
