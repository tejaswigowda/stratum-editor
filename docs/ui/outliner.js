// ── ui/outliner.js — tree view of the mounted SVG, click to select ────────────

import { getSelected, setSelected } from './selection.js';

function labelFor( el ) {

	const id = el.id ? '#' + el.id : '';
	const cls = el.classList.length ? '.' + [ ...el.classList ].join( '.' ) : '';
	return { tag: el.tagName.toLowerCase(), meta: id + cls };

}

function buildRow( el ) {

	const row = document.createElement( 'div' );
	row.className = 'tree-row';
	const { tag, meta } = labelFor( el );
	row.innerHTML = `<span class="tag">${ tag }</span><span class="meta">${ meta }</span>`;
	row.addEventListener( 'click', ( e ) => {

		e.stopPropagation();
		setSelected( [ el ] );

	} );
	return row;

}

function buildTree( el ) {

	const li = document.createElement( 'li' );
	li.appendChild( buildRow( el ) );
	const children = [ ...el.children ].filter( ( c ) => c.namespaceURI === el.namespaceURI );
	if ( children.length ) {

		const ul = document.createElement( 'ul' );
		for ( const child of children ) ul.appendChild( buildTree( child ) );
		li.appendChild( ul );

	}

	li.__el = el;
	return li;

}

/** Render the outliner tree for `root` into `container`, and re-highlight on every call. */
export function renderOutliner( root, container ) {

	container.innerHTML = '';
	const ul = document.createElement( 'ul' );
	ul.style.paddingLeft = '0';
	ul.appendChild( buildTree( root ) );
	container.appendChild( ul );
	highlightOutliner( container );

}

/** Re-apply the `.selected` class without rebuilding the tree (called on every selection change). */
export function highlightOutliner( container ) {

	const selected = getSelected();
	container.querySelectorAll( 'li' ).forEach( ( li ) => {

		const row = li.querySelector( ':scope > .tree-row' );
		if ( row ) row.classList.toggle( 'selected', selected.includes( li.__el ) );

	} );

}
