# Traffic Analytics Todo

> Goal: turn `/traffic` into a real range-based traffic analytics workspace for all VPS, one VPS, or selected VPS comparisons.

## Status

- [x] 1. Create the implementation todo list and commit the baseline plan.
- [x] 2. Add a Komari backend traffic analytics service/API that supports all nodes, selected nodes, today/3d/7d/custom ranges, bucketed series, reset detection, and data quality metadata.
- [ ] 3. Add backend unit/API tests for traffic delta calculation, counter resets, selected-node filtering, and public hidden-node visibility.
- [ ] 4. Add theme API types and a traffic analytics hook with graceful fallback/error states.
- [ ] 5. Rebuild the `/traffic` page around range presets, custom date range, all/single/multi-node comparison, summary cards, trend charts, and sortable per-node analytics.
- [ ] 6. Add i18n copy and responsive polish for the new traffic analytics workflow.
- [ ] 7. Run final cross-repo verification, review the implementation, and mark all tasks complete.

## Implementation Notes

- Prefer server-side traffic aggregation over browser-side raw-history fanout.
- Use `net_total_up` / `net_total_down` deltas as the primary source.
- Detect counter resets when cumulative totals decrease, then start a new segment instead of producing negative usage.
- Fall back to `net_out` / `net_in` rate integration only when cumulative totals are unavailable or unusable.
- Include data-quality metadata so the UI can explain partial coverage, resets, and estimated values.
- Preserve existing public visibility rules: anonymous visitors must not see hidden nodes.
