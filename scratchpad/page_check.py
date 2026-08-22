"""Offline replica of projects/tempformer/index.html's arithmetic.

There is no node on this box, so the page's ensemble, least-squares fit and sliding-window run
are re-implemented here in plain Python and measured directly. Everything mirrors the page line
for line: rnd32 (mulberry32), gauss, makePath, noisify, buildEns, fitMachine, runSeq, dE.

    python3 scratchpad/page_check.py            # the shipped default, and the sigma/alpha tables
    python3 scratchpad/page_check.py --scan      # candidate display seeds

Nothing here ships. It is the tool CLAUDE.md points at for re-measuring the page's numbers.
"""
import math, argparse
from seed_scan import (rnd32, gauss, make_path, noisify, ok_rgb, clipped, path_sweep,
                       SEQ, DRAW, OFF, M32)

ENS_PATHS, ENS_SEED = 320, 20220711

def dE(p, q):
    return math.hypot(p[0]-q[0], p[1]-q[1], p[2]-q[2])*100

def build_ens(sig):
    r = rnd32(ENS_SEED); rows = []
    for _ in range(ENS_PATHS):
        p = make_path(r); x = noisify(p, sig, r)
        for ch in range(3):
            rows.append(([q[ch] for q in p], [q[ch] for q in x]))
    return rows

def dot5(w, v):
    return w[0]*v[0]+w[1]*v[1]+w[2]*v[2]+w[3]*v[3]+w[4]*v[4]

def solve_lin(M, r):
    n = len(r); A = [row[:] + [r[i]] for i, row in enumerate(M)]
    for c in range(n):
        p = max(range(c, n), key=lambda i: abs(A[i][c]))
        A[c], A[p] = A[p], A[c]
        for i in range(c+1, n):
            f = A[i][c]/A[c][c]
            for j in range(c, n+1):
                A[i][j] -= f*A[c][j]
    x = [0.0]*n
    for i in range(n-1, -1, -1):
        s = A[i][n]
        for j in range(i+1, n):
            s -= A[i][j]*x[j]
        x[i] = s/A[i][i]
    return x

def fit_machine(rows, alpha, prop, W0=None):
    N = len(rows)
    W = (W0 if prop else None)
    for _ in range(60 if prop else 1):
        A1 = [[0.0]*5 for _ in range(5)]; A2 = [[0.0]*5 for _ in range(5)]
        A12 = [[0.0]*5 for _ in range(5)]
        cA = [[0.0]*5 for _ in range(3)]; cB = [[0.0]*5 for _ in range(3)]
        for c, x in rows:
            b1 = [x[2], x[3], x[4], x[5], x[6]]
            b2 = [x[4], x[5], x[6], x[7], x[8]]
            if prop and W:
                b1[0] = dot5(W[1], [x[0], x[1], x[2], x[3], x[4]])
                b2[0] = dot5(W[1], b1)
            for p in range(5):
                for q in range(5):
                    A1[p][q] += b1[p]*b1[q]; A2[p][q] += b2[p]*b2[q]; A12[p][q] += b1[p]*b2[q]
                for i in range(3):
                    cA[i][p] += b1[p]*c[3+i]; cB[i][p] += b2[p]*c[5+i]
        for p in range(5):
            for q in range(5):
                A1[p][q] /= N; A2[p][q] /= N; A12[p][q] /= N
            for i in range(3):
                cA[i][p] /= N; cB[i][p] /= N
        M = [[0.0]*18 for _ in range(18)]; r = [0.0]*18
        for i in range(3):
            s0 = 5*i
            for p in range(5):
                for q in range(5):
                    M[s0+p][s0+q] += (A1[p][q]+A2[p][q])/3
                r[s0+p] += (cA[i][p]+cB[i][p])/3
                M[s0+p][15+i] = 1; M[15+i][s0+p] = 1
            r[15+i] = 1
        o1, o2 = 10, 0
        for p in range(5):
            for q in range(5):
                M[o1+p][o1+q] += 2*alpha*A1[p][q]
                M[o2+p][o2+q] += 2*alpha*A2[p][q]
                M[o1+p][o2+q] -= 2*alpha*A12[p][q]
                M[o2+p][o1+q] -= 2*alpha*A12[q][p]
        w = solve_lin(M, r)
        P = [w[5*i:5*i+5] for i in range(3)]
        moved = max(abs(P[i][j]-W[i][j]) for i in range(3) for j in range(5)) if W else 1
        W = P
        if not prop or moved < 1e-9:
            break
    return W

