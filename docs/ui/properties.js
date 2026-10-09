// ── ui/properties.js — the inspector for the current selection ────────────────
// Direct-manipulation counterpart to the console: every field writes through the
// same $S/ops surface as a typed command, so it's undoable and console-equivalent.

import { getState } from 'https://cdn.jsdelivr.net/gh/tejaswigowda/svg-dom@bd16741b851768cf0446e9153010322b9f8ec58b/src/transform.js';
import { getSelected, setSelected } from './selection.js';

function row( label, input ) {

	const wrap = document.createElement( 'div' );
	wrap.className = 'props-row';
	const l = document.createElement( 'label' );
	l.textContent = label;
	wrap.appendChild( l );
	wrap.appendChild( input );
	return wrap;

}

function textInput( value, onCommit ) {

	const el = document.createElement( 'input' );
	el.type = 'text';
	el.value = value ?? '';
	el.addEventListener( 'change', () => onCommit( el.value ) );
	return el;

}

function numberInput( value, onCommit, step = 1 ) {

	const el = document.createElement( 'input' );
	el.type = 'number';
	el.step = step;
	el.value = Number.isFinite( value ) ? value : 0;
	el.addEventListener( 'change', () => onCommit( parseFloat( el.value ) || 0 ) );
	return el;

}

function colorRow( label, value, onCommit ) {

	const wrap = document.createElement( 'div' );
	wrap.className = 'props-row';
	const l = document.createElement( 'label' );
	l.textContent = label;
	wrap.appendChild( l );
	const swatch = document.createElement( 'input' );
	swatch.type = 'color';
	swatch.value = /^#[0-9a-f]{6}$/i.test( value ) ? value : '#000000';
	const text = document.createElement( 'input' );
	text.type = 'text';
	text.value = value ?? '';
	swatch.addEventListener( 'input', () => { text.value = swatch.value; onCommit( swatch.value ); } );
	text.addEventListener( 'change', () => onCommit( text.value ) );
	wrap.appendChild( swatch );
	wrap.appendChild( text );
	return wrap;

}

/** Render the properties panel for the current selection into `container`. */
export function renderProperties( container, $S ) {

	container.innerHTML = '';
	const nodes = getSelected();

	if ( nodes.length === 0 ) {

		container.innerHTML = '<p class="hint">Select an element (on the canvas or in the outliner) to edit its properties.</p>';
		return;

	}

	if ( nodes.length > 1 ) {

		container.innerHTML = `<p class="hint">${ nodes.length } elements selected.</p>`;
		const removeBtn = document.createElement( 'button' );
		removeBtn.className = 'ghost';
		removeBtn.textContent = 'Remove selection';
		removeBtn.addEventListener( 'click', () => { $S( nodes ).remove(); setSelected( [] ); } );
		container.appendChild( removeBtn );
		return;

	}

	const node = nodes[ 0 ];
	const set = () => $S( [ node ] );

	// ── Identity ───────────────────────────────────────────────────────────
	const idSec = document.createElement( 'div' );
	idSec.className = 'props-section';
	idSec.innerHTML = '<h3>Identity</h3>';
	idSec.appendChild( row( 'Tag', Object.assign( document.createElement( 'input' ), { type: 'text', value: node.tagName.toLowerCase(), disabled: true } ) ) );
	idSec.appendChild( row( 'ID', textInput( node.id, ( v ) => set().editID( v ) ) ) );
	idSec.appendChild( row( 'Classes', textInput( [ ...node.classList ].join( ' ' ), ( v ) => {

		const want = new Set( v.split( /\s+/ ).filter( Boolean ) );
		const have = new Set( node.classList );
		for ( const c of have ) if ( ! want.has( c ) ) set().removeClass( c );
		for ( const c of want ) if ( ! have.has( c ) ) set().addClass( c );

	} ) ) );
	container.appendChild( idSec );

	// ── Appearance ─────────────────────────────────────────────────────────
	const appSec = document.createElement( 'div' );
	appSec.className = 'props-section';
	appSec.innerHTML = '<h3>Appearance</h3>';
	appSec.appendChild( colorRow( 'Fill', node.getAttribute( 'fill' ) || '', ( v ) => set().restyle( { fill: v } ) ) );
	appSec.appendChild( colorRow( 'Stroke', node.getAttribute( 'stroke' ) || '', ( v ) => set().restyle( { stroke: v } ) ) );
	appSec.appendChild( row( 'Opacity', numberInput( parseFloat( node.getAttribute( 'opacity' ) ?? 1 ), ( v ) => set().restyle( { opacity: v } ), 0.1 ) ) );
	appSec.appendChild( row( 'Stroke w.', numberInput( parseFloat( node.getAttribute( 'stroke-width' ) ?? 0 ), ( v ) => set().restyle( { strokeWidth: v } ) ) ) );
	container.appendChild( appSec );

	// ── Transform ──────────────────────────────────────────────────────────
	const s = getState( node );
	const xfSec = document.createElement( 'div' );
	xfSec.className = 'props-section';
	xfSec.innerHTML = '<h3>Transform</h3>';
	xfSec.appendChild( row( 'X', numberInput( s.x, ( v ) => set().moveTo( v, s.y ) ) ) );
	xfSec.appendChild( row( 'Y', numberInput( s.y, ( v ) => set().moveTo( s.x, v ) ) ) );
	xfSec.appendChild( row( 'Rotate', numberInput( s.rotation, ( v ) => set().rotate( v - s.rotation ) ) ) );
	xfSec.appendChild( row( 'Scale', numberInput( s.sx, ( v ) => set().scale( v ), 0.1 ) ) );
	container.appendChild( xfSec );

}
