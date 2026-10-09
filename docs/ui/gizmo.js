// ── ui/gizmo.js — canvas click-to-select + drag move/scale/rotate ─────────────
// Direct manipulation is a thin skin over the SAME ops the console/properties use:
// every drag previews live (mutating the transform component cache directly, same
// cache moveOp/scaleOp/rotateOp read), then rolls back to the pre-drag base and
// replays through the real op ONCE on release — so every drag is exactly one
// undo entry, never a flood of intermediate commands.

import { getState, apply, bboxCenter } from 'https://cdn.jsdelivr.net/gh/tejaswigowda/svg-dom@bd16741b851768cf0446e9153010322b9f8ec58b/src/transform.js';
import { ops } from 'https://cdn.jsdelivr.net/gh/tejaswigowda/svg-dom@bd16741b851768cf0446e9153010322b9f8ec58b/src/index.js';
import { getSelected, setSelected } from './selection.js';

const HANDLE_DIRS = [ 'nw', 'ne', 'sw', 'se' ];

function svgPointFrom( el, clientX, clientY ) {

	const root = el.ownerSVGElement || el;
	const ctm = el.getScreenCTM && el.getScreenCTM();
	if ( ! ctm ) return { x: clientX, y: clientY };
	const pt = root.createSVGPoint();
	pt.x = clientX; pt.y = clientY;
	return pt.matrixTransform( ctm.inverse() );

}

function restore( node, base ) { Object.assign( getState( node ), base ); apply( node ); }

