// ── app.js — the Stratum editor shell ──────────────────────────────────────────
// A WYSIWYG SVG editor: click/drag the canvas, edit the outliner + properties
// panel, or type into the AI/Shell tab (JS REPL + natural-language row, Strata's
// Shell tab shape) — every path routes through the SAME $S/host, one execution
// surface, same discipline as Strata.

import { createS, ops as opsModule, selectorEngine } from 'https://cdn.jsdelivr.net/gh/tejaswigowda/svg-dom@bd16741b851768cf0446e9153010322b9f8ec58b/src/index.js';
import { decomposeAndExecute } from './ai/nlEditing.js';
import { generateAndInsert } from './ai/generate.js';
import { loadWebLLM, loadApiModel, listWebLLMModels, listApiModels, API_PROVIDERS } from './ai/model.js';
import { DEMO_SVG } from './eval/fixtureScene.js';
import { runEditMatrix } from './eval/editMatrix.js';
import { getSelected, setSelected, onSelectionChange } from './ui/selection.js';
import { renderOutliner, highlightOutliner } from './ui/outliner.js';
import { renderProperties } from './ui/properties.js';
import { initGizmo } from './ui/gizmo.js';
import { initShell } from './ui/shell.js';

if ( 'serviceWorker' in navigator ) {

	navigator.serviceWorker.register( './service-worker.js' ).catch( () => { /* offline shell is best-effort */ } );

}

const state = { $S: null, chat: null, chatKind: null };

const canvas = document.getElementById( 'canvas' );
const canvasWrap = document.getElementById( 'canvas-wrap' );
const overlay = document.getElementById( 'gizmo-overlay' );
const outlinerEl = document.getElementById( 'outliner' );
const propertiesEl = document.getElementById( 'properties' );

selectorEngine.setSelectionProvider( getSelected ); // wires $S(':selected') to the shared selection set

/** Raw-SVG escape hatch for the JS shell: no tag allow-list (unlike the AI's generate path), still undoable. */
function insertRaw( markup ) {

	const doc = new DOMParser().parseFromString( `<svg xmlns="http://www.w3.org/2000/svg">${ markup }</svg>`, 'image/svg+xml' );
	if ( doc.querySelector( 'parsererror' ) ) throw new Error( 'insertRaw: not well-formed SVG/XML' );
	const g = state.$S.host.createElement( 'g' );
	for ( const el of [ ...doc.documentElement.children ] ) g.appendChild( el );
	state.$S.host.execute( state.$S.host.addElement( g, state.$S.root, null ) );
	return g;

}

/**
 * Unified AI entry point (the Shell tab's "AI" row): try a host/model-resolved EDIT
 * first (same decomposeAndExecute as before); only if nothing resolves to an edit,
 * escape-hatch to raw-SVG GENERATION — Strata's own "AI" row has no separate
 * edit/generate buttons, so this row shouldn't either.
 */
async function runAI( text, print ) {

	const editResult = await decomposeAndExecute( state.$S, text, state.chat );
	if ( editResult.result && editResult.result.success ) {

		print( `[${ editResult.source }] ${ JSON.stringify( editResult.op ) } → ${ JSON.stringify( editResult.result ) }`, 'ok' );
		return;

	}

	if ( ! state.chat ) { print( editResult.result.message || 'Could not resolve as an edit — load a model to fill the residue or generate new content.', 'err' ); return; }

	const genResult = await generateAndInsert( state.$S, text, state.chat );
	print( genResult.success ? `generated ${ genResult.count } element(s) (raw-SVG escape hatch)` : `generate failed: ${ genResult.message }`, genResult.success ? 'ok' : 'err' );
	if ( ! genResult.success && genResult.markup ) print( 'model output was: ' + genResult.markup, 'err' );

}

const { print } = initShell( {
	jsInputEl: document.getElementById( 'js-input' ),
	aiInputEl: document.getElementById( 'ai-input' ),
	logEl: document.getElementById( 'shell-log' ),
	clearBtn: document.getElementById( 'shell-clear' ),
	getJsContext: () => ( { $S: state.$S, ops: opsModule, selectorEngine, root: state.$S && state.$S.root, host: state.$S && state.$S.host, runEditMatrix, insertRaw } ),
	runAI,
} );

function log( line, cls = '' ) { print( line, cls ); }

const { renderGizmo } = initGizmo( { canvasWrap, canvas, overlay, getHost: () => state.$S.host } );

function refreshAll() {

	setSelected( getSelected().filter( ( n ) => n.isConnected ) );
	renderOutliner( state.$S.root, outlinerEl );
	renderProperties( propertiesEl, state.$S );
	renderGizmo();
	updateHistoryInfo();

}

onSelectionChange( () => {

	highlightOutliner( outlinerEl );
	renderProperties( propertiesEl, state.$S );
	renderGizmo();

} );

