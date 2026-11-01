# Updating for new VAST and VMAP versions

How to keep the VAST / VMAP tab current when IAB Tech Lab publishes a new spec.

## What already works with a future version

- **No version gate.** Nothing in the code checks the version number. A `<VAST version="4.3">` or `version="5.0"` response loads today; the number is only displayed in the summary tile.
- **The formatted view shows everything.** It renders any XML, so new elements are visible there even before the breakdown tables know about them.
- **New tracking events need no change.** Any `<Tracking event="…">` is listed in the Trackers table under its own event name.
- **Namespaces don't matter.** Elements are matched by name, ignoring namespace, so a new namespace URL doesn't break parsing.

## What needs a code change, and where

Names below are in [js/vast.js](../js/vast.js) unless another file is given. Search for the name rather than relying on line numbers.

| If the new spec… | Change |
|---|---|
| adds a click or tracker element (like `ClickTracking`) | add its name to `CLICK_TRACKERS` |
| adds an impression-type element (like `Viewable`) | the `['Viewable', 'NotViewable', 'ViewUndetermined']` list in `extractVast` |
| adds a companion or non-linear resource type | `RESOURCES` |
| adds a media element (like `Mezzanine`) | a `mediaRow(...)` call next to the `MediaFile` and `Mezzanine` ones in `extractVast` |
| changes creative IDs (like `UniversalAdId` in 4.1) | `universalAdId`, and the creative row fields in `extractVast` |
| changes ad verification | the `Verification` loop at the end of `extractVast` (`JavaScriptResource`, `ExecutableResource`) |
| renames or moves an element | accept both names, the way VMAP accepts `VASTAdData` or the older `VASTData` in `buildReport` in [js/report.js](../js/report.js) |
| is a new VMAP version | the `AdBreak` loop in `buildReport` in [js/report.js](../js/report.js) |
| restructures the document (for example, no more `<Creatives>`) | a larger change to `extractVast` |

Also update:

- the hint "VAST 2, 3, 4 and VMAP 1.0 are detected automatically" in `initVastTab` in [js/vast-tab.js](../js/vast-tab.js)
- the VAST and VMAP support table in [README.md](../README.md)

## Steps for each spec update

1. **Get a sample response** for the new version. IAB Tech Lab publishes official samples with each spec, or use one from your ad server. Save it in `test/fixtures/`.
2. **Write the test first.** Add a test to [test/vast.test.js](../test/vast.test.js) (or [test/report.test.js](../test/report.test.js) for VMAP) that loads the sample and asserts what should appear: the new tracker type, media row or ID. Run `npm test` and watch it fail.
3. **Change the code** using the table above. Run `npm test` until everything passes, including the browser tests in [test/ui.test.js](../test/ui.test.js).
4. **Check by eye.** Double-click `index.html`, paste the sample, and look at the tables.

The app must keep working when `index.html` is opened straight from disk: no server, no `fetch`, no ES modules, and nothing loaded from a CDN. Each `js/` file attaches itself to `window.AdInspector` and is loaded by a plain `<script>` tag in [index.html](../index.html).

## Doing it with Claude

Paste the "what's new" section of the spec, or just a sample response, and ask "add VAST 4.x support". The steps above are the process to follow.
