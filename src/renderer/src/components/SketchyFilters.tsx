/**
 * Hidden SVG filter definitions for Sketchy Mode (hand-drawn overlay).
 *
 * Uses feTurbulence + feDisplacementMap to make edges appear wobbly/organic.
 * Three intensity presets are provided:
 *
 *   - #sketchy-subtle  — scale=2, for whole-element wobble (buttons, badges).
 *                         Text stays readable; edges dance gently.
 *   - #sketchy-medium  — scale=3, for container border pseudo-elements.
 *   - #sketchy-border  — scale=4, strongest wobble for standalone borders.
 *
 * Mount once at the app root. The SVG is visually hidden but its filters are
 * referenced by CSS rules scoped to [data-sketchy] (the sketchy mode overlay
 * attribute, independent of which color theme is active).
 */
export function SketchyFilters() {
  return (
    <svg aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <defs>
        {/* Subtle wobble — whole-element, keeps text readable */}
        <filter id="sketchy-subtle" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="turbulence" baseFrequency="0.03" numOctaves={4} seed={15} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={2} xChannelSelector="R" yChannelSelector="G" />
        </filter>

        {/* Medium wobble — border pseudo-elements on containers */}
        <filter id="sketchy-medium" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="turbulence" baseFrequency="0.025" numOctaves={3} seed={42} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={3} xChannelSelector="R" yChannelSelector="G" />
        </filter>

        {/* Strong wobble — standalone border decoration */}
        <filter id="sketchy-border" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="turbulence" baseFrequency="0.04" numOctaves={4} seed={7} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={4} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}
