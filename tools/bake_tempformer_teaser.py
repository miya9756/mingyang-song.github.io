#!/usr/bin/env python3
"""Bake assets/tempformer_teaser.png — the landing page's card banner.

Seven jittery input bottles -> five output glasses, the middle one split down the
centre because two sliding windows both pour into it and, with no Overlap Loss,
they disagree. That split glass is the page's whole subject, so the teaser is a
frame of the real thing: the same OKLab colour model and the same least-squares
mixing table the page fits in the browser, not a drawing of them.

Transparent ground (the card supplies its own surface), supersampled 3x then
downscaled — PIL has no antialiased polygon fill.

    python3 tools/bake_tempformer_teaser.py
"""
import math
import os
import random

from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "assets", "tempformer_teaser.png")
W, H, SS = 1320, 274, 3          # ~2x the ~660 CSS px the card ever paints it at
INK = (34, 38, 44)

# ── OKLab ↔ sRGB. Ported verbatim to the page's JS; keep the two in step. ──────


def oklab_to_srgb(L, a, b):
    l_, m_, s_ = (L + .3963377774 * a + .2158037573 * b,
                  L - .1055613458 * a - .0638541728 * b,
                  L - .0894841775 * a - 1.2914855480 * b)
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    lin = (4.0767416621 * l - 3.3077115913 * m + .2309699292 * s,
           -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s,
           -.0041960863 * l - .7034186147 * m + 1.7076147010 * s)
    out = []
    for v in lin:
        v = min(1.0, max(0.0, v))
        out.append(round(255 * (12.92 * v if v <= .0031308
                                else 1.055 * v ** (1 / 2.4) - .055)))
    return tuple(out)


def lch(L, C, Hdeg):
    r = math.radians(Hdeg)
    return L, C * math.cos(r), C * math.sin(r)


# ── the machine: one 3x5 mixing table, rows summing to 1 ──────────────────────


def solve(M, r):
    """Gaussian elimination with partial pivoting. Same routine as the page's."""
    n = len(r)
    A = [row[:] + [r[i]] for i, row in enumerate(M)]
    for c in range(n):
        p = max(range(c, n), key=lambda i: abs(A[i][c]))
        A[c], A[p] = A[p], A[c]
        for i in range(c + 1, n):
            f = A[i][c] / A[c][c]
            for j in range(c, n + 1):
                A[i][j] -= f * A[c][j]
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        x[i] = (A[i][n] - sum(A[i][j] * x[j] for j in range(i + 1, n))) / A[i][i]
    return x


def fit(samples):
    """Least-squares 3x5 table over (noisy 7-slot sequence, clean 7-slot) pairs.

    Window A reads slots 0..4 and pours 1,2,3; window B reads 2..6 and pours
    3,4,5 — exactly video_denoiser/train.py's layout. alpha = 0 here: the teaser
    wants the seam, not the fix.
    """
    n = 18                                   # 15 weights + 3 row-sum multipliers
    M = [[0.0] * n for _ in range(n)]
    rhs = [0.0] * n
    for x, c in samples:
        for i in range(3):
            for win, tgt in ((x[0:5], c[1 + i]), (x[2:7], c[3 + i])):
                for p in range(5):
                    for q in range(5):
                        M[5 * i + p][5 * i + q] += win[p] * win[q] / 3
                    rhs[5 * i + p] += win[p] * tgt / 3
    for i in range(3):
        for p in range(5):
            M[5 * i + p][15 + i] = M[15 + i][5 * i + p] = 1.0
        rhs[15 + i] = 1.0
    w = solve(M, rhs)
    return [w[5 * i:5 * i + 5] for i in range(3)]


def mix(W, win):
    return [sum(W[i][k] * win[k] for k in range(5)) for i in range(3)]


# ── drawing ───────────────────────────────────────────────────────────────────


def bottle(d, x, y, w, h, fill):
    """A flask: shoulders tapering into a short neck, filled to the shoulder."""
    nw, nh = w * .30, h * .20
    cx = x + w / 2
    d.rounded_rectangle([cx - nw / 2, y, cx + nw / 2, y + nh + w * .18],
                        radius=nw * .45, fill=fill)
    d.polygon([(cx - nw / 2, y + nh), (cx + nw / 2, y + nh),
               (x + w, y + nh + h * .18), (x + w, y + h),
               (x, y + h), (x, y + nh + h * .18)], fill=fill)
    d.rounded_rectangle([x, y + nh + h * .10, x + w, y + h], radius=w * .22, fill=fill)


