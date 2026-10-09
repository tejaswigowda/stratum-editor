// ── ai/nlEditing.js — natural language → ops, decomposed (mirrors Strata) ─────
//
// Strata's eval found: selector-resolution and unambiguous op-selection are
// CAPABILITY-BOUND tasks (they cap out even at frontier models) — so they move
// HOST-SIDE, deterministic, out of the model's job entirely. The model is asked
// ONLY for the genuinely fuzzy residue: ambiguous op-selection and argument
// extraction. This file is that same decomposition, for 2D:
//
//   1. resolveSelector(text, $S)  — HOST, from the request text + the scene's
//      real selectors (listSelectors()), never the model.
//   2. resolveOpType(text)        — HOST for unambiguous verbs (closed verb→op
//      map); falls through to the MODEL only when no verb matches.
//   3. extractArgs(text, op)      — HOST for the common, regexable cases (hex
//      colors, named colors, explicit numbers); MODEL fills what's left.
//
// Every op — host-resolved or model-filled — is validated against OP_SET and
// executed through the same dispatchOp() as the manual panel. The model NEVER
// executes anything directly; it only proposes op-JSON that gets validated.

import { ops as opsModule, selectorEngine } from 'https://cdn.jsdelivr.net/gh/tejaswigowda/svg-dom@bd16741b851768cf0446e9153010322b9f8ec58b/src/index.js';

const VERB_MAP = [
	[ /\b(paint|colou?r|recolou?r)\b/i, 'recolor' ],
	[ /\b(delete|remove)\b/i, 'remove' ],
	[ /\b(duplicate|clone|copy)\b/i, 'clone' ],
	[ /\bungroup\b/i, 'ungroup' ],
	[ /\bgroup\b/i, 'group' ],
	// require an explicit reorder PHRASE, not a bare "front"/"back" — those words are
	// also common selector nouns (".front"/".back") and must stay ambiguous otherwise,
	// exactly the "fix the front" case Strata's README flags as genuinely model-bound.
	// Kept NON-greedy / trailing-only so "bring the roof to the front" doesn't consume
	// "roof" into the matched verb phrase (that swallowed the selector noun — a real
	// bug the eval matrix itself caught; see editMatrix.js run notes).
	[ /\b(to the front|to front|in front|on top)\b/i, 'reorder' ],
	[ /\b(to the back|to back|\bbehind\b|underneath)\b/i, 'reorder' ],
	[ /\b(rotate|spin|turn)\b/i, 'rotate' ],
	[ /\b(scale|resize|bigger|smaller|shrink|grow|enlarge)\b/i, 'scale' ],
	[ /\b(move|shift|slide|nudge)\b/i, 'move' ],
];

const COLOR_WORDS = {
	black: '#111111', white: '#ffffff', red: '#e11d48', green: '#22c55e',
	blue: '#3b82f6', yellow: '#eab308', orange: '#f97316', purple: '#8b5cf6',
	pink: '#ec4899', gray: '#6b7280', grey: '#6b7280',
};

/**
 * HOST: resolve the op verb from text. Returns the op AND the matched phrase
 * span, so callers can strip it before resolving the selector — otherwise a
 * direction word like "front" in "bring the roof to the front" collides with
 * a selector token also named ".front" (a real bug caught by the eval matrix
 * itself: "bring the roof to the front" mis-resolved to selector ".front").
 * Returns null if genuinely ambiguous.
 */
