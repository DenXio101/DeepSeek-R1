# Stage 7 — Structural (lines 1–228)
1. **Blocker** L171–173 — Alternative F has no Pros/Cons. → Same template; name the displaced target and the 320 px cost.
2. **Major** L145–173 — every rejection says "Rejected by author" + unlinked brief D#. → State the technical reason directly; link `[D2](concepts_brief.md#…)`.
3. **Major** L185,199 — Risks & Tolerances are H3 under NFR; "and" vs "&". → `## Risks & Mitigations`; Tolerances as its own H2 or H3 under NFR.
4. **Major** L215,221 — Additional Resources / Future Improvements nested under NFR. → Promote to H2 (or move Future Improvements next to Non-Goals).
5. **Major** L22–26,28,37,78 — headings don't match the standard ("The Problem", "Technical Plan (Architecture)", split Goals/Non-Goals); solution paragraph inside the problem. → `## Problem Statement`, `## Proposed Architecture`, decide goals layout; move "Proposed solution" to Overview.
6. **Major** L48–50,193,196–197 — Phase 0/2/4/5 cited but no phase list in the feature range. → Add `## Implementation Plan` summary (phases + exit gates) or state gates in place.
7. **Major** L187–197 — row 192 "Not possible" is an invariant not a risk; no security/supply-chain or scale rows. → Delete row 192 (note elsewhere); add licence/dependency-integrity and 8-entry-cap rows with likelihood/impact.
8. **Nit** L133,106–108 — Diagnostics and the play gate buried. → Own H3s: "Diagnostics", "Engine change: play gate".
9. **Nit** L6,90,217–219 — no real links. → Relative links; package README URL.
10. **Nit** L8,175,213,227,46 — inconsistent horizontal rules, trailing rule; Open Questions placement. → Rules between every H2 or none; move Open Questions before Alternatives or to the end.