def run_seq(noisy, W, prop):
    A = [[0.0]*3 for _ in range(3)]; B = [[0.0]*3 for _ in range(3)]
    for k in range(3):
        x = [q[k] for q in noisy]
        b1 = [x[2], x[3], x[4], x[5], x[6]]
        if prop:
            b1[0] = dot5(W[1], [x[0], x[1], x[2], x[3], x[4]])
        for i in range(3):
            A[i][k] = dot5(W[i], b1)
        b2 = [x[4], x[5], x[6], x[7], x[8]]
        if prop:
            b2[0] = A[1][k]
        for i in range(3):
            B[i][k] = dot5(W[i], b2)
    return {'A': A, 'B': B, 'out': [A[0], A[1], B[0], B[1], B[2]], 'ov1': A[2], 'ov2': B[0]}

def readouts(seed, sig, alpha=0.0, prop=False, rows=None, W=None):
    """What the page's two stat tiles show for this sequence."""
    rows = rows if rows is not None else build_ens(sig)
    W = W if W is not None else fit_machine(rows, alpha, prop)
    r = rnd32(seed); path = make_path(r); noisy = noisify(path, sig, r)
    res = run_seq(noisy, W, prop)
    seam = dE(res['ov1'], res['ov2'])
    err = sum(dE(c, path[i+OFF+1]) for i, c in enumerate(res['out']))/5
    inp = sum(dE(noisy[i+OFF+1], path[i+OFF+1]) for i in range(5))/5
    return seam, err, inp, path, noisy

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--scan', action='store_true')
    ap.add_argument('--sig', type=float, default=.080)
    ap.add_argument('--seed', type=int, default=5)
    ap.add_argument('--nmax', type=int, default=120000)
    a = ap.parse_args()

    rows = build_ens(a.sig); W = fit_machine(rows, 0.0, False)
    if a.scan:
        # the seam this sequence would show, against the ensemble's own spread
        seams = []
        for s in range(4000):
            se, _, _, _, _ = readouts(s, a.sig, rows=rows, W=W)
            seams.append(se)
        seams.sort()
        med = seams[len(seams)//2]; lo = seams[len(seams)//10]; hi = seams[9*len(seams)//10]
        print(f'sigma {a.sig}: displayed seam over 4000 seeds  p10 {lo:.2f}  median {med:.2f}  p90 {hi:.2f}')
        print('seed      sweep  clip adjmin  seam   err   in    colours')
        cand = []
        for s in range(a.nmax):
            r = rnd32(s); p = make_path(r); n = noisify(p, a.sig, r)
            sw, _ = path_sweep(p)
            if not (165 <= sw <= 200):
                continue
            clip = sum(clipped(*q) for q in n[OFF:OFF+DRAW])
            if clip:
                continue
            cols = [ok_rgb(*q) for q in n[OFF:OFF+DRAW]]
            adj = min(math.dist(cols[i], cols[i+1]) for i in range(DRAW-1))
            res = run_seq(n, W, False)
            seam = dE(res['ov1'], res['ov2'])
            if not (0.8*med <= seam <= 1.3*hi):
                continue
            cand.append((adj, sw, clip, seam, s, cols))
        cand.sort(reverse=True)
        for adj, sw, clip, seam, s, cols in cand[:20]:
            se, er, inp, _, _ = readouts(s, a.sig, rows=rows, W=W)
            print(f'{s:<9d} {sw:6.1f} {clip:3d} {adj:6.1f} {seam:5.2f} {er:5.2f} {inp:5.2f}  '
                  + ' '.join('%02x%02x%02x' % c for c in cols))
        return

    se, er, inp, path, noisy = readouts(a.seed, a.sig, rows=rows, W=W)
    print(f'seed {a.seed}  sigma {a.sig}:  seam {se:.2f}  err {er:.2f}  noisy input {inp:.2f}')
    print('table  ' + '  '.join('[' + ' '.join(f'{v:+.2f}' for v in row) + ']' for row in W))

if __name__ == '__main__':
    main()
