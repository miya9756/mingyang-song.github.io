#!/usr/bin/env python3
"""Bake assets/grain_teaser.png — the landing page's PGNM banner: clean | camera noise | film grain.

    python3 tools/bake_grain_teaser.py --pgnm ~/pgnm      # a checkout of github.com/miya9756/pgnm

One photograph three times, both noisy panels rendered by the reference model (`pgnm.PGNM`),
not by the browser port, so the banner is exactly what the published code produces:

* CAMERA — `presets/sidd/GP_3200.json`, a Pixel at ISO 3200: fine, chroma-heavy sensor noise.
* FILM — `presets/film/r200.json`, Newson's grain at radius 0.2, with its 7×7 blur B from
  `presets/film/blur.json` applied to the clean image first, as the studio does: the blur is part
  of the film model, which is why that panel is softer as well as grainier.

The two were picked from all 24 fitted presets as the pair that reads at 1x banner size as two
different worlds — coloured per-pixel speckle against clumped monochrome grain — which is the
model's whole claim. Stronger settings (S6 ISO 1600, r 0.4 and up) bury the palms.

THE CLEAN PANEL IS THE SOURCE, AND IT IS READ BACK OUT OF THE ASSET. It is a 256×256 crop of
Kodak's kodim16, carried over from the earlier teaser that the previous method made, and this
script copies it through untouched — so re-running reads the same pixels it wrote and the bake is
idempotent without shipping a second copy of the photograph. Its alpha is the rounded-corner mask
every panel reuses. The transparent corners hold black, so they are filled from their nearest
opaque neighbour before the film blur sees them; otherwise the 7×7 kernel would pull a dark fringe
three pixels into the rounded edge.

Layout is the previous asset's: three 256 px panels with 10 px transparent gaps, 788×256, 1x.
It stays 1x on purpose — noise is a per-pixel signal, and a 2x render downsampled for retina
would average it away. Seeds are fixed (the model's own bank seeds, and 2026 for the window), so
the output is byte-stable.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import correlate, distance_transform_edt

ROOT = Path(__file__).resolve().parents[1]
ASSET = ROOT / "assets" / "grain_teaser.png"
SIZE, GAP = 256, 10
CAMERA = "presets/sidd/GP_3200.json"
FILM, RADIUS = "presets/film/r200.json", "r200"


def to8(image):
    """The model's own 8-bit delivery: clip, then round half up."""
    return np.floor(np.clip(image.astype(np.float64), 0, 1) * 255 + 0.5).astype(np.uint8)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--pgnm", type=Path, required=True, help="checkout of github.com/miya9756/pgnm")
    pgnm = parser.parse_args().pgnm.expanduser().resolve()
    sys.path.insert(0, str(pgnm))
    from pgnm import PGNM, load

    source = np.asarray(Image.open(ASSET).convert("RGBA"))
    if source.shape != (SIZE, 3 * SIZE + 2 * GAP, 4):
        raise SystemExit(f"{ASSET}: expected {3 * SIZE + 2 * GAP}x{SIZE} RGBA, got {source.shape}")
    panel = source[:, :SIZE]
    alpha = panel[..., 3]
    # fill the masked corners from the nearest opaque pixel, so no filter ever reads them
    _, (rows, cols) = distance_transform_edt(alpha == 0, return_indices=True)
    clean8 = panel[..., :3][rows, cols]
    clean = clean8.astype(np.float64) / 255

    camera = PGNM(load(pgnm / CAMERA), workers=1).render(clean.astype(np.float32), np.random.default_rng(2026))
    weights = np.asarray(json.loads((pgnm / "presets/film/blur.json").read_text())[RADIUS], np.float64)
    blurred = np.stack([np.clip(correlate(255 * clean[..., c], weights, mode="reflect"), 0, 255) / 255
                        for c in range(3)], axis=-1)
    film = PGNM(load(pgnm / FILM), workers=1).render(blurred.astype(np.float32), np.random.default_rng(2026))

    out = np.zeros_like(source)
    for index, rgb in enumerate((clean8, to8(camera), to8(film))):
        x0 = index * (SIZE + GAP)
        out[:, x0:x0 + SIZE, :3] = np.where(alpha[..., None] > 0, rgb, 0)
        out[:, x0:x0 + SIZE, 3] = alpha
    Image.fromarray(out, "RGBA").save(ASSET, optimize=True)
    print(f"wrote {ASSET.relative_to(ROOT)} ({ASSET.stat().st_size // 1024} KB): clean | {CAMERA} | {FILM} + B")


if __name__ == "__main__":
    main()
