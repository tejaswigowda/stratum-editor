// ── eval/scorer.js — the honest ruler ──────────────────────────────────────────
// "resolved-correct-element" is the critical axis, same lesson as Strata catching
// its chessboard false-positive: a produced selector that changes the WRONG nodes,
// or MORE nodes than intended, must score as FAIL — never soften this to "ran
// clean". This file is deliberately simple enough to read in one sitting and
// self-test (see runScorerSelfTest below) BEFORE trusting any matrix numbers.

import { selectorEngine } from 'https://cdn.jsdelivr.net/gh/tejaswigowda/svg-dom@bd16741b851768cf0446e9153010322b9f8ec58b/src/index.js';

/** Set-equality by node identity — order-independent, no false positives from adjacency/co-location. */
function sameElementSet( a, b ) {

	if ( a.length !== b.length ) return false;
	const setB = new Set( b );
	return a.every( n => setB.has( n ) );

}

/**
 * Resolved-correct-element: does the PRODUCED selector match EXACTLY the same
 * element set as the EXPECTED (ground-truth) selector, on the SAME live root?
 * Changing the wrong nodes, or all nodes, or a superset — FAIL, not "close enough".
 */
export function scoreSelectorResolution( root, producedSelector, expectedSelector ) {

	if ( ! producedSelector ) return false;
	let produced, expected;
	try { produced = selectorEngine.query( root, producedSelector ); } catch { return false; }
	try { expected = selectorEngine.query( root, expectedSelector ); } catch { return false; }
	if ( expected.length === 0 ) return false; // a broken fixture, not a pass
	return sameElementSet( produced, expected );

}

export function scoreOpSelection( producedOp, expectedOp ) {

	return producedOp === expectedOp;

}

