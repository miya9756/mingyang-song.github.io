---
name: verify-site
description: Run the static checks for this site — tag nesting, CSS brace balance, JS-to-DOM id integrity, asset existence, root-absolute paths — and optionally serve it and GET every page and asset. Use after ANY edit to index.html, projects/smv/index.html, the viewer's JS modules, or anything under assets/, and before reporting a change as done.
---

# Verify the site

There is no build step and no test suite here, so nothing catches a broken edit except
this. Run it after every change to a page, a viewer module, or `assets/`.

```bash
python3 .claude/skills/verify-site/verify.py            # static only, instant
python3 .claude/skills/verify-site/verify.py --serve    # + serve and GET everything
```

Exit 0 = clear, 1 = at least one `FAIL`. Use `--serve` before saying a change is done;
static-only is fine for a quick loop while iterating.

## What it catches, and why each one is here

| Check | The bug it caught |
| --- | --- |
| **Tag nesting** | Converting the built-with card from `<div>` to `<p>` left the old `</div>` behind. Reports which open tag a bad close actually hit, with both line numbers. |
| **CSS braces** | A dropped `}` in the single inline `<style>` block silently kills every rule after it. |
| **CSS comments** | A rationale comment was extended by appending a paragraph *after* its `*/`. CSS parsed the leftover prose plus the following selector as one invalid rule and **dropped that rule entirely** — the SpDef movement pad lost its `display:none`, so it was permanently on screen and its toggle looked dead. Braces stay balanced through this, so the check above cannot see it. |
| **JS → DOM ids** | Removing the *Native camera res* control left `getElementById('nativeResChk')` behind. That **throws on load and blanks the viewer** — the worst failure mode in this repo, and invisible until you open a browser. Covers `getElementById`, `_ctl`, `_gate`, `querySelector('#…')`. |
| **Page chrome** | The landing page read warm in Chrome and pure white in Safari. The page CSS was identical — what differed was everything *around* it. Requires `color-scheme`, a `<meta name="theme-color">`, and a `background` on an `html` rule; warns when a theme-color hex appears nowhere in the CSS (drifted from `--bg`). See the *Page chrome* section of [site-design](../site-design/SKILL.md). |
| **Asset existence** | `assets/*.png` added but never committed → card renders empty in production. Resolves refs relative to the referencing file. |
| **Root-absolute paths** | This repo deploys as a **project site** (`…github.io/mingyang-song.github.io/`), so `src="/assets/x.png"` 404s in production while working locally. Always use relative paths. |

The JS modules (`decode.js`, `decode_motion.js`, `dequant_worker.js`, `sw.js`) are scanned
for asset refs too — the ~31 MB `vendor/` wasm is reached from `decode_motion.js`, not from
any page, so a page-only sweep would miss it.

`--serve` picks a free port, waits for the server, GETs every page plus every asset any of
them reference, and always tears the server down. Do not hand-roll
`python3 -m http.server` for this — a stray background server is easy to leave running.

## Adding a page or module

Append to `PAGES` or `MODULES` at the top of `verify.py`. Nothing else needs touching.

## When it goes red

Every check has been verified to fail on a real injected defect, so a `FAIL` is a real
finding — fix the page, don't loosen the check. The one known-soft spot: the nesting parser
assumes explicit closing tags. HTML's implicit closes (`<p>` auto-closed by a following
block, bare `<li>`) would be reported as errors. Every page here closes tags explicitly;
keep it that way rather than relaxing the parser.
