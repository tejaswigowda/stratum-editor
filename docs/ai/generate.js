// ── ai/generate.js — natural language → SVG markup (the NEW task) ────────────
//
// Strata's eval never covered this: generation is the genuinely new capability
// Stratum adds. There is no host-side fallback for "draw a fox icon" — either
// the model can do it or it can't. This file constrains the model to a small
// schema (a closed shape-tag allow-list, no <script>/<style>/external refs) and
// validates the result before insertion — never trust ungrounded model output,
// same "never silently wrong" discipline as the op layer.

const ALLOWED_TAGS = new Set( [ 'g', 'rect', 'circle', 'ellipse', 'path', 'line', 'polygon', 'polyline', 'text' ] );

/**
 * @param {function} $S    bound createS() instance
 * @param {string} text    the request, e.g. "draw a small red star"
 * @param {function} chat  model chat(messages)->string
 * @returns {Promise<{success:boolean, count?:number, message?:string, markup?:string}>}
 */
export async function generateAndInsert( $S, text, chat ) {

	const prompt = [
		{ role: 'system', content:
			`You generate a SMALL SVG fragment for a 2D vector scene. Respond with ONLY the inner ` +
			`markup (no <svg> wrapper, no XML declaration, no <script>/<style>/<image>/<foreignObject>), ` +
			`using only these tags: ${ [ ...ALLOWED_TAGS ].join( ', ' ) }. Coordinates should fit within a ` +
			`100x100 box. No prose, no code fences — markup only.` },
		{ role: 'user', content: text },
	];

	let raw;
	try { raw = await chat( prompt ); }
	catch ( e ) { return { success: false, message: `model call failed: ${ e.message }` }; }

	const markup = extractMarkup( raw );
	const validation = validate( markup );
	if ( ! validation.ok ) return { success: false, message: validation.message, markup };

	const g = $S.host.createElement( 'g' );
	g.setAttribute( 'class', 'generated' );
	g.innerHTML = markup; // already validated: allow-listed tags only, parsed via DOMParser above
	$S.host.execute( $S.host.addElement( g, $S.root, null ) );

	return { success: true, count: g.children.length, markup };

}

function extractMarkup( raw ) {

	const fenced = raw.match( /```(?:svg|xml|html)?\s*([\s\S]*?)```/i );
	let markup = ( fenced ? fenced[ 1 ] : raw ).trim();

	// models routinely wrap in <svg> and/or add prose despite the "no wrapper, no
	// prose" instruction — pull the <svg>...</svg> block's inner content out and
	// discard any surrounding prose, rather than rejecting outright on a technicality.
	const wrapper = markup.match( /<svg\b[^>]*>([\s\S]*)<\/svg>/i );
	if ( wrapper ) markup = wrapper[ 1 ].trim();

	return markup;

}

/** Parse as SVG and reject disallowed tags / parser errors before ever touching the scene. */
function validate( markup ) {

	if ( ! markup ) return { ok: false, message: 'empty response' };

	const wrapped = `<svg xmlns="http://www.w3.org/2000/svg">${ markup }</svg>`;
	const doc = new DOMParser().parseFromString( wrapped, 'image/svg+xml' );
	if ( doc.querySelector( 'parsererror' ) ) return { ok: false, message: 'not well-formed SVG/XML' };

	const all = doc.documentElement.querySelectorAll( '*' );
	for ( const el of all ) {

		const tag = el.tagName.toLowerCase();
		if ( ! ALLOWED_TAGS.has( tag ) ) return { ok: false, message: `disallowed tag <${ tag }>` };

	}

	return { ok: true };

}
