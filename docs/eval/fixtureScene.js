// ── eval/fixtureScene.js — the ONE scene shared by the demo shell and the eval ──
// Single source of truth so eval fixtures always match what a user actually sees.
// Classes are deliberately DISTINCT (wheel vs rim) so ground-truth selectors for
// the eval are unambiguous — a confound-free fixture, per the eval's own honesty
// gate ("fixtures must exercise real cases, not be too easy OR accidentally vague").

export const DEMO_SVG = `
<svg id="scene" xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
	<g id="car">
		<rect class="body" x="60" y="140" width="240" height="80" rx="10" fill="#3b82f6"/>
		<rect class="roof" x="120" y="90" width="120" height="60" rx="8" fill="#60a5fa"/>
		<circle class="wheel front" cx="120" cy="230" r="28" fill="#111111"/>
		<circle class="wheel back" cx="280" cy="230" r="28" fill="#111111"/>
		<circle class="rim front" cx="120" cy="230" r="10" fill="#999999"/>
		<circle class="rim back" cx="280" cy="230" r="10" fill="#999999"/>
	</g>
	<path id="path1847" d="M380 60 L400 100 L360 100 Z" fill="#eab308"/>
</svg>`.trim();