def glass(img, d, x, y, w, h, fill, fill_r=None):
    """A tumbler. With fill_r it is painted split down the centre — the seam.

    The right half is rendered on its own layer and pasted, rather than drawn as
    a second rounded rect: overlapping two radii leaves a notch at the midline,
    which reads as a drawing mistake exactly where the figure wants a clean cut.
    """
    d.rounded_rectangle([x, y, x + w, y + h], radius=w * .20, fill=fill)
    if fill_r is None:
        return
    lay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(lay).rounded_rectangle([0, 0, w - 1, h - 1], radius=w * .20, fill=fill_r)
    half = w // 2
    img.paste(lay.crop((half, 0, w, h)), (x + half, y), lay.crop((half, 0, w, h)))


def main():
    rng = random.Random(7)

    # A training set of DRIFTING colour paths — a random walk through OKLCH, matching the page's
    # makePath(). The statistics matter, not just the look: under a globally-parameterised curve
    # the two windows agree mostly through shared input noise, which is the wrong story for the
    # figure to be a frame of. See CLAUDE.md.
    HUE_STEP, HUE_DRIFT, L_STEP, CHROMA = 13.0, 15.0, .016, .125

    def path(rng):
        h, L, out = rng.uniform(0, 360), rng.uniform(.66, .78), []
        d = 1 if rng.random() < .5 else -1
        for i in range(7):
            if i:
                h += rng.gauss(0, HUE_STEP) + d * HUE_DRIFT
                L = min(.88, max(.52, L + rng.gauss(0, L_STEP)))
            out.append(lch(L, CHROMA, h))
        return out

    SIG = .058                   # enough jitter that the inputs read as noisy, not as a ramp
    samples = []
    for _ in range(700):
        p = path(rng)
        for ch in range(3):
            c = [q[ch] for q in p]
            samples.append(([v + rng.gauss(0, SIG) for v in c], c))
    Wm = fit(samples)

    # the sequence the teaser shows
    clean = path(random.Random(6))
    noisy = [tuple(v + rng.gauss(0, SIG) for v in q) for q in clean]
    ch = lambda seq, k: [q[k] for q in seq]
    A = [[mix(Wm, ch(noisy, k)[0:5])[i] for k in range(3)] for i in range(3)]
    B = [[mix(Wm, ch(noisy, k)[2:7])[i] for k in range(3)] for i in range(3)]

    img = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = lambda v: int(round(v * SS))

    # laid out from the content width and centred, so changing any size keeps the margins even
    bw, bh, gap = 72, 170, 22
    gw, gh, ggap = 76, 132, 20
    chev, pad = 54, 40
    span = (7 * bw + 6 * gap) + pad + chev + pad + (5 * gw + 4 * ggap)
    x0, ytop = (W - span) / 2, 52

    for i, c in enumerate(noisy):
        bottle(d, s(x0 + i * (bw + gap)), s(ytop), s(bw), s(bh),
               oklab_to_srgb(*c) + (255,))

    ax = x0 + (7 * bw + 6 * gap) + pad
    for k, dx in enumerate((0, 17, 34)):                      # a chevron, not an arrow
        d.polygon([(s(ax + dx), s(ytop + bh / 2 - 25)), (s(ax + dx + 14), s(ytop + bh / 2)),
                   (s(ax + dx), s(ytop + bh / 2 + 25)), (s(ax + dx + 5), s(ytop + bh / 2))],
                  fill=INK + (70 + 58 * k,))

    gx = ax + chev + pad
    out = [A[0], A[1], None, B[1], B[2]]                       # slot 3 is the split one
    for i, c in enumerate(out):
        x, y = s(gx + i * (gw + ggap)), s(ytop + bh - gh)
        if c is None:
            glass(img, d, x, y, s(gw), s(gh),
                  oklab_to_srgb(*A[2]) + (255,), oklab_to_srgb(*B[0]) + (255,))
        else:
            glass(img, d, x, y, s(gw), s(gh), oklab_to_srgb(*c) + (255,))

    img = img.resize((W, H), Image.LANCZOS)
    img.save(OUT, optimize=True)
    print(f"wrote {OUT}  {img.size[0]}x{img.size[1]}  {os.path.getsize(OUT)/1024:.0f} KB")
    print("mixing table (rows = pours 1,2,3; cols = inlets 0..4):")
    for r in Wm:
        print("  " + "  ".join(f"{v:+.3f}" for v in r))
    d3 = sum((a - b) ** 2 for a, b in zip(A[2], B[0])) ** .5
    print(f"seam at slot 3: dE_ok = {d3*100:.2f}")


if __name__ == "__main__":
    main()
