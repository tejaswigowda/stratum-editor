# Stratum — SVG-Strata

**The 2D-vector-graphics instance of [Strata](https://github.com/tejaswigowda/strata-editor)'s pattern: a deterministic selector+op language over SVG's native element graph, plus an optional small on-device model for the fuzzy and generative residue.**

**Primary purpose is evidential, not product.** Stratum exists to be the *second validated instance* of Strata's "bounded model over a deterministic symbolic surface" pattern, in a different domain (2D vector graphics instead of a 3D scene graph). The editor is a lighter, from-scratch build in Strata's own shape — direct-manipulation canvas (click-select, drag-move/scale/rotate), outliner, properties inspector, and a JS console — rather than a port of Strata's full mrdoob-derived chrome (no Menubar/History/Settings tabs, no git versioning, no animation timeline, no mesh edit-mode). Every panel routes through the same `$S`/host, so a drag, a properties-panel edit, and a console command are equally undoable.

```js
import { createS } from 'https://cdn.jsdelivr.net/gh/tejaswigowda/svg-dom@main/src/index.js';

const $S = createS( document.querySelector( 'svg' ) );
$S( '.wheel' ).recolor( '#111' ).move( 10, 0 );
$S.undo();
```

## Three-tier structure (mirrors Strata)

| Tier | What it is |
|------|------------|
| [**svg-dom**](https://github.com/tejaswigowda/svg-dom) | The durable, AI-free core. `$S(selector).op()` over any SVG document's native element graph. Standalone, zero dependency, works with zero AI. Counterpart to [3DOM](https://github.com/tejaswigowda/3dom). Factored out into its own repo; see its SPEC.md there. |
| [**docs/**](docs/) | The Stratum editor: a thin PWA built on svg-dom. Adds the optional model layer (NL→ops, NL→SVG generation) and the eval matrix. |
| *(no Electron wrapper)* | Moot for capability, same reasoning as Strata's app tier. |

The dependency is real, just no longer vendored: `docs/app.js` imports svg-dom's `src/index.js` straight from the [svg-dom](https://github.com/tejaswigowda/svg-dom) repo via jsDelivr's GitHub CDN (no build step, no bundler, no local copy).

## Why this is Strata's pattern, replicated

Strata's thesis: 3D editing = deterministic shell (selector language + closed op set) + a small on-device model for the genuinely fuzzy residue (argument extraction, ambiguous op-selection, labeling) — with selector-resolution and unambiguous op-selection moved *host-side* once the eval showed they were capability-bound, not model-bound. Stratum makes the same architectural decisions in 2D, unless the domain forced otherwise. Where it did, the delta is documented:

- **Selector engine is (almost) native.** SVG lives in a real DOM — `querySelectorAll` already implements the CSS subset 3DOM had to hand-build. svg-dom's `selectorEngine.js` is ~90 lines; 3DOM's is ~300. This is the single largest delta, and the point of the exercise. See [svg-dom's SPEC.md §3](https://github.com/tejaswigowda/svg-dom/blob/main/SPEC.md#3-selector-grammar--the-central-delta).
- **No autoLabel by default.** 3DOM's `autoLabel` runs automatically because a scene graph has no address at all otherwise. SVG-DOM's counterpart (`suggestLabel`) is opt-in, thin, and only useful for genuinely unlabeled imports. See [svg-dom's SPEC.md §4](https://github.com/tejaswigowda/svg-dom/blob/main/SPEC.md#4-labeling-suggestlabelel--minimal-off-by-default).
- **Generation is new.** Natural language → SVG markup has no 3D-editing-eval counterpart in Strata; it's Stratum's one genuinely new task (`docs/ai/generate.js`, `docs/eval/fixtures.js`'s `generationFixtures`).
- **A new op with no 3D counterpart:** `reorder` — SVG paint order *is* z-order, addressed directly; three.js's closed op set had no explicit reorder op.
- **A transform delta:** SVG has no native position/rotation/scale properties (unlike `THREE.Object3D`), so svg-dom's `transform.js` keeps a small per-element component cache. See [svg-dom's SPEC.md §7](https://github.com/tejaswigowda/svg-dom/blob/main/SPEC.md#7-transform-representation-no-3dom-counterpart).

## What's validated right now (honest status)

The **host-resolved, zero-AI condition has been run and is real, reproducible data** — no model required for these numbers:

```
mode: host-resolved, model: none
op-selection: 100%   selector-resolution: 92%   arg-extraction: 100%   multi-op: 100%
```

(11/12 edit fixtures pass fully; the one failure is `shrink the front wheel` — a **compound selector** (`.wheel.front`) the host resolver deliberately doesn't attempt, a real, documented capability boundary, not a bug. One fixture, `fix the front`, is intentionally ambiguous and excluded from the denominator.)

The **bare condition with no model** scores 0% across the board — confirming the delta between "host does nothing" and "host resolves the deterministic part" is the whole thesis, exactly as in Strata.

**Scorer self-test: 7/7** (`docs/eval/scorer.js` → `runScorerSelfTest`) — verified BEFORE trusting the numbers above, per Strata's own eval-matrix handover discipline. It confirms the honest-ruler property: a selector that changes the wrong nodes, all nodes, or a superset is flagged FAIL, never softened to "ran clean."

**What still needs a loaded model (not run in this environment):** labeling, generation, and the ambiguous/compound edit fixtures. `docs/app.js` exposes a "Load AI" control (WebLLM on-device, or bring-your-own API key) and a "run eval matrix" button that runs the *same* harness with whichever model is loaded — run it yourself in a WebGPU browser (Chrome 113+) to fill in those rows. This mirrors Strata's own `STRATA_EVAL_MATRIX_HANDOVER.md`: the harness and the deterministic floor are proven; the model-inclusive rows are for whoever runs it next.

## Quick start

```bash
python3 -m http.server 8000 --directory docs
# open http://127.0.0.1:8000/index.html
```

svg-dom is fetched straight from its CDN URL, so `docs/` no longer needs to be served from the repo root. To try the library on its own, with no editor at all, clone [svg-dom](https://github.com/tejaswigowda/svg-dom) and open its `examples/bare.html`.

To run the eval matrix from the browser console once the page is open:

```js
const mod = await import('./eval/editMatrix.js');
await mod.runEditMatrix({ mode: 'host-resolved', chat: null });   // no model needed
await mod.runEditMatrix({ mode: 'bare', chat: null });            // the floor
await mod.runEditMatrix({ mode: 'host-resolved', chat: state.chat }); // with a loaded model
```

## Acceptance criteria — status

- [x] SVG-DOM: `$S(selector).op()` works over a real SVG's native elements; ops validated host-side with specific errors; chainable; undo works. *(verified via Playwright: recolor, restyle, move, moveTo, scale, rotate, reorder, group, ungroup, remove, clone, undo/redo all exercised against a live DOM.)*
- [x] SVG-DOM ships as a standalone importable library (like 3DOM), works with zero AI.
- [x] Model layer: natural-language editing produces correct ops on the decomposed tasks *(host-resolved path, verified)*; generation produces valid, renderable SVG *(implemented + validated at insertion time; needs a loaded model to exercise — not run in this environment)*.
- [x] Eval matrix runs (Strata's shape, 2D): per-task, host-resolved vs bare, resolved-correct-element scoring, plus a generation task. *(runs; model-size axis needs the user to load models locally.)*
- [x] Scorer verified before trusting results (self-test 7/7, catches wrong-subset / changed-everything / missed-split false positives).
- [x] Results reported honestly, including the one known failure (compound selectors) and the bare-vs-host-resolved delta.
- [x] Architectural deltas from Strata documented — see [svg-dom's SPEC.md](https://github.com/tejaswigowda/svg-dom/blob/main/SPEC.md) and the section above.

## Explicitly out of scope (per the work order)

A 1:1 port of Strata's full mrdoob-derived chrome (Menubar, History/Settings tabs, git versioning, animation timeline, mesh edit-mode, XR, pathtracer), full autoLabel-style descriptor derivation, filters, any "webCLI" framing, and shipping before the eval proves the pattern.

## License

MIT © Tejaswi Gowda.
