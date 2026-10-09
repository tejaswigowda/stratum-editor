// ── ai/model.js — model-agnostic chat providers (sovereign by default) ────────
//
// Mirrors Strata's model-agnostic principle: on-device WebLLM by default, or any
// external API (OpenAI, Anthropic, Ollama, or a custom OpenAI-compatible
// endpoint) through a bring-your-own-key `fetchAPI`-style path. Both reduce to
// the same shape: an async chat(messages) -> string function. Nothing leaves
// the device unless the user explicitly picks the API path. Never silently
// escalates from local to remote.

const WEBLLM_CDN = 'https://esm.run/@mlc-ai/web-llm@0.2.84'; // pinned: matches config.ts's modelVersion "v0_2_84/base"
const MAX_VRAM_MB = 8 * 1024; // cap the catalog at 8GB — bigger models aren't realistic for most on-device GPUs

/**
 * The full WebLLM model catalog (chat/LLM entries only — embedding and
 * vision-language entries are excluded, they don't speak the chat(messages)
 * shape this app uses — and capped at MAX_VRAM_MB). Model ids already encode
 * quantization+format (e.g. "-q4f16_1-"); size is the real
 * `vram_required_MB` from the library, never guessed.
 * @returns {Promise<Array<{id:string, label:string, vramMB:number}>>}
 */
export async function listWebLLMModels() {

	const { prebuiltAppConfig } = await import( WEBLLM_CDN );
	return prebuiltAppConfig.model_list
		.filter( ( m ) => ! m.model_type ) // omitted/0 == ModelType.LLM; embedding/VLM set it explicitly (1/2)
		.filter( ( m ) => ( m.vram_required_MB || 0 ) <= MAX_VRAM_MB )
		.map( ( m ) => ( {
			id: m.model_id,
			label: `${ m.model_id.replace( /-MLC.*$/, '' ) } — ${ ( m.vram_required_MB / 1024 ).toFixed( 1 ) }GB VRAM`,
			vramMB: m.vram_required_MB || 0,
		} ) )
		.sort( ( a, b ) => a.vramMB - b.vramMB );

}

/**
 * Load a small on-device model via WebLLM (WebGPU). Downloads weights once,
 * caches in browser storage. Requires Chrome 113+ / WebGPU.
 * @param {string} modelId   an MLC model id, e.g. "Qwen2.5-1.5B-Instruct-q4f16_1-MLC"
 * @param {(status:string)=>void} [onProgress]
 * @returns {Promise<function(Array):Promise<string>>} chat(messages) -> reply text
 */
export async function loadWebLLM( modelId, onProgress ) {

	if ( ! navigator.gpu ) throw new Error( 'WebGPU not available in this browser — WebLLM needs Chrome 113+' );

	const { CreateMLCEngine } = await import( WEBLLM_CDN );
	const engine = await CreateMLCEngine( modelId, {
		initProgressCallback: ( p ) => { if ( onProgress ) onProgress( p.text || 'loading model…' ); },
	} );

	return async ( messages ) => {

		const reply = await engine.chat.completions.create( { messages, temperature: 0 } );
		return reply.choices[ 0 ].message.content;

	};

}

/** Per-provider defaults, mirroring Strata's model-agnostic provider list. */
export const API_PROVIDERS = {
	openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', needsKey: true },
	anthropic: { label: 'Anthropic (Claude)', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-haiku-20241022', needsKey: true },
	ollama: { label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', needsKey: false },
	custom: { label: 'Custom (OpenAI-compatible)', baseUrl: '', model: '', needsKey: true },
};

/**
 * List the models an external API actually has available — step 2 of the
 * connect flow, once a base URL (+ key) is in hand. Anthropic's /models has
 * its own shape; OpenAI/Ollama/custom share the OpenAI-compatible shape.
 * @param {{provider:string, baseUrl:string, apiKey:string}} cfg
 * @returns {Promise<Array<{id:string, label:string}>>}
 */
export async function listApiModels( { provider, baseUrl, apiKey } ) {

	const base = baseUrl.replace( /\/+$/, '' );

	if ( provider === 'anthropic' ) {

		const res = await fetch( base + '/models', {
			headers: {
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01',
				'anthropic-dangerous-direct-browser-access': 'true',
			},
		} );
		if ( ! res.ok ) throw new Error( `API error ${ res.status }: ${ await res.text() }` );
		const data = await res.json();
		return ( data.data || [] ).map( ( m ) => ( { id: m.id, label: m.display_name || m.id } ) );

	}

	const res = await fetch( base + '/models', {
		headers: { ...( apiKey ? { Authorization: `Bearer ${ apiKey }` } : {} ) },
	} );
	if ( ! res.ok ) throw new Error( `API error ${ res.status }: ${ await res.text() }` );
	const data = await res.json();
	return ( data.data || [] ).map( ( m ) => ( { id: m.id, label: m.id } ) );

}

/**
 * Wrap an external chat API. `provider: 'anthropic'` speaks Anthropic's native
 * /messages shape (different auth header + response shape); every other
 * provider (openai, ollama, custom) speaks the OpenAI-compatible
 * /chat/completions shape. Key stays in tab memory only, never persisted.
 * @param {{provider:string, baseUrl:string, apiKey:string, model:string}} cfg
 * @returns {function(Array):Promise<string>}
 */
export function loadApiModel( { provider, baseUrl, apiKey, model } ) {

	const base = baseUrl.replace( /\/+$/, '' );

	if ( provider === 'anthropic' ) {

		const url = base + '/messages';
		return async ( messages ) => {

			const system = messages.find( ( m ) => m.role === 'system' );
			const rest = messages.filter( ( m ) => m.role !== 'system' );
			const res = await fetch( url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': apiKey,
					'anthropic-version': '2023-06-01',
					'anthropic-dangerous-direct-browser-access': 'true',
				},
				body: JSON.stringify( { model, system: system ? system.content : undefined, messages: rest, max_tokens: 1024, temperature: 0 } ),
			} );

			if ( ! res.ok ) throw new Error( `API error ${ res.status }: ${ await res.text() }` );
			const data = await res.json();
			return data.content[ 0 ].text;

		};

	}

	const url = base + '/chat/completions';
	return async ( messages ) => {

		const res = await fetch( url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...( apiKey ? { Authorization: `Bearer ${ apiKey }` } : {} ),
			},
			body: JSON.stringify( { model, messages, temperature: 0 } ),
		} );

		if ( ! res.ok ) throw new Error( `API error ${ res.status }: ${ await res.text() }` );
		const data = await res.json();
		return data.choices[ 0 ].message.content;

	};

}
