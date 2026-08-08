# Grain statistics analyzer — implementation spec

Handoff notes for building an analyzer that measures film-grain parameters from a dataset.
The output is intended to load directly into `grain-parameter-bench.html`, which synthesises grain
from these same parameters and renders it live.

**Context.** Personal project, revisiting earlier work on film grain synthesis
(<https://miya9756.github.io/mingyang-song.github.io/>). The synthesis side already exists; this
spec covers the *analysis* side — turning grainy samples into the three parameter tables.

---

## 1. The generative model

The analyzer must estimate parameters for exactly this model:

```
n_c = k_c * ( sigma_c(I_c) · w_c )
noisy = clip(I + n)
```

| symbol | meaning |
|---|---|
| `I_c` | clean intensity, channel `c ∈ {R,G,B}`, in `[0,1]` |
| `w` | white Gaussian noise, unit variance per channel, **correlated across channels** by `w = L·e` where `e` is i.i.d. N(0,1) and `L Lᵀ = R` |
| `sigma_c(·)` | per-channel noise std as a function of clean intensity — 17-knot LUT at `i/16` |
| `k_c` | per-channel spatial kernel, 9×9, symmetric, normalised so `Σ k_c² = 1` |
| `R` | 3×3 correlation matrix of `w` (unit diagonal) |

**Ordering matters.** Scaling happens *before* convolution. This is the published model and the
analyzer should assume it. (Filtering first and scaling second is the alternative; it keeps variance
transitions sharper at edges but is a different model. Do not silently switch.)

`Σ k² = 1` is what makes the model identifiable: it guarantees that the marginal std of `n_c` in a
locally-flat region equals `sigma_c(I_c)` exactly, so the two parameter sets don't trade off against
each other.

---

## 2. What to estimate

Three tables. Each has a subtlety that will produce a wrong answer if ignored.

### 2.1 `sigma_c(I)` — intensity-to-variance curve

Noise std as a function of clean intensity, per channel, 17 knots.

**Procedure**

1. Obtain a grain field estimate `n = noisy - clean` (see §3 on where `clean` comes from).
2. Bin pixels by clean intensity `I_c` into the 17 buckets (or finer, then resample).
3. Within each bucket compute the std of `n_c`.
4. Enforce `sigma >= 0`; smooth lightly across buckets.

**Subtlety.** Buckets near `I=0` and `I=1` are contaminated by clipping — `clip(I+n)` truncates the
noise distribution asymmetrically, biasing the measured std downward. Either exclude pixels whose
clean value is within ~2σ of the range limits, or fit a truncated-Gaussian std. Do not just report
the raw bucket std at the extremes.

### 2.2 `rho_c(d)` — spatial correlation

Normalised autocorrelation of the grain field at integer pixel distances `d = 0..8`.
`rho_c(0) = 1` by definition.

**Procedure**

1. Take the grain field, restricted to flat regions (§3.2).
2. Normalise locally by `sigma_c(I_c)` so the field is stationary before measuring autocorrelation —
   otherwise the intensity dependence leaks into the spatial statistics.
3. Compute 2D autocorrelation (FFT-based is fine), then average over all offsets `(dx,dy)` with
   `round(hypot(dx,dy)) == d`.
4. Use the **unbiased** estimator (divide by the number of overlapping samples at each lag, not by N).
   The biased estimator tapers toward zero at large `d` and will systematically narrow the kernels.

**Subtlety.** Any residual image structure inflates `rho` at all lags. Gate hard on flatness.

### 2.3 `R` — channel correlation

3×3 correlation matrix of `w`, i.e. **before** spatial filtering.

**This is the one that is easy to get wrong.** The correlation you measure on the final grain field
is *not* `R`. Because the channels are correlated before filtering and each channel then gets its
own kernel:

```
rho_out(c,d) = R(c,d) · <k_c, k_d>
```

where `<k_c,k_d> = Σ_i k_c[i]·k_d[i]`. Since both kernels are normalised to `Σk²=1`, Cauchy–Schwarz
gives `<k_c,k_d> ≤ 1`, with equality only when the kernels are identical. **Channel correlation is
always attenuated by how much the per-channel kernels disagree.**

So to recover `R` from measurements:

```
R(c,d) = rho_measured(c,d) / <k_c, k_d>
```

which requires the kernels to be estimated first. Order the pipeline accordingly:
`sigma → rho(d) → kernels → R`.

Two failure modes to guard:

- The division can push `|R| > 1`, or push the matrix out of the PSD cone. Clamp and project (§4.2).
  If this happens often, the kernels or the measurement are wrong — log it, don't silently clamp.
- Only ~59% of the `(-1,1)³` cube of pairwise correlations is a valid correlation matrix. Always
  project.

---

## 3. Getting a clean reference

Everything above needs `clean`, and this is the weakest link in the whole pipeline.

### 3.1 Sources, in order of preference

1. **Paired clean/noisy captures** (SIDD-style). Best case — no denoiser bias.
2. **Synthetic ground truth** — apply known parameters to clean images. Essential for the round-trip
   tests in §5, even if the real dataset is unpaired.
3. **Denoised source.** Necessary for film scans. The estimate inherits the denoiser's errors, so
   record which denoiser and settings were used alongside every fitted parameter set.

### 3.2 Flat-patch gating (mandatory)

Residual image structure is the dominant error source and it biases in a known direction: natural
image content has cross-channel correlation around 0.9, so leakage drags the estimate of `R` upward
and inflates `rho(d)`.

- Threshold on local variance of the **denoised** image, not the residual.
- Diagnostic: regress the estimated `rho` against local gradient magnitude. True grain statistics are
  flat in gradient; leakage rises with it. **If `rho` climbs near edges, you are measuring the
  denoiser, not the grain.** Report this regression slope as a quality metric on every fit.

### 3.3 Temporal aggregation

For video, fit **per shot**, not per frame. Per-frame estimates jitter far more than the true
parameters do, and the visible artifact is grain "pumping" — texture visibly changing character
between frames. Aggregate statistics across all frames in a shot before fitting.

Note the grain *realisation* is temporally independent (each frame is a separate patch of emulsion);
it is the *parameters* that are smooth in time. Do not attempt to model temporal correlation of the
noise itself. Exceptions worth detecting: duplicated frames (3:2 pulldown, freezes) give identical
grain, and digital sources have a fixed-pattern component (PRNU) that genuinely is static.

---

## 4. Derived quantities

### 4.1 Kernel from `rho(d)` — spectral factorisation

Given a target autocorrelation profile, produce the 9×9 kernel:

1. Build the 2D autocorrelation `Rk(dx,dy) = rho(hypot(dx,dy))` on a 32×32 grid (linear interpolation
   between integer `d`, zero beyond `d=8`).
2. 2D FFT → power spectrum. **Clip negative values to zero** and record the clipped fraction.
3. Take the elementwise square root (zero-phase — for noise the phase is perceptually irrelevant, so
   the symmetric factorisation is the right choice and is cheaper).
4. Inverse FFT, crop the central 9×9, renormalise so `Σk² = 1`.

**Not every `rho(d)` is realisable.** If the power spectrum goes negative, no real kernel exists. The
clipped fraction is the honest measure of how far the request was from achievable — surface it. Then
recompute the *achieved* `rho` from the cropped kernel's own autocorrelation and report the gap;
9×9 can only reach 4 px, so requests with energy at `d=8` will not be met exactly.

### 4.2 PSD projection and Cholesky

Given estimated pairwise correlations:

1. Form `R`, eigendecompose (Jacobi is fine for 3×3).
2. Clamp eigenvalues to `>= eps`, reconstruct.
3. **Renormalise the diagonal back to unit** — eigenvalue clipping alone leaves a covariance matrix,
   not a correlation matrix. This step is commonly skipped and silently wrong.
4. Cholesky `R = L Lᵀ`. Verify `|L Lᵀ - R| < 1e-9`.

Reference behaviour: input `(0.8, 0.8, -0.8)` has min eigenvalue `-0.6` and must project to
`(0.5, 0.5, -0.5)` with unit diagonal.

---

## 5. Output format

Match this schema exactly — it is what the bench loads.

```json
{
  "sigma":    { "R": [17 floats], "G": [17 floats], "B": [17 floats] },
  "rho":      { "R": [9 floats],  "G": [9 floats],  "B": [9 floats]  },
  "kernel":   { "R": [81 floats], "G": [81 floats], "B": [81 floats] },
  "cholesky": [[3 floats], [3 floats], [3 floats]]
}
```

`sigma` knots are at `I = i/16`, `i = 0..16`. `rho` is at `d = 0..8` with `rho[0] = 1`.
`kernel` is row-major 9×9. `cholesky` is lower-triangular `L`.

Alongside it, emit a diagnostics block: clipped spectrum fraction per channel, PSD projection shift,
gradient-regression slope from §3.2, number of flat pixels used, and which denoiser produced the
reference.

**Parameter budget note.** A symmetric 9×9 kernel has only **15 unique taps** under 8-fold dihedral
symmetry, not 81. Worth exploiting if these ever need to be transmitted.

---

## 6. Acceptance tests

Build these first — they catch most of the failure modes above.

1. **Round trip.** Synthesise a field with known `(sigma, rho, R)`, run the analyzer, recover within
   tolerance. Sweep across parameter values, not just one point.
2. **White-noise degenerate case.** `rho = [1,0,0,...]` must factor to a unit impulse
   (centre tap 1.0, all others 0) and recover `sigma` exactly.
3. **Kernel normalisation.** `Σk² = 1` to 1e-6 for every kernel produced, including pathological
   inputs.
4. **Cholesky identity.** `L Lᵀ = R` to machine precision, unit diagonal, for random valid and
   invalid inputs.
5. **Channel attenuation.** Synthesise with deliberately different per-channel kernels and confirm
   the recovered `R` matches the input `R`, not the (smaller) measured output correlation. This is
   the test that catches the §2.3 mistake.
6. **Leakage detection.** Run on synthetic grain applied to a *structured* image with flat-patch
   gating deliberately disabled; the gradient-regression slope should fire.

---

## 7. Optional: AV1-compatible export

Worth building because it is deployable today with no spec change.

AV1's film grain model (Annex E) is also a second-order stationary Gaussian model — it parameterises
by autoregressive coefficients rather than autocorrelation. The two are related by **Yule–Walker**:
solve the normal equations from the measured `rho(d)` over AV1's causal neighbourhood
(lag `L ∈ {0,1,2,3}`, `2L(L+1)` coefficients, so 24 at `L=3`) to get AR taps.

- `sigma_c(I)` maps onto AV1's scaling LUT more or less directly.
- `R` collapses onto AV1's chroma-from-luma multipliers — lossily; AV1 cannot express full 3×3
  channel covariance.

Quantifying *where* the AR fit fails to reproduce the measured statistics is the interesting result:
it isolates a specific deficiency rather than asserting a general one. Likely candidates are the
channel covariance and kernels whose spectrum an order-3 causal AR cannot match.

---

## 8. Gotchas, collected

- Scale-then-filter, not filter-then-scale.
- Estimate kernels **before** channel correlation; `R` needs `<k_c,k_d>` to be de-attenuated.
- Renormalise the diagonal after PSD projection.
- Unbiased autocorrelation estimator.
- Gate on flatness using the *denoised* image's local variance.
- Exclude clipped intensity ranges when fitting `sigma`.
- Fit per shot, not per frame.
- Measure in the colour space the synthesis will run in.
- Record the denoiser with every parameter set; the fit is only as good as it.
