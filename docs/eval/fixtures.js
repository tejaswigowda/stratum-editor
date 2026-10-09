// ── eval/fixtures.js — the eval matrix's fixture set ──────────────────────────
// Mirrors Strata's edit-eval matrix task shape (op-selection, selector-resolution,
// arg-extraction, labeling, multi-op) FOR 2D, plus the one genuinely new task
// (generation). All fixtures run against fixtureScene.js.
//
// Each `edit` fixture carries ONE ground-truth op-JSON; the runner scores THREE
// axes off the SAME produced edit (op-selection, selector-resolution via
// resolved-correct-element, arg-extraction) — same "independent scoring, one
// generated edit" design as Strata's harness.
//
// `ambiguous: true` fixtures have NO single correct op-JSON by design (Strata's
// "fix the front" / "make it pop" class of request). They are excluded from the
// pass-rate denominator and reported separately as "requires model, no host
// ground truth" — do not silently count them as failures OR successes.

export const editFixtures = [
	{ id: 'recolor-wheels', text: 'make the wheels black', expected: { op: 'recolor', selector: '.wheel', args: { color: '#111111' } } },
	{ id: 'recolor-rims', text: 'recolor the rims to gray', expected: { op: 'recolor', selector: '.rim', args: { color: '#6b7280' } } },
	{ id: 'recolor-body', text: 'paint the body green', expected: { op: 'recolor', selector: '.body', args: { color: '#22c55e' } } },
	{ id: 'move-roof', text: 'move the roof up', expected: { op: 'move', selector: '.roof', args: { dx: 0, dy: - 20 } } },
	{ id: 'move-body', text: 'shift the body right', expected: { op: 'move', selector: '.body', args: { dx: 20, dy: 0 } } },
	{ id: 'scale-rims-down', text: 'shrink the rims', expected: { op: 'scale', selector: '.rim', args: { sx: 0.8 } } },
	{ id: 'scale-wheels-up', text: 'enlarge the wheels', expected: { op: 'scale', selector: '.wheel', args: { sx: 1.25 } } },
	{ id: 'rotate-car', text: 'rotate the car 45 degrees', expected: { op: 'rotate', selector: '#car', args: { deg: 45 } } },
	{ id: 'delete-roof', text: 'delete the roof', expected: { op: 'remove', selector: '.roof', args: {} } },
	{ id: 'clone-body', text: 'duplicate the body', expected: { op: 'clone', selector: '.body', args: {} } },
	{ id: 'reorder-roof', text: 'bring the roof to the front', expected: { op: 'reorder', selector: '.roof', args: { direction: 'front' } } },
	// genuinely ambiguous — no deterministic verb, no host ground truth (predicted cliff)
	{ id: 'ambiguous-fix', text: 'fix the front', ambiguous: true },
	// compound selector — HOST resolver only matches single-token classes (documented
	// limitation, SPEC.md); expected to expose the resolver's real capability boundary
	{ id: 'compound-front-wheel', text: 'shrink the front wheel', expected: { op: 'scale', selector: '.wheel.front', args: { sx: 0.8 } }, compound: true },
];

export const multiOpFixtures = [
	{
		id: 'multi-wheels-roof',
		text: 'make the wheels black and the roof red',
		expected: [
			{ op: 'recolor', selector: '.wheel', args: { color: '#111111' } },
			{ op: 'recolor', selector: '.roof', args: { color: '#e11d48' } },
		],
	},
	{
		id: 'multi-delete-clone',
		text: 'delete the roof and duplicate the body',
		expected: [
			{ op: 'remove', selector: '.roof', args: {} },
			{ op: 'clone', selector: '.body', args: {} },
		],
	},
];

// Labeling: pure generation, the one genuinely model-bound task (mirrors Strata).
// `#path1847` is deliberately unlabeled (no class) — the Illustrator-export case.
export const labelFixtures = [
	{ id: 'label-triangle', elementSelector: '#path1847', acceptedAnswers: [ 'triangle', 'flag', 'warning', 'sign', 'pennant', 'caution' ] },
];

// Generation: the NEW task Strata's gates didn't cover. Loose, honestly-scored.
export const generationFixtures = [
	{ id: 'gen-red-circle', text: 'draw a small red circle', expectedTag: 'circle', hueRange: [ 340, 20 ] },
	{ id: 'gen-blue-rect', text: 'draw a small blue rectangle', expectedTag: 'rect', hueRange: [ 200, 260 ] },
	{ id: 'gen-green-star', text: 'draw a small green star', expectedTag: null, hueRange: [ 70, 170 ] },
];