function mountSvg( svgText ) {

	canvas.innerHTML = '';
	const doc = new DOMParser().parseFromString( svgText, 'image/svg+xml' );
	if ( doc.querySelector( 'parsererror' ) ) { log( 'Failed to parse SVG', 'err' ); return; }
	const svg = doc.documentElement;
	canvas.appendChild( svg );

	state.$S = createS( svg, { onChange: () => refreshAll() } );
	window.$S = state.$S; // devtools console access, mirrors 3DOM/Strata dev ergonomics
	setSelected( [] );
	refreshAll();
	log( `Loaded scene: ${ svg.querySelectorAll( '*' ).length } elements` );

}

function updateHistoryInfo() {

	const h = state.$S && state.$S.host;
	document.getElementById( 'history-info' ).textContent = h ? `history: ${ h.historyLength }` : '';

}

mountSvg( DEMO_SVG );

// ── Menubar: File ────────────────────────────────────────────────────────────
document.getElementById( 'reset-btn' ).addEventListener( 'click', () => mountSvg( DEMO_SVG ) );

document.getElementById( 'file-input' ).addEventListener( 'change', async ( e ) => {

	const file = e.target.files[ 0 ];
	if ( ! file ) return;
	mountSvg( await file.text() );
	e.target.value = '';

} );

document.getElementById( 'save-btn' ).addEventListener( 'click', () => {

	const svgText = new XMLSerializer().serializeToString( state.$S.root );
	const blob = new Blob( [ svgText ], { type: 'image/svg+xml' } );
	const a = document.createElement( 'a' );
	a.href = URL.createObjectURL( blob );
	a.download = 'stratum-scene.svg';
	a.click();
	URL.revokeObjectURL( a.href );

} );

// ── Menubar: Edit ──────────────────────────────────────────────────────────────
document.getElementById( 'undo-btn' ).addEventListener( 'click', () => { state.$S.undo(); log( 'undo()' ); } );
document.getElementById( 'redo-btn' ).addEventListener( 'click', () => { state.$S.redo(); log( 'redo()' ); } );
document.getElementById( 'delete-btn' ).addEventListener( 'click', () => {

	const nodes = getSelected();
	if ( nodes.length === 0 ) return;
	state.$S( nodes ).remove();
	setSelected( [] );

} );
document.addEventListener( 'keydown', ( e ) => {

	if ( e.key !== 'Delete' && e.key !== 'Backspace' ) return;
	if ( document.activeElement && [ 'INPUT', 'TEXTAREA' ].includes( document.activeElement.tagName ) ) return;
	const nodes = getSelected();
	if ( nodes.length === 0 ) return;
	state.$S( nodes ).remove();
	setSelected( [] );

} );

// ── Sidebar tabs ───────────────────────────────────────────────────────────────
document.querySelectorAll( '.tab' ).forEach( ( tab ) => tab.addEventListener( 'click', () => {

	document.querySelectorAll( '.tab' ).forEach( ( t ) => t.classList.toggle( 'active', t === tab ) );
	document.querySelectorAll( '.tab-panel' ).forEach( ( p ) => { p.hidden = p.dataset.panel !== tab.dataset.tab; } );

} ) );

// ── Menubar: close a <details class="menu"> on outside click or after a menu-item runs ─
document.addEventListener( 'click', ( e ) => {

	document.querySelectorAll( '.menu[open]' ).forEach( ( menu ) => { if ( ! menu.contains( e.target ) || e.target.closest( '.menu-item' ) ) menu.open = false; } );

} );

