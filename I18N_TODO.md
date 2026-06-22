# Ran Theme i18n Todo

Goal: add complete, high-quality `zh-CN` and `en-US` internationalization support first, with an architecture that can add more locales later without rewiring UI code.

## Tasks

- [x] 1. Create this tracked i18n implementation todo list.
- [x] 2. Add typed i18n foundations, locale detection, persisted language preference, formatters, and theme configuration defaults.
- [x] 3. Localize the app shell and shared UI: navigation, topbar, footer, theme/version controls, error states, and the language switcher.
- [x] 4. Localize core monitoring surfaces: overview dashboards, node lists, node cards/tables, node detail drawer/side panel, and status panels.
- [x] 5. Localize secondary surfaces and generated text: traffic, billing, hub, map app, visitor alert, recent events, regions, billing cycles, and summaries.
- [x] 6. Run full QA, remove user-facing hardcoded leftovers where appropriate, update documentation, and verify builds.

## Acceptance Checks

- [x] `npm run build` passes.
- [x] Users can switch between Simplified Chinese and English from the UI.
- [x] Language preference persists across reloads.
- [x] Browser language detection and theme default locale work when no user preference exists.
- [x] Dates, numbers, relative times, billing cycles, and status labels use locale-aware formatting.
- [x] The main app and map entry both use the same i18n behavior.