/** Loose numeric tolerance for extracted args (colors exact, numbers within 1e-6). */
export function scoreArgExtraction( producedArgs, expectedArgs ) {

	if ( ! producedArgs || ! expectedArgs ) return producedArgs === expectedArgs;
	const keys = Object.keys( expectedArgs );
	if ( keys.length === 0 ) return true; // ops with no args (remove/clone/group/ungroup)
	return keys.every( k => {

		const p = producedArgs[ k ], e = expectedArgs[ k ];
		if ( typeof e === 'number' ) return typeof p === 'number' && Math.abs( p - e ) < 1e-6;
		if ( typeof e === 'string' && /^#[0-9a-f]{3,6}$/i.test( e ) ) return normalizeColor( p ) === normalizeColor( e );
		return p === e;

	} );

}

function normalizeColor( c ) { return typeof c === 'string' ? c.toLowerCase() : c; }

/** Score one edit fixture's produced op-JSON on all three decomposed axes. */
export function scoreEditFixture( root, produced, expected ) {

	if ( ! produced ) return { opSelection: false, selectorResolution: false, argExtraction: false, all: false };

	const opSelection = scoreOpSelection( produced.op, expected.op );
	const selectorResolution = scoreSelectorResolution( root, produced.selector, expected.selector );
	const argExtraction = scoreArgExtraction( produced.args, expected.args );

	return { opSelection, selectorResolution, argExtraction, all: opSelection && selectorResolution && argExtraction };

}

/**
 * Multi-op: did the request split into the correct N ops, each matching an
 * expected op (by op-type + resolved-correct-element), order-independent? A
 * MISSED split (fewer ops than expected) must score FAIL, not partial credit.
 */
export function scoreMultiOp( root, producedList, expectedList ) {

	if ( ! Array.isArray( producedList ) || producedList.length !== expectedList.length ) {

		return { pass: false, matched: 0, expected: expectedList.length };

	}

	const remaining = expectedList.slice();
	let matched = 0;
	for ( const p of producedList ) {

		const idx = remaining.findIndex( e => scoreOpSelection( p.op, e.op ) && scoreSelectorResolution( root, p.selector, e.selector ) );
		if ( idx >= 0 ) { matched ++; remaining.splice( idx, 1 ); }

	}

	return { pass: matched === expectedList.length, matched, expected: expectedList.length };

}

/** Labeling: loose keyword match against a short accepted-answers list (documented as approximate). */
export function scoreLabel( proposedText, acceptedAnswers ) {

	if ( ! proposedText ) return false;
	const lower = proposedText.toLowerCase();
	return acceptedAnswers.some( a => lower.includes( a.toLowerCase() ) );

}

/** Generation: valid + (optional) expected tag present + fill hue in the requested band. Loose, honest. */
export function scoreGeneration( markup, { expectedTag, hueRange } ) {

	if ( ! markup ) return { valid: false, tagPresent: false, colorPlausible: false, pass: false };
	const doc = new DOMParser().parseFromString( `<svg xmlns="http://www.w3.org/2000/svg">${ markup }</svg>`, 'image/svg+xml' );
	const valid = ! doc.querySelector( 'parsererror' );
	if ( ! valid ) return { valid: false, tagPresent: false, colorPlausible: false, pass: false };

	const els = [ ...doc.documentElement.querySelectorAll( '*' ) ];
	const tagPresent = ! expectedTag || els.some( e => e.tagName.toLowerCase() === expectedTag );

	let colorPlausible = true;
	if ( hueRange ) {

		const fills = els.map( e => e.getAttribute( 'fill' ) ).filter( Boolean );
		colorPlausible = fills.some( f => hueInRange( cssHue( f ), hueRange ) );

	}

	return { valid, tagPresent, colorPlausible, pass: valid && tagPresent && colorPlausible };

}

let _swatch = null;
function cssHue( cssColor ) {

	if ( ! _swatch ) _swatch = document.createElement( 'canvas' ).getContext( '2d' );
	_swatch.fillStyle = '#000';
	_swatch.fillStyle = cssColor;
	const m = /^#([0-9a-f]{6})$/i.exec( _swatch.fillStyle );
	if ( ! m ) return null;
	const r = parseInt( m[ 1 ].slice( 0, 2 ), 16 ) / 255, g = parseInt( m[ 1 ].slice( 2, 4 ), 16 ) / 255, b = parseInt( m[ 1 ].slice( 4, 6 ), 16 ) / 255;
	const max = Math.max( r, g, b ), min = Math.min( r, g, b ), d = max - min;
	if ( d === 0 ) return 0;
	let h;
	if ( max === r ) h = ( ( g - b ) / d ) % 6; else if ( max === g ) h = ( b - r ) / d + 2; else h = ( r - g ) / d + 4;
	h *= 60;
	return h < 0 ? h + 360 : h;

}

function hueInRange( hue, [ lo, hi ] ) {

	if ( hue == null ) return false;
	if ( lo <= hi ) return hue >= lo && hue <= hi;
	return hue >= lo || hue <= hi; // wraps through 0 (e.g. red: [340,20])

}

// ── Scorer self-test — run BEFORE trusting any matrix numbers ─────────────────
// Confirms the honest-ruler property: a produced selector that changes the WRONG
// or ALL nodes must be flagged FAIL, not a soft pass. This is a check on the
// SCORER, not on any model — no model calls happen here.
export function runScorerSelfTest( root ) {

	const cases = [];

	cases.push( { name: 'exact-match-passes', pass: scoreSelectorResolution( root, '.wheel', '.wheel' ) === true } );
	cases.push( { name: 'wrong-subset-fails', pass: scoreSelectorResolution( root, '.rim', '.wheel' ) === false } );
	// "changed everything" instead of a specific class — the exact false-positive
	// class the Strata handover doc calls out by name.
	cases.push( { name: 'changed-everything-fails', pass: scoreSelectorResolution( root, '*', '.wheel' ) === false } );
	cases.push( { name: 'disjoint-classes-are-disjoint', pass: sameElementSet(
		selectorEngine.query( root, '.wheel' ), selectorEngine.query( root, '.rim' )
	) === false } );
	cases.push( { name: 'op-mismatch-fails', pass: scoreOpSelection( 'move', 'recolor' ) === false } );

	const missedSplit = scoreMultiOp( root, [ { op: 'recolor', selector: '.wheel' } ], [
		{ op: 'recolor', selector: '.wheel' }, { op: 'recolor', selector: '.roof' },
	] );
	cases.push( { name: 'missed-multi-op-split-fails', pass: missedSplit.pass === false } );

	// A superset produced selector ('*' style over-match) for arg-bearing ops must
	// also fail even when args happen to match — selector axis is independent.
	const overMatch = scoreEditFixture( root, { op: 'recolor', selector: '*', args: { color: '#111111' } },
		{ op: 'recolor', selector: '.wheel', args: { color: '#111111' } } );
	cases.push( { name: 'overmatch-selector-fails-even-with-right-op-and-args', pass: overMatch.all === false } );

	const passed = cases.filter( c => c.pass ).length;
	return { passed, total: cases.length, cases };

}
