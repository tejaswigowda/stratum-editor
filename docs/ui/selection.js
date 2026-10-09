// ── ui/selection.js — the one shared selection set, wired into $S(':selected') ──
// Every panel (outliner, properties, gizmo) reads/writes THIS, so clicking a row
// in the outliner and clicking a shape on the canvas are the same operation.

let selected = [];
const listeners = new Set();

export function getSelected() { return selected.slice(); }

export function setSelected( nodes ) {

	selected = ( nodes || [] ).filter( Boolean );
	for ( const fn of listeners ) fn( selected.slice() );

}

export function toggleSelected( node ) {

	const i = selected.indexOf( node );
	if ( i === - 1 ) setSelected( [ ...selected, node ] );
	else setSelected( selected.filter( ( n ) => n !== node ) );

}

export function clearSelected() { setSelected( [] ); }

export function onSelectionChange( fn ) { listeners.add( fn ); return () => listeners.delete( fn ); }
