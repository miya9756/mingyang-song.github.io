"""Ensemble-level numbers for CLAUDE.md: mean over the 320 fitting paths, three OKLab channels
combined as dE. Same ensemble the table is fitted on, so there is no second sample to explain."""
import math
from page_check import *
from seed_scan import rnd32, make_path, noisify, OFF

def ens_paths(sig):
    r = rnd32(ENS_SEED); out=[]
    for _ in range(ENS_PATHS):
        p = make_path(r); x = noisify(p, sig, r); out.append((p,x))
    return out

def stats(sig, alpha, prop, rows, W0=None):
    W = fit_machine(rows, alpha, prop, W0)
    seam=err=inp=0.0
    for p,x in ens_paths(sig):
        res = run_seq(x, W, prop)
        seam += dE(res['ov1'],res['ov2'])
        err  += sum(dE(c,p[i+OFF+1]) for i,c in enumerate(res['out']))/5
        inp  += sum(dE(x[i+OFF+1],p[i+OFF+1]) for i in range(5))/5
    return seam/ENS_PATHS, err/ENS_PATHS, inp/ENS_PATHS, W
