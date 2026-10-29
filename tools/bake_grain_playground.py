#!/usr/bin/env python3
"""Bake projects/grain/data/ — the PGNM playground's presets and its noise-mixer space.

    python3 tools/bake_grain_playground.py --pgnm ~/pgnm      # a checkout of github.com/miya9756/pgnm

Writes, as little-endian float32:

* presets/<id>.bin — four shipped presets for the step-by-step figure and the quantile
  machine: kernels (25, 25, 3, 3) then the lookup g (3, 256, 25), both in C order.
* joint.bin — the PGNM Designer's "joint" PCA space over all 24 fitted presets (16 SIDD
  camera-ISO classes sorted by name, then the 8 Newson radii): kernel mean, 6 kernel
  components, lookup mean, 12 lookup components. The basis is the Designer's own
  (`basis()` in experiments/pca3/presets.py of the private research repo, and the same SVD
  as the public figures/joint_pca.py): mean-subtracted SVD in float64, every component's
  largest-magnitude entry made positive. Rebuilt from the public presets it is
  byte-identical to the Designer's frontend/assets/joint.bin (sha256 JOINT_SHA256 below),
  which the script checks.
* manifest.json — knots, the four presets, and the space with every preset's raw scores
  (`components @ (preset - mean)`), the layout `PGNMEngine.space()` reads.

Needs numpy only; the presets are read as plain pgnm/5 JSON.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "projects" / "grain" / "data"
JOINT_SHA256 = "51b7ebb146bb883fc474adb2310464c1e2550d2960e113f214b6985abfcf96e7"
KERNEL_COMPONENTS, LOOKUP_COMPONENTS = 6, 12
RADII = ["r025", "r050", "r075", "r100", "r200", "r400", "r600", "r800"]
CAMERAS = {"G4": "LG G4", "GP": "Pixel", "IP": "iPhone 7", "N6": "Nexus 6", "S6": "Galaxy S6"}
FIGURE = [  # id, preset file in the PGNM checkout, label
    ("S6_3200", "presets/sidd/S6_3200.json", "Galaxy S6 · ISO 3200"),
    ("GP_10000", "presets/sidd/GP_10000.json", "Pixel · ISO 10000"),
    ("r400", "presets/film/r400.json", "Film grain · r 0.4"),
    ("nocturne", "presets/bandwidth/pgnm.json", "Nocturne · colour grain"),
]


def read(path):
    params = json.loads(Path(path).read_text())
    if params.get("schema") != "pgnm/5":
        raise ValueError(f"{path}: expected a pgnm/5 preset")
    kernels = np.asarray(params["kernels"], np.float64)
    lookup = np.asarray(params["marginal"]["g"], np.float64)
    if kernels.shape != (25, 25, 3, 3) or lookup.shape != (3, 256, 25):
        raise ValueError(f"{path}: unexpected array shapes")
    return kernels, lookup, params["marginal"]["t"]


def basis(stack):
    rows = stack.reshape(len(stack), -1)
    mean = rows.mean(0)
    _, s, vt = np.linalg.svd(rows - mean, full_matrices=False)
    signs = np.sign(vt[np.arange(len(vt)), np.abs(vt).argmax(1)])
    signs[signs == 0] = 1
    return mean, (vt * signs[:, None])[:len(rows) - 1], (s ** 2 / (s ** 2).sum())[:len(rows) - 1]


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--pgnm", type=Path, required=True, help="checkout of github.com/miya9756/pgnm")
    pgnm = parser.parse_args().pgnm.expanduser()
    (OUT / "presets").mkdir(parents=True, exist_ok=True)

    figure = []
    for key, rel, label in FIGURE:
        kernels, lookup, knots = read(pgnm / rel)
        np.concatenate([kernels.ravel(), lookup.ravel()]).astype("<f4").tofile(OUT / "presets" / f"{key}.bin")
        figure.append(dict(id=key, label=label, file=f"presets/{key}.bin"))

    members = [("sidd", p.stem) for p in sorted((pgnm / "presets/sidd").glob("*.json"))]
    members += [("newson", r) for r in RADII]
    arrays = [read(pgnm / ("presets/sidd" if d == "sidd" else "presets/film") / f"{n}.json") for d, n in members]
    space = dict(id="joint", file="joint.bin", presets=[])
    blocks, bases = [], {}
    for index, (part, key, count) in enumerate((("kernels", "kernel", KERNEL_COMPONENTS),
                                                ("lookup", "lookup", LOOKUP_COMPONENTS))):
        mean, components, variance = basis(np.stack([a[index] for a in arrays]))
        bases[key] = (mean, components[:count])
        blocks += [mean, components[:count].ravel()]
        space[key] = dict(components=count, variance=variance[:count].tolist())
    for (dataset, name), (kernels, lookup, _) in zip(members, arrays):
        camera, _, iso = name.partition("_")
        label = f"{CAMERAS[camera]} · ISO {iso}" if dataset == "sidd" else f"Film grain · r {int(name[1:]) / 1000:g}"
        order = int(iso) if dataset == "sidd" else int(name[1:]) / 1000
        scores = {key: (bases[key][1] @ (array.ravel() - bases[key][0])).tolist()
                  for key, array in (("kernel", kernels), ("lookup", lookup))}
        space["presets"].append(dict(id=f"{dataset}:{name}", label=label, dataset=dataset, order=order, **scores))
    data = np.concatenate(blocks).astype("<f4")
    digest = hashlib.sha256(data.tobytes()).hexdigest()
    if digest != JOINT_SHA256:
        raise SystemExit(f"joint.bin differs from the Designer's ({digest}); are these the frozen presets?")
    (OUT / "joint.bin").write_bytes(data.tobytes())
    space["floats"] = int(data.size)

    manifest = dict(schema="pgnm-playground/1", model_schema="pgnm/5", knots=knots, figure=figure,
                    space=space, joint_sha256=digest)
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    print(f"wrote {len(figure)} presets and joint.bin ({data.size} floats, sha256 matches the Designer)")


if __name__ == "__main__":
    main()