export function resolveOpTypeSpan( text ) {

	for ( const [ re, op ] of VERB_MAP ) {

		const m = re.exec( text );
		if ( m ) return { op, match: m[ 0 ] };

	}

	// "make it/the X black/red/#111" has no dedicated verb but unambiguously implies
	// recolor once a color is mentioned — the closed-mapping fallback, same idea as
	// Strata's "paint/make it red is always recolor, never a fuzzy call".
	const hex = text.match( /#[0-9a-f]{3,6}/i );
	if ( hex ) return { op: 'recolor', match: hex[ 0 ] };
	const lower = text.toLowerCase();
	for ( const word of Object.keys( COLOR_WORDS ) ) if ( lower.includes( word ) ) return { op: 'recolor', match: word };

	return null;

}

/** HOST: resolve the op verb from text. Returns null if genuinely ambiguous. */
export function resolveOpType( text ) {

	const r = resolveOpTypeSpan( text );
	return r ? r.op : null;

}

/**
 * HOST: resolve a selector from request text against the scene's REAL selectors.
 * Matches plural/singular class names and ids that appear as words in the text.
 * Never invents a selector that doesn't exist in the scene. Prefers the
 * LONGEST matching token (more specific wins over a shorter, more generic one).
 */
export function resolveSelector( text, $S ) {

	const words = text.toLowerCase().match( /[a-z0-9-]+/g ) || [];
	const known = $S.listSelectors(); // [{selector:'.wheel', count}, ...]
	let best = null, bestLen = 0;

	for ( const { selector } of known ) {

		const token = selector.slice( 1 ).toLowerCase(); // strip '.' or '#'
		const singular = token.endsWith( 's' ) ? token.slice( 0, - 1 ) : token;
		const matches = words.includes( token ) || words.includes( singular ) || words.includes( token + 's' );
		if ( matches && ( ! best || token.length > bestLen || ( token.length === bestLen && selector[ 0 ] === '.' ) ) ) {

			best = selector; bestLen = token.length;

		}

	}

	return best;

}

/** HOST: extract args for the resolved op from regexable patterns in the text. */
export function extractArgs( text, op ) {

	const lower = text.toLowerCase();

	if ( op === 'recolor' ) {

		const hex = text.match( /#[0-9a-f]{3,6}/i );
		if ( hex ) return { color: hex[ 0 ] };
		for ( const [ word, hexVal ] of Object.entries( COLOR_WORDS ) ) if ( lower.includes( word ) ) return { color: hexVal };
		return null;

	}

	if ( op === 'move' ) {

		const nums = text.match( /-?\d+(\.\d+)?/g );
		if ( nums && nums.length >= 2 ) return { dx: parseFloat( nums[ 0 ] ), dy: parseFloat( nums[ 1 ] ) };
		if ( /\bleft\b/.test( lower ) ) return { dx: - 20, dy: 0 };
		if ( /\bright\b/.test( lower ) ) return { dx: 20, dy: 0 };
		if ( /\bup\b/.test( lower ) ) return { dx: 0, dy: - 20 };
		if ( /\bdown\b/.test( lower ) ) return { dx: 0, dy: 20 };
		return null;

	}

	if ( op === 'scale' ) {

		const factorMatch = text.match( /(\d+(\.\d+)?)\s*x\b/i );
		if ( factorMatch ) return { sx: parseFloat( factorMatch[ 1 ] ) };
		if ( /bigger|grow|enlarge/.test( lower ) ) return { sx: 1.25 };
		if ( /smaller|shrink/.test( lower ) ) return { sx: 0.8 };
		return null;

	}

	if ( op === 'rotate' ) {

		const deg = text.match( /(-?\d+(\.\d+)?)\s*(deg|degrees)?/i );
		if ( deg && /deg/i.test( text ) ) return { deg: parseFloat( deg[ 1 ] ) };
		return { deg: 15 };

	}

	if ( op === 'reorder' ) {

		if ( /front|forward/.test( lower ) ) return { direction: /forward/.test( lower ) ? 'forward' : 'front' };
		return { direction: /backward/.test( lower ) ? 'backward' : 'back' };

	}

	return {}; // remove / clone / group / ungroup take no args

}

/**
 * Decompose one natural-language request into op-JSON and execute it.
 * @param {function} $S     bound createS() instance
 * @param {string} text     the request
 * @param {function|null} chat  optional model chat(messages)->string, for the
 *                              genuinely fuzzy residue (ambiguous verb / missing args)
 * @param {{bare?:boolean}} [opts]  bare:true skips ALL host resolution and hints —
 *                              the eval's "bare" (raw model) condition.
 * @returns {Promise<{source:'host'|'model'|'none', op:object|null, result:object}>}
 */
export async function decomposeAndExecute( $S, text, chat = null, opts = {} ) {

	const bare = !! opts.bare;
	let selector = null, op = null, args = null;

	if ( ! bare ) {

		const opSpan = resolveOpTypeSpan( text );
		op = opSpan ? opSpan.op : null;
		// strip the matched verb PHRASE before resolving the selector, so a direction
		// word inside the phrase ("to the front") can't collide with a selector token
		// that happens to share the same word (".front") — see resolveOpTypeSpan doc.
		const residual = opSpan ? text.replace( opSpan.match, ' ' ) : text;
		selector = resolveSelector( residual, $S ) || resolveSelector( text, $S );
		args = op ? extractArgs( text, op ) : null;

	}

	if ( selector && op && args ) {

		const json = { op, selector, args };
		return { source: 'host', op: json, result: opsModule.dispatchOp( $S.host, json ) };

	}

	if ( ! chat ) {

		return {
			source: 'none', op: null,
			result: { success: false, message: 'Could not resolve deterministically (missing selector/op/args) — load a model to fill the fuzzy residue.' },
		};

	}

	// MODEL: fill only what the host couldn't (bare mode: fill EVERYTHING, no hints).
	const known = $S.listSelectors().map( s => s.selector );
	const prompt = [
		{ role: 'system', content:
			`You convert a 2D vector-editing request into exactly ONE JSON object: {"op":string,"selector":string,"args":object}.\n` +
			`Valid ops: ${ opsModule.OP_SET.join( ', ' ) }.\n` +
			`Valid selectors in THIS scene: ${ known.join( ', ' ) }.\n` +
			( selector ? `The selector is ALREADY resolved: "${ selector }". Use exactly that.\n` : '' ) +
			( op ? `The op is ALREADY resolved: "${ op }". Use exactly that.\n` : '' ) +
			`Respond with ONLY the JSON object, no prose, no code fences.` },
		{ role: 'user', content: text },
	];

	let raw;
	try { raw = await chat( prompt ); }
	catch ( e ) { return { source: 'model', op: null, result: { success: false, message: `model call failed: ${ e.message }` } }; }

	let json;
	try { json = JSON.parse( extractJson( raw ) ); }
	catch { return { source: 'model', op: null, result: { success: false, message: `model did not return valid JSON: ${ raw }` } }; }

	if ( selector ) json.selector = selector; // host resolution always wins when it has one
	if ( op ) json.op = op;

	return { source: 'model', op: json, result: opsModule.dispatchOp( $S.host, json ) };

}

/**
 * Multi-op segmentation. Host-resolved mode: HOST segments deterministically on
 * "and" (Strata's rule: host decides how many ops + their order) and decomposes
 * each segment independently. Bare mode: no host segmentation — the model must
 * split AND resolve everything itself, in one call, returning a JSON array.
 * @returns {Promise<{source:string, ops:object[]}>}
 */
export async function decomposeMultiOp( $S, text, chat = null, opts = {} ) {

	const bare = !! opts.bare;

	if ( ! bare ) {

		const segments = text.split( /\s+and\s+/i ).map( s => s.trim() ).filter( Boolean );
		const produced = [];
		for ( const seg of segments ) {

			const r = await decomposeAndExecute( $S, seg, chat, { bare: false } );
			if ( r.op ) produced.push( r.op );

		}
		return { source: 'host', ops: produced };

	}

	if ( ! chat ) return { source: 'none', ops: [] };

	const known = $S.listSelectors().map( s => s.selector );
	const prompt = [
		{ role: 'system', content:
			`Convert this request into a JSON ARRAY of ops, one per distinct edit intent: [{"op":string,"selector":string,"args":object}, ...].\n` +
			`Valid ops: ${ opsModule.OP_SET.join( ', ' ) }. Valid selectors: ${ known.join( ', ' ) }.\n` +
			`Respond with ONLY the JSON array.` },
		{ role: 'user', content: text },
	];

	let raw;
	try { raw = await chat( prompt ); } catch { return { source: 'model', ops: [] }; }
	try {

		const start = raw.indexOf( '[' ), end = raw.lastIndexOf( ']' );
		const list = JSON.parse( start >= 0 ? raw.slice( start, end + 1 ) : raw );
		for ( const j of list ) opsModule.dispatchOp( $S.host, j );
		return { source: 'model', ops: list };

	} catch { return { source: 'model', ops: [] }; }

}

function extractJson( raw ) {

	const start = raw.indexOf( '{' );
	const end = raw.lastIndexOf( '}' );
	return start >= 0 && end > start ? raw.slice( start, end + 1 ) : raw;

}
