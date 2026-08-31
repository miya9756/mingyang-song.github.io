#!/usr/bin/env python3
"""
Static checks for this site. Stdlib only — no deps, no network, no build step.

Catches the failure modes this repo actually hits: a stale closing tag left behind by an
edit, an unbalanced <style> block, a getElementById() whose element was deleted (throws on
page load, blanking the viewer), a page that tints itself but not the browser chrome around
it (Safari then renders white where Chrome does not), a referenced asset that was never
committed, and a root-absolute path that breaks the project-site subpath deploy.

    python3 .claude/skills/verify-site/verify.py            # static checks
    python3 .claude/skills/verify-site/verify.py --serve    # + serve and GET everything

Exit code 0 = all clear, 1 = at least one FAIL.
"""
import html.parser
import json
import os
import re
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))
PAGES = ["index.html", "projects/smv/index.html", "projects/spdef/index.html",
         "projects/spdef/viewer.html", "projects/spdef/points.html",
         "projects/spdef/triplanes.html", "projects/spdef/field.html",
         "projects/spdef/knots.html", "projects/spdef/knotsplat.html",
         "projects/grain/index.html", "projects/tempformer/index.html",
         "misc/index.html", "misc/museum/index.html",
         "misc/oilpaint/index.html"]
# JS modules are scanned for asset refs too — the ~31 MB vendor/ wasm is reached from
# decode_motion.js, not from any page, so a page-only sweep would miss it entirely.
MODULES = ["projects/smv/decode.js", "projects/smv/decode_motion.js",
           "projects/smv/dequant_worker.js", "projects/smv/sw.js",
           "projects/spdef/traj.js", "projects/spdef/knot_decode.js",
           # The oil-paint tuner's compute engine: it is a module WORKER, so nothing on the
           # page names its imports and a page-only sweep would miss the whole JS package
           # it pulls in (13 modules) plus the generated schema.json it fetches.
           "misc/oilpaint/engine.worker.js", "misc/oilpaint/session.js"]

VOID = {"br", "img", "input", "meta", "link", "hr", "source", "area", "base",
        "col", "embed", "param", "track", "wbr"}

fails, warns = [], []


def fail(page, msg):
    fails.append(f"{page}: {msg}")


def warn(page, msg):
    warns.append(f"{page}: {msg}")