export function initGizmo( { canvasWrap, canvas, overlay, getHost } ) {

	function svgRoot() { return canvas.querySelector( 'svg' ); }

	function renderGizmo() {

		overlay.innerHTML = '';
		const nodes = getSelected().filter( ( n ) => n.isConnected );
		if ( nodes.length === 0 ) return;

		const wrapRect = canvasWrap.getBoundingClientRect();
		const rects = nodes.map( ( n ) => n.getBoundingClientRect() );
		const left = Math.min( ...rects.map( ( r ) => r.left ) );
		const top = Math.min( ...rects.map( ( r ) => r.top ) );
		const right = Math.max( ...rects.map( ( r ) => r.right ) );
		const bottom = Math.max( ...rects.map( ( r ) => r.bottom ) );
		const box = { left: left - wrapRect.left, top: top - wrapRect.top, width: right - left, height: bottom - top };

		const boxEl = document.createElement( 'div' );
		boxEl.className = 'gizmo-box';
		Object.assign( boxEl.style, { left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px' } );
		overlay.appendChild( boxEl );

		for ( const dir of HANDLE_DIRS ) {

			const h = document.createElement( 'div' );
			h.className = 'gizmo-handle';
			h.dataset.dir = dir;
			h.style.left = ( box.left + ( dir.includes( 'e' ) ? box.width : 0 ) ) + 'px';
			h.style.top = ( box.top + ( dir.includes( 's' ) ? box.height : 0 ) ) + 'px';
			h.addEventListener( 'pointerdown', ( e ) => beginScale( e, box ) );
			overlay.appendChild( h );

		}

		const rotateLine = document.createElement( 'div' );
		rotateLine.className = 'gizmo-rotate-line';
		Object.assign( rotateLine.style, { left: ( box.left + box.width / 2 ) + 'px', top: ( box.top - 20 ) + 'px', height: '20px' } );
		overlay.appendChild( rotateLine );

		const rotateHandle = document.createElement( 'div' );
		rotateHandle.className = 'gizmo-rotate';
		rotateHandle.style.left = ( box.left + box.width / 2 ) + 'px';
		rotateHandle.style.top = ( box.top - 20 ) + 'px';
		rotateHandle.addEventListener( 'pointerdown', ( e ) => beginRotate( e, box ) );
		overlay.appendChild( rotateHandle );

	}

	// ── Move: click-select, drag to translate ───────────────────────────────
	canvas.addEventListener( 'pointerdown', ( e ) => {

		const root = svgRoot();
		if ( ! root || e.target === root || ! root.contains( e.target ) ) { setSelected( [] ); return; }

		const target = e.target;
		const already = getSelected();
		const startX = e.clientX, startY = e.clientY;
		let moved = false, dragNodes = null, bases = null;

		function onMove( ev ) {

			if ( ! moved ) {

				if ( Math.hypot( ev.clientX - startX, ev.clientY - startY ) < 3 ) return;
				moved = true;
				if ( ! already.includes( target ) ) setSelected( [ target ] );
				dragNodes = getSelected();
				bases = dragNodes.map( ( n ) => ( { node: n, parent: n.parentNode, base: { ...getState( n ) } } ) );

			}

			const ref = bases[ 0 ].parent;
			const startLocal = svgPointFrom( ref, startX, startY );
			const curLocal = svgPointFrom( ref, ev.clientX, ev.clientY );
			const dx = curLocal.x - startLocal.x, dy = curLocal.y - startLocal.y;
			for ( const b of bases ) {

				const s = getState( b.node );
				s.x = b.base.x + dx; s.y = b.base.y + dy;
				apply( b.node );

			}
			renderGizmo();

		}

		function onUp( ev ) {

			window.removeEventListener( 'pointermove', onMove );
			window.removeEventListener( 'pointerup', onUp );
			if ( ! moved ) { setSelected( [ target ] ); return; }

			const ref = bases[ 0 ].parent;
			const startLocal = svgPointFrom( ref, startX, startY );
			const curLocal = svgPointFrom( ref, ev.clientX, ev.clientY );
			const dx = curLocal.x - startLocal.x, dy = curLocal.y - startLocal.y;
			for ( const b of bases ) restore( b.node, b.base ); // undo the live preview so the real op computes from the true base
			ops.moveOp( getHost(), dragNodes, dx, dy );
			renderGizmo();

		}

		window.addEventListener( 'pointermove', onMove );
		window.addEventListener( 'pointerup', onUp );

	} );

	// ── Scale: drag a corner handle, uniform, ratio measured in screen space ─
	function beginScale( e, box ) {

		e.stopPropagation();
		const nodes = getSelected();
		if ( nodes.length === 0 ) return;
		const center = { x: box.left + box.width / 2 + canvasWrap.getBoundingClientRect().left, y: box.top + box.height / 2 + canvasWrap.getBoundingClientRect().top };
		const bases = nodes.map( ( n ) => ( { node: n, base: { ...getState( n ) } } ) );
		const startDist = Math.hypot( e.clientX - center.x, e.clientY - center.y ) || 1;

		function ratio( ev ) { return Math.hypot( ev.clientX - center.x, ev.clientY - center.y ) / startDist; }

		function onMove( ev ) {

			const r = ratio( ev );
			for ( const b of bases ) {

				const s = getState( b.node );
				s.sx = b.base.sx * r; s.sy = b.base.sy * r;
				apply( b.node );

			}
			renderGizmo();

		}

		function onUp( ev ) {

			window.removeEventListener( 'pointermove', onMove );
			window.removeEventListener( 'pointerup', onUp );
			const r = ratio( ev );
			for ( const b of bases ) restore( b.node, b.base );
			ops.scaleOp( getHost(), nodes, bases[ 0 ].base.sx * r, bases[ 0 ].base.sy * r );
			renderGizmo();

		}

		window.addEventListener( 'pointermove', onMove );
		window.addEventListener( 'pointerup', onUp );

	}

	// ── Rotate: drag the handle above the box, around its screen-space center ─
	function beginRotate( e, box ) {

		e.stopPropagation();
		const nodes = getSelected();
		if ( nodes.length === 0 ) return;
		const center = { x: box.left + box.width / 2 + canvasWrap.getBoundingClientRect().left, y: box.top + box.height / 2 + canvasWrap.getBoundingClientRect().top };
		const bases = nodes.map( ( n ) => ( { node: n, base: { ...getState( n ) } } ) );
		const startAngle = Math.atan2( e.clientY - center.y, e.clientX - center.x ) * 180 / Math.PI;

		function delta( ev ) { return ( Math.atan2( ev.clientY - center.y, ev.clientX - center.x ) * 180 / Math.PI ) - startAngle; }

		function onMove( ev ) {

			const d = delta( ev );
			for ( const b of bases ) {

				const s = getState( b.node );
				const pivot = bboxCenter( b.node );
				s.rotation = b.base.rotation + d; s.cx = pivot.x; s.cy = pivot.y;
				apply( b.node );

			}
			renderGizmo();

		}

		function onUp( ev ) {

			window.removeEventListener( 'pointermove', onMove );
			window.removeEventListener( 'pointerup', onUp );
			const d = delta( ev );
			for ( const b of bases ) restore( b.node, b.base );
			ops.rotateOp( getHost(), nodes, d );
			renderGizmo();

		}

		window.addEventListener( 'pointermove', onMove );
		window.addEventListener( 'pointerup', onUp );

	}

	window.addEventListener( 'resize', renderGizmo );
	document.addEventListener( 'keydown', ( e ) => {

		if ( e.key === 'Escape' ) setSelected( [] );

	} );

	return { renderGizmo };

}
