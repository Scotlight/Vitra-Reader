# PDF CPU Backpressure Design

Chosen approach: adaptive foreground scale + conservative next-page-only prerender backpressure.

Render Scale Policy:
- Default to 1.0.
- Promote to 1.15 or 1.3 only when DPR, base page footprint, and previous foreground render duration all allow it.

Prerender Policy:
- Next page only.
- Wait 450ms idle before scheduling.
- Cancel pending prerender on new foreground work via clearTimeout and pending-page flag.
- Skip prerender when latest foreground render exceeds 180ms or another render is pending.