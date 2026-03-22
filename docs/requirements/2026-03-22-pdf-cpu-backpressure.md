# PDF CPU Backpressure Requirement

Goal: reduce CPU spikes in the rebuilt PDF reader by controlling page.render raster scale and adjacent-page prerender policy.

Constraints:
- Keep JPEG with PNG fallback.
- Do not submit the WebP experiment in this change set.
- Adjacent prerender is conservative: next page only, no chain prerender.
- Cancellation uses clearTimeout plus a pending flag.

Acceptance Criteria:
- Many common cases stay at render scale 1.0.
- The provider only prerenders the next page after a 450ms idle window.
- If the latest foreground render exceeds 180ms, adjacent prerender is skipped.
- Any queued prerender is canceled when new foreground page work starts.