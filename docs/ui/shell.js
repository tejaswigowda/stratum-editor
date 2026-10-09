// ── ui/shell.js — Strata's Shell tab, ported: ONE log, a JS input, an AI input ──
// Every command — typed JS or a natural-language AI request — executes through
// the SAME $S/host and lands in the SAME log. "help" lists what's available.

const HELP_TEXT = [
	'Available in the JS shell: $S, ops, selectorEngine, root, host, runEditMatrix(opts), insertRaw(markup).',
	'  $S(\'.wheel\').recolor(\'#111\')       — chainable ops, undoable',
	'  insertRaw(\'<rect .../>\')            — raw-SVG escape hatch, no tag allow-list, still undoable',
	'  await runEditMatrix({ mode: \'host-resolved\' })',
	'AI row: describe an edit ("make the wheels black") or new content ("draw a small red star").',
	'  Host-resolved edits run deterministically; if nothing resolves, the loaded model',
	'  fills the op, or — if no op fits — generates a raw-SVG fragment (the escape hatch).',
].join( '\n' );

function autoGrow( el ) { el.style.height = 'auto'; el.style.height = Math.min( el.scrollHeight, 140 ) + 'px'; }

export function initShell( { jsInputEl, aiInputEl, logEl, clearBtn, getJsContext, runAI } ) {

	const history = [];
	let historyIndex = -1;

	function print( line, cls = '' ) {

		const div = document.createElement( 'div' );
		if ( cls ) div.className = cls;
		div.textContent = line;
		logEl.appendChild( div );
		logEl.scrollTop = logEl.scrollHeight;

	}

	function stringify( v ) {

		if ( typeof v === 'string' ) return v;
		try { return JSON.stringify( v ); }
		catch { return String( v ); }

	}

	function runJs( code ) {

		print( '› ' + code, 'echo' );
		if ( code.trim() === 'help' ) { print( HELP_TEXT, 'hint-line' ); return; }

		const ctx = getJsContext();
		const names = Object.keys( ctx );
		const values = Object.values( ctx );
		try {

			let result;
			try { result = new Function( ...names, 'return (' + code + ')' )( ...values ); }
			catch ( e ) { if ( e instanceof SyntaxError ) result = new Function( ...names, code )( ...values ); else throw e; }
			Promise.resolve( result ).then( ( v ) => { if ( v !== undefined ) print( stringify( v ), 'ok' ); } ).catch( ( e ) => print( e.message, 'err' ) );

		} catch ( e ) {

			print( e.message, 'err' );

		}

	}

	jsInputEl.addEventListener( 'keydown', ( e ) => {

		if ( e.key === 'Enter' && ! e.shiftKey ) {

			e.preventDefault();
			const code = jsInputEl.value.trim();
			if ( ! code ) return;
			history.push( code );
			historyIndex = history.length;
			jsInputEl.value = '';
			autoGrow( jsInputEl );
			runJs( code );

		} else if ( e.key === 'ArrowUp' && ! jsInputEl.value.includes( '\n' ) ) {

			if ( historyIndex > 0 ) { historyIndex --; jsInputEl.value = history[ historyIndex ]; e.preventDefault(); }

		} else if ( e.key === 'ArrowDown' && ! jsInputEl.value.includes( '\n' ) ) {

			if ( historyIndex < history.length - 1 ) { historyIndex ++; jsInputEl.value = history[ historyIndex ]; }
			else { historyIndex = history.length; jsInputEl.value = ''; }
			e.preventDefault();

		}

	} );
	jsInputEl.addEventListener( 'input', () => autoGrow( jsInputEl ) );

	aiInputEl.addEventListener( 'keydown', ( e ) => {

		if ( e.key !== 'Enter' ) return;
		const text = aiInputEl.value.trim();
		if ( ! text ) return;
		aiInputEl.value = '';
		print( 'AI› ' + text, 'echo' );
		runAI( text, print );

	} );

	if ( clearBtn ) clearBtn.addEventListener( 'click', () => { logEl.innerHTML = ''; } );

	print( 'Type "help" for the list of available commands.', 'hint-line' );

	return { print };

}