class Nesting(html.parser.HTMLParser):
    """Flags a close tag that doesn't match the innermost open tag."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.errs = [], []

    def handle_starttag(self, tag, attrs):
        if tag not in VOID:
            self.stack.append((tag, self.getpos()[0]))

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.errs.append(f"stray </{tag}> at line {self.getpos()[0]}")
            return
        if self.stack[-1][0] != tag:
            open_tag, open_line = self.stack[-1]
            self.errs.append(
                f"</{tag}> at line {self.getpos()[0]} closes <{open_tag}> "
                f"opened at line {open_line}")
            for i in range(len(self.stack) - 1, -1, -1):
                if self.stack[i][0] == tag:
                    del self.stack[i:]
                    return
            return
        self.stack.pop()


def check_nesting(page, src):
    p = Nesting()
    p.feed(src)
    for e in p.errs:
        fail(page, e)
    for tag, line in p.stack:
        if tag not in ("html", "body"):
            fail(page, f"<{tag}> opened at line {line} is never closed")
    if not p.errs and not [t for t, _ in p.stack if t not in ("html", "body")]:
        print(f"  ok    tag nesting")


def check_css(page, src):
    blocks = re.findall(r"<style[^>]*>(.*?)</style>", src, re.S)
    if not blocks:
        return
    for i, css in enumerate(blocks):
        o, c = css.count("{"), css.count("}")
        if o != c:
            fail(page, f"<style> block {i}: {o} '{{' vs {c} '}}' — unbalanced")
        else:
            print(f"  ok    css braces ({o} rules)")


def check_css_comments(page, src):
    """A stray '*/' in a <style> block silently eats the rule that follows it.

    The rationale comments in these stylesheets are long and get extended, and appending a
    paragraph to one whose '*/' is already there leaves prose sitting between two rules. CSS
    then parses 'prose... */ #vctrl' as one (invalid) selector and DISCARDS the whole block it
    introduces. That is how the SpDef movement pad shipped with no `display:none`: always on
    screen, and its toggle apparently dead because the class it flips had nothing left to undo.

    Braces stay balanced through all of that, so check_css cannot see it. Comment markers are
    what actually moved: strip every well-formed comment and any marker still standing is one
    someone left behind.
    """
    for i, css in enumerate(re.findall(r"<style[^>]*>(.*?)</style>", src, re.S)):
        pos, open_at, bad = 0, -1, None
        while pos < len(css):
            if open_at < 0:
                nxt = css.find("/*", pos)
                stray = css.find("*/", pos)
                if 0 <= stray < (nxt if nxt >= 0 else len(css)):
                    bad = (stray, "unopened '*/' — the rule after it is being swallowed")
                    break
                if nxt < 0:
                    break
                open_at, pos = nxt, nxt + 2
            else:
                end = css.find("*/", pos)
                if end < 0:
                    bad = (open_at, "unterminated '/*' — everything after it is a comment")
                    break
                open_at, pos = -1, end + 2
        if bad:
            fail(page, f"<style> block {i}, line {css[:bad[0]].count(chr(10)) + 1} of the "
                       f"block: {bad[1]}")
        else:
            print("  ok    css comments")


def check_dom_ids(page, src):
    """Every id the JS reaches for must exist, or the page throws on load."""
    ids = set(re.findall(r'\bid="([A-Za-z][\w-]*)"', src))
    refs = set()
    for pat in (r"getElementById\(\s*['\"]([^'\"]+)['\"]",
                r"_ctl\(\s*['\"]([^'\"]+)['\"]",
                r"_gate\(\s*['\"]([^'\"]+)['\"]",
                r"querySelector\(\s*['\"]#([\w-]+)['\"]",
                # the grain page's `$` is getElementById under a shorter name; without this its
                # ~30 element lookups are invisible here and a deleted element throws on load
                r"\$\(\s*['\"]([A-Za-z][\w-]*)['\"]\s*\)",
                # …and the oil-paint tuner's `$`, which is querySelector under the same short
                # name and so passes a real SELECTOR. Without this its ~50 element lookups are
                # invisible too — and that page's front row is BUILT from a schema, so a control
                # that lost its container is a blank panel rather than a visible gap.
                r"\$\(\s*['\"]#([A-Za-z][\w-]*)['\"]\s*\)",
                # a pane's iframe id, named in the SpDef host's GROUPS config, not passed to _ctl()
                r"frId\s*:\s*['\"]([A-Za-z][\w-]*)['\"]"):
        refs |= set(re.findall(pat, src))
    # …and every id in a GROUPS entry's `ui:{…}`, which that host resolves wholesale
    # (`for(const k in g.ui) g.el[k]=_ctl(g.ui[k])`). Listing the key names here instead would go
    # stale the moment a card gains a control the others do not have.
    for block in re.findall(r"ui\s*:\s*\{(.*?)\}", src, re.S):
        refs |= set(re.findall(r":\s*['\"]([A-Za-z][\w-]*)['\"]", block))
    missing = sorted(refs - ids)
    if missing:
        fail(page, f"JS references ids with no element: {', '.join(missing)}")
    else:
        print(f"  ok    dom ids ({len(refs)} referenced, all present)")


def check_repeated_controls(page, src):
    """Every .viewopts block must expose the data-o controls its kind's host code looks up.

    That block is repeated once per card, so its controls are addressed by data-o rather than by
    id — ids have to stay unique in a document. A typo or a missing control in one copy is
    therefore invisible to the id check above, and would only surface as a TypeError inside an
    event handler once someone clicked that group's toggle.

    Which controls are required depends on what the card renders: a splat comparison and the
    point-trajectory demo share the block's markup and none of its options. `data-kind` on the
    block is what says which list applies, and it is matched against the host's own OPT_KEYS — so
    adding a control to one and not the other is caught here rather than in a browser.
    """
    decl = re.search(r"const OPT_KEYS\s*=\s*\{(.*?)\};", src, re.S)
    blocks = re.findall(r'<div class="viewopts"([^>]*)>(.*?)\n    </div>', src, re.S)
    if not decl or not blocks:
        return
    want = {kind: set(re.findall(r"'([^']+)'", body))
            for kind, body in re.findall(r"(\w+)\s*:\s*\[([^\]]*)\]", decl.group(1), re.S)}
    bad = False
    for attrs, body in blocks:
        bid = (re.search(r'id="([^"]+)"', attrs) or [None, "?"])[1]
        kind = re.search(r'data-kind="(\w+)"', attrs)
        if not kind or kind.group(1) not in want:
            bad = True
            fail(page, f'#{bid} has no data-kind matching an OPT_KEYS entry '
                       f'({", ".join(sorted(want))})')
            continue
        missing = sorted(want[kind.group(1)] - set(re.findall(r'data-o="([^"]+)"', body)))
        if missing:
            bad = True
            fail(page, f'#{bid} ({kind.group(1)}) is missing view controls: {", ".join(missing)}')
    if not bad:
        print(f"  ok    view controls ({len(blocks)} blocks over {len(want)} kinds)")


def check_page_defaults(page, src):
    """A page's own opening settings must be reachable by the controls that show them.

    The oil-paint tuner opens on a chosen look rather than on `PaintConfig`'s defaults, and
    that table (`PAGE_DEFAULTS`) lives in the page while the control ranges live in the
    generated `schema.json` beside it. Nothing else ties the two together, and both failures
    are silent in a browser: a value off its slider's step grid looks correct until the first
    drag SNAPS it, so a touch meant as a no-op changes the picture; and a `choice` naming an
    option the schema no longer has leaves the <select> on its first entry while `params`
    carries the dead name straight to the engine. Re-staging from upstream is exactly when
    both happen, since that is what replaces schema.json.

    Skipped, not failed, on a page with no such table -- this is one page's check.
    """
    m = re.search(r"const PAGE_DEFAULTS\s*=\s*\{(.*?)\};", src, re.S)
    if not m:
        return
    schema_path = os.path.join(ROOT, os.path.dirname(page), "schema.json")
    if not os.path.exists(schema_path):
        fail(page, "PAGE_DEFAULTS but no schema.json beside the page to check it against")
        return
    doc = json.load(open(schema_path, encoding="utf-8"))
    ctl = {c["name"]: c for c in doc.get("schema", [])}
    want = dict(re.findall(r"([A-Za-z_]\w*)\s*:\s*'([^']*)'", m.group(1)))
    nums = {k: float(v) for k, v in
            re.findall(r"([A-Za-z_]\w*)\s*:\s*(-?[\d.]+(?:e-?\d+)?)\s*[,}]", m.group(1))}
    bad = []
    for name, v in want.items():
        c = ctl.get(name)
        if not c:
            bad.append(f"{name}: no such control in schema.json")
        elif c["kind"] != "choice":
            bad.append(f"{name}: {v!r} is a string but the control is {c['kind']}")
        elif v not in c["min"]:
            bad.append(f"{name}: {v!r} is not one of {c['min']}")
    for name, v in nums.items():
        c = ctl.get(name)
        if not c:
            bad.append(f"{name}: no such control in schema.json")
            continue
        if c["kind"] == "choice":
            bad.append(f"{name}: numeric but the control is a choice")
            continue
        lo, hi, step = c["min"], c["max"], c["step"]
        if v < lo or v > hi:
            bad.append(f"{name}: {v:g} is outside the control's {lo}..{hi}")
        elif step and abs(round((v - lo) / step) - (v - lo) / step) > 1e-6:
            bad.append(f"{name}: {v:g} is off the {step:g} step grid from {lo:g}"
                       f" -- the slider would snap it on first drag")
    if bad:
        fail(page, "PAGE_DEFAULTS disagrees with schema.json: " + "; ".join(bad))
    else:
        print(f"  ok    page defaults ({len(want) + len(nums)} settings on-grid)")


def check_page_chrome(page, src):
    """Every page must declare color-scheme, a theme-color, and paint html's background.

    Without these the *page* is tinted but the browser chrome around it is not, and the two
    browsers disagree about the gap: Chrome infers the canvas from the body background,
    Safari leaves it white — canvas, scrollbars, form controls, the iOS toolbars, and the
    overscroll area Safari rubber-bands into. That is invisible on a near-white palette and
    glaring on this site's warm paper. All three are one-liners; a new project page that
    picks its own palette must carry them too.
    """
    style = re.sub(r"/\*.*?\*/", "", "\n".join(
        re.findall(r"<style[^>]*>(.*?)</style>", src, re.S)), flags=re.S)
    if not style:
        return

    if "color-scheme" not in style:
        fail(page, "no `color-scheme` declared — Safari paints the UA canvas white "
                   "regardless of --bg (use `light dark` if themed, `light` if fixed)")

    # `([^{}]*)\{([^{}]*)\}` only ever matches innermost rules, so a rule nested in @media is
    # found and the @media wrapper itself is skipped. Good enough without a real CSS parser.
    html_bg = any(
        "background" in decls
        and "html" in [t for t in re.split(r"[\s,>+~]+", sel.strip()) if t]
        for sel, decls in re.findall(r"([^{}]*)\{([^{}]*)\}", style))
    if not html_bg:
        fail(page, "no `background` on an `html` rule — body's background propagates to the "
                   "canvas but not to Safari's overscroll area")

    metas = re.findall(r"<meta[^>]*name=\"theme-color\"[^>]*>", src)
    if not metas:
        fail(page, "no <meta name=\"theme-color\"> — Safari 15+ tints its tab bar and the iOS "
                   "toolbars from it, and falls back to white without one")
        return

    # Drift guard: the meta is markup and --bg is CSS, so nothing but this keeps them together
    # when a palette is retuned. A WARN, not a FAIL — pointing theme-color at a header or hero
    # colour instead of the page background is a legitimate choice.
    lo = style.lower()
    for m in metas:
        c = re.search(r'content="([^"]+)"', m)
        if c and c.group(1).strip().lower() not in lo:
            warn(page, f'theme-color {c.group(1)} appears nowhere in the CSS — likely drifted '
                       f'from --bg')
    print(f"  ok    page chrome (color-scheme, {len(metas)} theme-color, html background)")


def local_refs(src):
    """Relative asset/module paths referenced by this page.

    HTML comments are stripped first: commented-out markup is not live, and a template
    comment showing `href="…"` would otherwise be reported as a missing file.
    """
    src = re.sub(r"<!--.*?-->", "", src, flags=re.S)
    out = set()
    for pat in (r'(?:src|href|data-src)="([^"]+)"',
                r"url\(\s*['\"]?([^'\")]+)",
                # `../` as well as `./` — the SpDef page imports the decode path from ../smv/
                r"from\s+['\"](\.{1,2}/[^'\"]+)['\"]",
                # dynamic import() — the SpDef panel loads the decode path only when standalone
                r"import\(\s*['\"](\.{1,2}/[^'\"]+)['\"]",
                r"new\s+URL\(\s*['\"](\.{1,2}/[^'\"]+)['\"]",
                r"fetch\(\s*['\"]([^'\"`]+)['\"]",          # scenes.json
                # A panel iframe names its data file in the QUERY STRING
                # (viewer.html?scene=… / points.html?bundle=…), which the generic src/href pattern
                # above drops along with the rest of the query. Without this a renamed scene or
                # bundle folder fails only once someone opens the page. Anchored on the manifest's
                # `.json`, so the `?scene=…` in a prose comment is not mistaken for a path.
                r'[?&](?:scene|bundle)=([\w./-]+\.json)',
                # …and the manifests named in the SpDef host's own config tables (a pane's `url`,
                # and the per-example table the tri-plane card's picker switches between). Those
                # are the only mention of the non-default example's assets anywhere in the page.
                r"url\s*:\s*['\"]([\w./-]+\.json)['\"]",
                # assets named only by a JS constant and fetched through the variable, so no
                # fetch()/src= literal ever mentions them (the grain page's params and sample)
                r"_URL\s*=\s*['\"]([^'\"]+)['\"]",
                r"\.register\(\s*['\"]([^'\"]+)['\"]"):     # sw.js
        out |= set(re.findall(pat, src))
    keep = set()
    for r in out:
        if re.match(r"^(https?:|mailto:|data:|//|#|\?)", r) or not r:
            continue
        keep.add(r.split("#")[0].split("?")[0])
    return keep


def check_assets(page, src):
    base = os.path.dirname(os.path.join(ROOT, page))
    bad = []
    n = 0
    for ref in sorted(local_refs(src)):
        if ref.startswith("/"):
            fail(page, f'root-absolute path "{ref}" breaks the project-site subpath deploy')
            continue
        target = os.path.normpath(os.path.join(base, ref))
        if ref.endswith("/") or os.path.isdir(target):
            probe = os.path.join(target, "index.html")
            if not os.path.exists(probe):
                bad.append(f"{ref} (no index.html)")
            else:
                n += 1
            continue
        if not os.path.exists(target):
            bad.append(ref)
        else:
            n += 1
            # A bundle manifest names its own binary, and nothing in any page mentions that
            # file — the knot panel's meta.json points at knots.bin, and a manifest committed
            # without its payload would fail only in the browser, at load, as a blank canvas.
            if os.path.basename(target) == "meta.json":
                try:
                    blob = (json.load(open(target, encoding="utf-8")) or {}).get("bin")
                except ValueError:
                    blob = None
                    bad.append(f"{ref} (not valid JSON)")
                if blob and not os.path.exists(os.path.join(os.path.dirname(target), blob)):
                    bad.append(f"{ref} -> {blob} (manifest's binary)")
    for b in bad:
        fail(page, f"missing on disk: {b}")
    if not bad:
        print(f"  ok    local refs ({n} resolve on disk)")


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def check_served():
    """Serve the repo and GET every page plus every asset it references."""
    port = free_port()
    srv = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        base = f"http://127.0.0.1:{port}"
        for _ in range(50):
            try:
                urllib.request.urlopen(base + "/", timeout=1).read(1)
                break
            except Exception:
                time.sleep(0.1)
        else:
            fail("serve", "server never came up")
            return

        urls = {"/" + p for p in PAGES}
        urls |= {"/" + os.path.dirname(PAGES[1]) + "/"}
        for page in PAGES + MODULES:
            src = open(os.path.join(ROOT, page), encoding="utf-8").read()
            d = os.path.dirname(page)
            for ref in local_refs(src):
                if ref.startswith("/"):
                    continue
                urls.add("/" + os.path.normpath(os.path.join(d, ref)).replace(os.sep, "/"))

        ok = 0
        for u in sorted(urls):
            try:
                # quote non-ascii so a stray unicode path reports as a FAIL, not a traceback
                code = urllib.request.urlopen(
                    base + urllib.parse.quote(u), timeout=10).status
            except urllib.error.HTTPError as e:
                code = e.code
            except Exception as e:
                fail("serve", f"{u} -> {e}")
                continue
            if code != 200:
                fail("serve", f"{u} -> HTTP {code}")
            else:
                ok += 1
        print(f"  ok    served {ok}/{len(urls)} urls returned 200")
    finally:
        srv.terminate()
        srv.wait(timeout=10)


def main():
    print(f"verify-site  root={ROOT}")
    for page in PAGES:
        path = os.path.join(ROOT, page)
        if not os.path.exists(path):
            fail(page, "page does not exist")
            continue
        src = open(path, encoding="utf-8").read()
        print(f"\n{page}  ({len(src):,} bytes)")
        check_nesting(page, src)
        check_css(page, src)
        check_dom_ids(page, src)
        check_css_comments(page, src)
        check_repeated_controls(page, src)
        check_page_defaults(page, src)
        check_page_chrome(page, src)
        check_assets(page, src)

    for mod in MODULES:
        path = os.path.join(ROOT, mod)
        if not os.path.exists(path):
            fail(mod, "module referenced by the viewer does not exist")
            continue
        print(f"\n{mod}")
        check_assets(mod, open(path, encoding="utf-8").read())

    if "--serve" in sys.argv:
        print("\nserved")
        check_served()

    print()
    for w in warns:
        print(f"WARN  {w}")
    for f in fails:
        print(f"FAIL  {f}")
    if fails:
        print(f"\n{len(fails)} failure(s)")
        return 1
    print("all clear" + (f" ({len(warns)} warning(s))" if warns else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
