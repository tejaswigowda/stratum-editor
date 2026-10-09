// Minimal offline shell cache. Bump CACHE when shipped assets change.
// svg-dom is now consumed from the standalone https://github.com/tejaswigowda/svg-dom
// repo via jsDelivr CDN, so it's fetched over the network (browser HTTP cache
// only) rather than precached here — this SW has no runtime-caching path.
const CACHE = 'stratum-v11';
const SHELL = [
	'./', './index.html', './style.css', './app.js', './manifest.json',
	'./ai/model.js', './ai/nlEditing.js', './ai/generate.js',
	'./ui/selection.js', './ui/outliner.js', './ui/properties.js', './ui/gizmo.js', './ui/shell.js',
];


self.addEventListener( 'install', ( event ) => {

	event.waitUntil( caches.open( CACHE ).then( ( cache ) => cache.addAll( SHELL ) ) );
	self.skipWaiting();

} );

self.addEventListener( 'activate', ( event ) => {

	event.waitUntil(
		caches.keys().then( ( keys ) => Promise.all( keys.filter( ( k ) => k !== CACHE ).map( ( k ) => caches.delete( k ) ) ) )
	);
	self.clients.claim();

} );

self.addEventListener( 'fetch', ( event ) => {

	if ( event.request.method !== 'GET' ) return;
	event.respondWith(
		caches.match( event.request ).then( ( cached ) => cached || fetch( event.request ) )
	);

} );
