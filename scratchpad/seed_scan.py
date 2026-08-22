"""Replica of projects/tempformer/index.html's path generator, for picking a default seed.

Mirrors rnd32 (mulberry32), gauss, makePath, noisify and okCss exactly. Used to find which
reroll-chain seed the screenshot shows, and to score seeds on how much hue contrast the seven
drawn bottles carry. Nothing here ships; the page is unchanged by running it.
"""
import math

M32 = 0xFFFFFFFF

def imul(a, b):
    r = ((a & M32) * (b & M32)) & M32
    return r - (1 << 32) if r >= (1 << 31) else r

def rnd32(a):
    st = [a & M32]
    def nxt():
        s = (st[0] + 0x6D2B79F5) & M32
        st[0] = s
        t = imul(s ^ (s >> 15), 1 | s) & M32
        # JS: t = t + Math.imul(t^t>>>7, 61|t) ^ t  -- '+' binds tighter, so the XOR is with OLD t
        t2 = ((t + imul(t ^ (t >> 7), 61 | t)) & M32) ^ t
        return ((t2 ^ (t2 >> 14)) & M32) / 4294967296
    return nxt

def gauss(r):
    u = 0.0; v = 0.0
    while u == 0: u = r()
    while v == 0: v = r()
    return math.sqrt(-2*math.log(u))*math.cos(6.283185307*v)

SEQ, DRAW, OFF = 9, 7, 2
HUE_STEP, HUE_DRIFT, L_STEP, CHROMA = 13, 15, .016, .125

def make_path(r):
    h = r()*360; L = .66 + r()*.12
    out = []; d = -1 if r() < .5 else 1
    for i in range(SEQ):
        if i:
            h += gauss(r)*HUE_STEP + d*HUE_DRIFT
            L = min(.88, max(.52, L + gauss(r)*L_STEP))
        a = h*math.pi/180
        out.append([L, CHROMA*math.cos(a), CHROMA*math.sin(a)])
    return out

def noisify(path, sig, r):
    return [[v + gauss(r)*sig for v in q] for q in path]

def ok_rgb(L, a, b):
    l_ = L+.3963377774*a+.2158037573*b
    m_ = L-.1055613458*a-.0638541728*b
    s_ = L-.0894841775*a-1.2914855480*b
    l, m, s = l_**3, m_**3, s_**3
    lin = [4.0767416621*l-3.3077115913*m+.2309699292*s,
           -1.2684380046*l+2.6097574011*m-.3413193965*s,
           -.0041960863*l-.7034186147*m+1.7076147010*s]
    out = []
    for v in lin:
        v = min(1, max(0, v))
        out.append(round(255*(12.92*v if v <= .0031308 else 1.055*v**(1/2.4)-.055)))
    return tuple(out)

def draw(seed, sig):
    r = rnd32(seed)
    p = make_path(r)
    n = noisify(p, sig, r)
    return p, n, [ok_rgb(*q) for q in n[OFF:OFF+DRAW]]

def chain(n, seed=5):
    """The reroll chain. JS multiplies as DOUBLES, so once seed*1103515245 passes 2^53 the
    product is rounded before ToUint32 sees it -- Python floats are the same doubles, so doing
    it in float here is what keeps the chain identical to the page's."""
    out = [seed]
    for _ in range(n):
        v = float(seed)*1103515245.0 + 12345.0
        seed = (int(v) & M32) >> 8
        out.append(seed)
    return out

def hue_spread(noisy):
    """Circular spread of the drawn bottles' hues, in degrees, plus mean pairwise chroma gap."""
    hs = [math.degrees(math.atan2(q[2], q[1])) % 360 for q in noisy[OFF:OFF+DRAW]]
    best = 0.0
    for i in range(len(hs)):
        for j in range(i+1, len(hs)):
            d = abs(hs[i]-hs[j]) % 360
            best = max(best, min(d, 360-d))
    return best, hs

if __name__ == '__main__':
    tgt = [(233,211,242),(143,184,216),(123,127,224),(244,63,125),(255,122,0),(238,59,48),(154,147,140)]
    print('seed        maxhue  rgbs                                            dist-to-screenshot')
    for s in chain(24):
        p, n, cols = draw(s, .080)
        sp, hs = hue_spread(n)
        d = sum(math.dist(c, t) for c, t in zip(cols, tgt))/DRAW
        print(f'{s:<11d} {sp:6.1f}  {" ".join("%02x%02x%02x"%c for c in cols)}   {d:7.1f}')

# ── candidate search ──────────────────────────────────────────────────────────────────────────
def clipped(L, a, b):
    l_ = L+.3963377774*a+.2158037573*b
    m_ = L-.1055613458*a-.0638541728*b
    s_ = L-.0894841775*a-1.2914855480*b
    l, m, s = l_**3, m_**3, s_**3
    lin = [4.0767416621*l-3.3077115913*m+.2309699292*s,
           -1.2684380046*l+2.6097574011*m-.3413193965*s,
           -.0041960863*l-.7034186147*m+1.7076147010*s]
    return sum(1 for v in lin if v < 0 or v > 1)

def path_sweep(p):
    hs = [math.degrees(math.atan2(q[2], q[1])) % 360 for q in p[OFF:OFF+DRAW]]
    # unwrap: the drift is monotone-ish, so total signed travel is the honest measure
    tot = 0.0; prev = hs[0]
    for h in hs[1:]:
        d = (h - prev + 180) % 360 - 180
        tot += d; prev = h
    return abs(tot), hs

def scan(nmax=300000, sig=.080):
    best = []
    for s in range(nmax):
        p, n, cols = draw(s, sig)
        sw, _ = path_sweep(p)
        clip = sum(clipped(*q) for q in n[OFF:OFF+DRAW])
        adj = min(math.dist(cols[i], cols[i+1]) for i in range(DRAW-1))
        best.append((sw, -clip, adj, s))
    best.sort(reverse=True)
    return best

if False:
    pass