// ── AI/Shell: model loading (dropdown+Load AI for on-device, API for bring-your-own-key) ─
const modelSelect = document.getElementById( 'model-select' );
listWebLLMModels().then( ( models ) => {

	modelSelect.innerHTML = models.map( ( m ) => `<option value="${ m.id }">${ m.label }</option>` ).join( '' );
	// default to the smallest 1.5B-ish Qwen if present, else just the smallest model overall
	const preferred = models.find( ( m ) => m.id === 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC' );
	if ( preferred ) modelSelect.value = preferred.id;

} ).catch( ( e ) => { modelSelect.innerHTML = '<option value="">catalog failed to load</option>'; log( `WebLLM catalog failed to load: ${ e.message }`, 'err' ); } );

document.getElementById( 'model-load' ).addEventListener( 'click', async () => {

	const modelId = modelSelect.value;
	if ( ! modelId ) { log( 'No model selected', 'err' ); return; }
	try {

		print( `Loading WebLLM: ${ modelId } …` );
		state.chat = await loadWebLLM( modelId, ( p ) => { print( p ); } );
		state.chatKind = 'webllm';
		log( `Model loaded: ${ modelId }`, 'ok' );

	} catch ( e ) {

		log( `Model load failed: ${ e.message }`, 'err' );
		state.chat = null;

	}

} );

// ── AI/Shell: API dialog (OpenAI / Anthropic / Ollama / custom, step-by-step) ──
// Step 1: provider + base URL + key -> "Fetch models". Step 2: pick from the
// fetched dropdown (or fall back to typing an id manually if listing fails).
const apiDialog = document.getElementById( 'api-dialog' );
const apiProvider = document.getElementById( 'api-provider' );
const apiBaseUrl = document.getElementById( 'api-baseurl' );
const apiKeyInput = document.getElementById( 'api-key' );
const apiStep1 = document.getElementById( 'api-step1' );
const apiStep1Error = document.getElementById( 'api-step1-error' );
const apiFetchBtn = document.getElementById( 'api-fetch-models' );
const apiStep2 = document.getElementById( 'api-step2' );
const apiModelSelectRow = document.getElementById( 'api-model-select-row' );
const apiModelSelect = document.getElementById( 'api-model-select' );
const apiModelManualRow = document.getElementById( 'api-model-manual-row' );
const apiModelManual = document.getElementById( 'api-model-manual' );
const apiStep2Hint = document.getElementById( 'api-step2-hint' );
const apiModelToggle = document.getElementById( 'api-model-toggle' );

function applyProviderDefaults() {

	const d = API_PROVIDERS[ apiProvider.value ];
	apiBaseUrl.value = d.baseUrl;
	apiBaseUrl.placeholder = d.baseUrl || 'https://…';
	apiKeyInput.closest( 'label' ).hidden = ! d.needsKey;

}

function showApiStep1() {

	apiStep1.hidden = false;
	apiStep2.hidden = true;
	apiStep1Error.hidden = true;

}

function showManualModelEntry( hintMessage ) {

	apiModelSelectRow.hidden = true;
	apiModelManualRow.hidden = false;
	apiModelManual.value = API_PROVIDERS[ apiProvider.value ].model;
	apiModelToggle.hidden = true;
	apiStep2Hint.hidden = ! hintMessage;
	apiStep2Hint.textContent = hintMessage || '';
	apiStep2Hint.className = hintMessage ? 'hint err' : 'hint';

}

apiProvider.addEventListener( 'change', applyProviderDefaults );

document.getElementById( 'model-api' ).addEventListener( 'click', () => {

	applyProviderDefaults();
	apiKeyInput.value = '';
	showApiStep1();
	apiDialog.showModal();

} );

document.getElementById( 'api-cancel' ).addEventListener( 'click', () => apiDialog.close() );
document.getElementById( 'api-back' ).addEventListener( 'click', showApiStep1 );

document.getElementById( 'api-model-toggle' ).addEventListener( 'click', () => {

	const usingManual = ! apiModelManualRow.hidden;
	apiModelSelectRow.hidden = ! usingManual;
	apiModelManualRow.hidden = usingManual;
	apiModelToggle.textContent = usingManual ? 'Type the model id manually instead' : 'Use the fetched list instead';

} );

apiFetchBtn.addEventListener( 'click', async () => {

	const provider = apiProvider.value;
	const baseUrl = apiBaseUrl.value.trim();
	const apiKey = apiKeyInput.value;
	const needsKey = API_PROVIDERS[ provider ].needsKey;
	apiStep1Error.hidden = true;
	if ( ! baseUrl ) { apiStep1Error.hidden = false; apiStep1Error.textContent = 'Base URL is required'; return; }
	if ( needsKey && ! apiKey ) { apiStep1Error.hidden = false; apiStep1Error.textContent = 'API key is required'; return; }

	apiFetchBtn.disabled = true;
	apiFetchBtn.textContent = 'Fetching…';
	try {

		const models = await listApiModels( { provider, baseUrl, apiKey } );
		apiStep1.hidden = true;
		apiStep2.hidden = false;
		if ( models.length === 0 ) { showManualModelEntry( 'No models returned by this endpoint — enter the model id manually.' ); }
		else {

			apiModelSelectRow.hidden = false;
			apiModelManualRow.hidden = true;
			apiModelToggle.hidden = false;
			apiModelToggle.textContent = 'Type the model id manually instead';
			apiStep2Hint.hidden = true;
			apiModelSelect.innerHTML = models.map( ( m ) => `<option value="${ m.id }">${ m.label }</option>` ).join( '' );
			const preferred = models.find( ( m ) => m.id === API_PROVIDERS[ provider ].model );
			if ( preferred ) apiModelSelect.value = preferred.id;

		}

	} catch ( e ) {

		apiStep1.hidden = true;
		apiStep2.hidden = false;
		showManualModelEntry( `Could not list models (${ e.message }) — enter the model id manually.` );

	} finally {

		apiFetchBtn.disabled = false;
		apiFetchBtn.textContent = 'Fetch models →';

	}

} );

document.getElementById( 'api-form' ).addEventListener( 'submit', ( e ) => {

	e.preventDefault();
	const provider = apiProvider.value;
	const baseUrl = apiBaseUrl.value.trim();
	const apiKey = apiKeyInput.value;
	const model = ( apiModelManualRow.hidden ? apiModelSelect.value : apiModelManual.value ).trim();
	if ( ! baseUrl || ! model ) { log( 'Base URL and model are required', 'err' ); return; }

	try {

		state.chat = loadApiModel( { provider, baseUrl, apiKey, model } );
		state.chatKind = provider;
		log( `Model loaded: ${ API_PROVIDERS[ provider ].label } (${ model })`, 'ok' );
		apiDialog.close();

	} catch ( e2 ) {

		log( `Model load failed: ${ e2.message }`, 'err' );
		state.chat = null;

	}

} );

