# Design QA

## Reference

- Source image: the user-provided 2026-07-28 popup reference screenshot
- Rendered implementation: `methodology/implementation-popup-final.png`
- Side-by-side comparison: `methodology/design-qa-comparison.png`
- Desktop viewport: 1440 × 1000 CSS pixels at browser device scale
- Mobile viewport: 390 × 844 CSS pixels at browser device scale
- Verified state: 35 minutes, Driving, Estimated rent height, Columbia destination

## Comparison

The screenshot established the map perspective, destination marker, and popup
placement, but its white popup and pale text were the legibility problem named
by the user. The explicit dark-glass requirement therefore supersedes the
source popup's color treatment.

The implementation preserves the rounded floating card and anchored map
context while replacing the opaque white panel with smoked translucent glass,
a fine white edge, inner highlights, a soft shadow, and white text. The popup
also separates travel mode, neighborhood, commute time, estimated gross rent,
and residential-unit context into a readable hierarchy.

## Required surfaces

- Analysis View contains exactly Subway, Driving, and Walking.
- Scheduled service controls only appear for Subway.
- Bar Height is a separate control outside Analysis View.
- Bar Height offers Time remaining and Estimated rent.
- Estimated rent changes both extrusion color and height while the commute
  threshold continues to control which homes are visible.
- Desktop and mobile controls remain fully visible without horizontal overflow.
- The popup is deep glass with white text and remains readable over light and
  dark portions of the map.
- URL state preserves travel mode and bar-height mode.

## Iteration history

1. Replaced the original white popup with a dark translucent glass surface and
   added explicit mode, rent, and housing-unit labels.
2. Corrected the popup selectors to support the MapLibre classes used by the
   current map runtime.
3. Increased popup width, padding, and type size; changed the time and rent
   values from accent colors to white to match the final direction.
4. Verified the three travel modes and independent rent-height control at
   desktop and mobile breakpoints.

## Final result

passed
