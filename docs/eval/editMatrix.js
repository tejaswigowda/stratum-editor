// ── eval/editMatrix.js — the eval matrix runner (Strata's shape, run for 2D) ──
//
// await runEditMatrix({ mode: 'host-resolved' })   // no model needed for the deterministic core
// await runEditMatrix({ mode: 'bare', chat })       // raw-model baseline, needs a loaded chat fn
//
// Mirrors STRATA_EVAL_MATRIX_HANDOVER.md's shape: per-task pass rates, a
// resolved-correct-element scorer, snapshot/restore non-destructiveness, and an
// explicit self-test gate that must pass BEFORE any numbers are trusted.

import { createS } from 'https://cdn.jsdelivr.net/gh/tejaswigowda/svg-dom@bd16741b851768cf0446e9153010322b9f8ec58b/src/index.js';
import { DEMO_SVG } from './fixtureScene.js';
import { editFixtures, multiOpFixtures, labelFixtures, generationFixtures } from './fixtures.js';
import { scoreEditFixture, scoreMultiOp, scoreLabel, scoreGeneration, runScorerSelfTest } from './scorer.js';
import { decomposeAndExecute, decomposeMultiOp } from '../ai/nlEditing.js';
import { generateAndInsert } from '../ai/generate.js';

// A hidden-but-rendered container: getBBox() (used by rotate's default pivot)
// only returns real geometry for elements attached to a rendered document.
function hiddenContainer() {

	let el = document.getElementById( '__stratum_eval_sandbox__' );
	if ( ! el ) {

		el = document.createElement( 'div' );
		el.id = '__stratum_eval_sandbox__';
		el.style.cssText = 'position:fixed; left:-9999px; top:0; width:480px; height:360px;';
		document.body.appendChild( el );

	}
	return el;

}

/** Fresh, isolated scene per fixture — non-destructive by construction (new parse, not shared mutable state). */
function freshScene() {

	const container = hiddenContainer();
	container.innerHTML = '';
	const doc = new DOMParser().parseFromString( DEMO_SVG, 'image/svg+xml' );
	const svg = doc.documentElement;
	container.appendChild( svg );
	return createS( svg );

}

async function runEditTasks( mode, chat ) {

	const rows = { opSelection: 0, selectorResolution: 0, argExtraction: 0, all: 0 };
	let denom = 0;
	const details = [];

	for ( const fixture of editFixtures ) {

		if ( fixture.ambiguous ) { details.push( { id: fixture.id, note: 'ambiguous — no host ground truth, excluded from pass rate' } ); continue; }

		const $S = freshScene();
		const r = await decomposeAndExecute( $S, fixture.text, chat, { bare: mode === 'bare' } );
		// Score selector-resolution against a SEPARATE, unmutated scene — a destructive
		// op (remove) executed on $S.root would otherwise make the ground-truth selector
		// match nothing post-execution, a false negative unrelated to resolution quality.
		const pristine = freshScene();
		const score = scoreEditFixture( pristine.root, r.op, fixture.expected );

		denom ++;
		if ( score.opSelection ) rows.opSelection ++;
		if ( score.selectorResolution ) rows.selectorResolution ++;
		if ( score.argExtraction ) rows.argExtraction ++;
		if ( score.all ) rows.all ++;
		details.push( { id: fixture.id, source: r.source, produced: r.op, score } );

	}

	const pct = ( n ) => denom ? Math.round( ( n / denom ) * 100 ) : null;
	return {
		denom,
		pass: { opSelection: pct( rows.opSelection ), selectorResolution: pct( rows.selectorResolution ), argExtraction: pct( rows.argExtraction ), overall: pct( rows.all ) },
		details,
	};

}

async function runMultiOpTask( mode, chat ) {

	let passed = 0;
	const details = [];
	for ( const fixture of multiOpFixtures ) {

		const $S = freshScene();
		const r = await decomposeMultiOp( $S, fixture.text, chat, { bare: mode === 'bare' } );
		const pristine = freshScene(); // score against unmutated scene — see note in runEditTasks
		const score = scoreMultiOp( pristine.root, r.ops, fixture.expected );
		if ( score.pass ) passed ++;
		details.push( { id: fixture.id, source: r.source, produced: r.ops, score } );

	}
	return { denom: multiOpFixtures.length, pass: multiOpFixtures.length ? Math.round( ( passed / multiOpFixtures.length ) * 100 ) : null, details };

}

async function runLabelTask( chat ) {

	if ( ! chat ) return { denom: labelFixtures.length, pass: 0, details: labelFixtures.map( f => ( { id: f.id, note: 'no model loaded' } ) ) };

	let passed = 0;
	const details = [];
	for ( const fixture of labelFixtures ) {

		const $S = freshScene();
		const el = $S.root.querySelector( fixture.elementSelector );
		const descriptors = $S.suggestLabel( el );
		const prompt = [
			{ role: 'system', content: 'Given these visual descriptors of an unlabeled 2D shape, propose ONE short label word for it. Respond with only the word.' },
			{ role: 'user', content: descriptors.join( ', ' ) },
		];
		let proposed = '';
		try { proposed = await chat( prompt ); } catch { /* leave empty — scored as fail below */ }
		const pass = scoreLabel( proposed, fixture.acceptedAnswers );
		if ( pass ) passed ++;
		details.push( { id: fixture.id, descriptors, proposed, pass } );

	}
	return { denom: labelFixtures.length, pass: Math.round( ( passed / labelFixtures.length ) * 100 ), details };

}

async function runGenerationTask( chat ) {

	if ( ! chat ) return { denom: generationFixtures.length, pass: 0, details: generationFixtures.map( f => ( { id: f.id, note: 'no model loaded' } ) ) };

	let passed = 0;
	const details = [];
	for ( const fixture of generationFixtures ) {

		const $S = freshScene();
		const r = await generateAndInsert( $S, fixture.text, chat );
		const score = r.success ? scoreGeneration( r.markup, fixture ) : { pass: false };
		if ( score.pass ) passed ++;
		details.push( { id: fixture.id, markup: r.markup, score } );

	}
	return { denom: generationFixtures.length, pass: Math.round( ( passed / generationFixtures.length ) * 100 ), details };

}

/**
 * Run the full matrix for one scaffolding condition.
 * @param {{mode?:'host-resolved'|'bare', chat?:function|null}} opts
 */
export async function runEditMatrix( { mode = 'host-resolved', chat = null } = {} ) {

	const selfTest = runScorerSelfTest( freshScene().root );
	if ( selfTest.passed !== selfTest.total ) {

		return { gate: 'FAILED', selfTest, message: 'Scorer self-test failed — fix the ruler before trusting any numbers.' };

	}

	const [ edit, multiOp, label, generation ] = await Promise.all( [
		runEditTasks( mode, chat ), runMultiOpTask( mode, chat ), runLabelTask( chat ), runGenerationTask( chat ),
	] );

	return {
		gate: 'passed', mode, modelLoaded: !! chat, selfTest,
		table: {
			'op-selection': edit.pass.opSelection,
			'selector-resolution': edit.pass.selectorResolution,
			'arg-extraction': edit.pass.argExtraction,
			'multi-op': multiOp.pass,
			'labeling': label.pass,
			'generation': generation.pass,
		},
		details: { edit, multiOp, label, generation },
	};

}
