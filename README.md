# VAST Ad Tag & Response Inspector

A small browser tool for ad operations and video ad QA. It has two tabs:

- **VAST ad tag URL:** paste a long, one-line ad tag URL and see every query parameter on its own row. Upload a CSV of the parameters and values you expect, and the tool points out anything missing, different or unwanted.
- **VAST / VMAP:** paste a VAST 2, 3 or 4 response, or a VMAP response, and see it formatted like a browser shows XML. Below it is a breakdown of the ads, creatives, ad pod and fallback ads, trackers, media files and ad verification.

It is plain HTML, CSS and JavaScript. **There is nothing to install and no server.** You open `index.html` in a browser and it works, even offline.

**Nothing you paste leaves your computer.** The tool makes no network requests: it doesn't call the ad tag, doesn't follow Wrapper or VMAP ad tag URLs, and loads nothing from the internet.

## Prerequisites

To **use** the tool:

- A current desktop browser. It has been tested in **Google Chrome**. Microsoft Edge, Firefox and Safari use the same standard features and should work, but haven't been tested.

To **run the automated tests** (only needed if you change the code):

- [Node.js](https://nodejs.org/) 20 or newer, which includes `npm`. Development used Node.js 25.
- Google Chrome, for the browser tests. Without it, those tests are skipped and the rest still run.

## Download and run

### Option 1: Download a ZIP (no Git needed)

1. Go to <https://github.com/willlightningstrike/vast_ad_tag_inspector>, click the green **Code** button, then **Download ZIP**.
2. **Extract the ZIP file.** This step matters:
   - **Windows:** right-click the ZIP and choose **Extract All…**. Don't open `index.html` from inside the ZIP window; Windows copies only that one file out, so the page opens unstyled and nothing works, because its `js` and `css` folders are missing.
   - **macOS:** double-click the ZIP. It extracts into a folder next to it.
3. Open the extracted folder, named `vast_ad_tag_inspector-production-release` (GitHub names it after the repository and branch).
4. Double-click **`index.html`**. It opens in your default browser. To use a different browser, right-click `index.html` and choose **Open with**.

Keep `index.html` together with the `css` and `js` folders. You can move or copy the whole folder anywhere, but not `index.html` on its own.

To update to a newer version, download the ZIP again and replace the old folder.

### Option 2: Clone with Git

```bash
git clone https://github.com/willlightningstrike/vast_ad_tag_inspector.git
```

Then open `index.html` from the cloned folder. To update later, run `git pull` in that folder.

## User guide

### VAST ad tag URL tab

1. Paste the ad tag URL into **VAST ad tag URL**. A bare query string (`a=1&b=2`) works too. Surrounding quotes and a trailing comma, as when copying from JSON, are removed.
2. The table lists every parameter with its decoded value. `%2F` is shown as `/`, and `+` as a space.
   - Parameters can be divided by `&` or `;`.
   - `&amp;`, as in URLs copied from XML, is treated as `&`.
   - A parameter with no value shows as `(empty)`.
3. Optionally click **Choose CSV file** to check the URL against what you expect. Results update straight away. You can paste a new URL without choosing the CSV again.

#### CSV format

One parameter per line. Up to three columns: `parameter, expected value, unexpected value`.

```csv
key,expected_value,unexpected_value
iu,/21775744923/external/single_ad_samples
sz,640x480
output,vast
vpos
env,vp,instream
cust_params,,linear
ciu_szs,"300x250,728x90"
```

| Line | Meaning |
|---|---|
| `sz,640x480` | `sz` must be present with exactly this value |
| `vpos` | `vpos` must be present, with any value |
| `env,vp,instream` | `env` must be `vp`, and is flagged if its value contains `instream` |
| `cust_params,,linear` | flagged if `cust_params` contains `linear`; if `cust_params` isn't in the URL, the line passes |
| `ciu_szs,"300x250,728x90"` | a value that contains a comma must be in double quotes (Excel adds them when saving as CSV) |

Rules:
- **Header row:** an optional first line such as `key,expected_value,unexpected_value` or `parameter,value` is skipped.
- **Case:** names and values are case-sensitive.
- **Expected values** must match exactly. Either the decoded value (`/1234/video`) or the encoded one (`%2F1234%2Fvideo`) works.
- **Unexpected values** are flagged when the parameter's value **contains** them.
- **Repeated names:** if a parameter appears more than once in the URL, a CSV line passes when any occurrence matches.
- **Parameters not in the CSV** are listed as "not checked" and never count as problems.
- **Blank lines** and a byte-order mark at the start of the file are ignored.

#### Results

Problem rows are listed first and highlighted in red:

| Result | Meaning |
|---|---|
| ✗ parameter missing | the CSV lists it, the URL doesn't have it |
| ✗ unexpected value | the value contains the CSV's unexpected value |
| ✗ value differs | present, with a different value |
| ✓ | value matches |
| ✓ present | a name-only CSV line, and the parameter is there |
| ✓ not present | a line with only an unexpected value, and the parameter isn't there |
| not checked | in the URL but not in the CSV |

### VAST / VMAP tab

Paste a VAST or VMAP response. The page updates as you type or paste and shows:

1. **Formatted response:** indented and colour-coded, like a browser shows XML. Click ▾ to fold an element. **Copy formatted** copies the indented XML.
2. **Notes**, if the input needed a repair to be read:
   - text before the XML, such as copied HTTP headers, is skipped
   - a missing `xmlns:vmap` declaration is added
   - a wrapper element such as `<xml>…</xml>` around the VAST or VMAP is looked inside
3. **Summary:**
   - format and version
   - ad breaks (VMAP)
   - ads, plus pod ads and fallback ads when there are any
   - creatives, trackers, media files and verifications
4. **Creatives:** one row per creative.
   - **Position:** Preroll, Midroll or Postroll, from the VMAP `timeOffset`. An offset such as `#2` shows as `Opportunity #2`: it means the second ad opportunity, which can come before the content, so it isn't labelled Midroll. Plain VAST shows "not stated".
   - **Ad and creative IDs:** ad id, creative id, creative `AdID` and Universal Ad ID.
   - **Ad role:**
     - `Pod #n`: an ad with `sequence="n"`
     - `Fallback`: an ad without `sequence` in a response that has pod ads
     - `Standalone`: no ad in the response has a `sequence`
   - **Kind and duration:** Linear, NonLinear or Companion, with the creative's duration.
   - **Wrapper ads** show their `VASTAdTagURI`, which is not fetched, and `fallbackOnNoAd` when it's set.
5. **Trackers / beacons:** every tracking URL, grouped by type, with a copy button. Types include Impression, Error, `Tracking: <event>`, click trackers, viewability, extensions, verification and VMAP break events.
6. **Media files:** MediaFile and Mezzanine, and companion and non-linear resources (Static, IFrame, HTML), with type, size, bitrate, codec and URL.
7. **Ad verification:** vendor, script URL, parameters and verification trackers, for OMID verifications such as IAS and DoubleVerify.

Malformed XML shows the parser's message with its line and column, for example `XML error (line 1, column 31): …`.

## VAST and VMAP support

| Version | Status |
|---|---|
| VAST 2.0 | Supported and tested |
| VAST 3.0 | Supported and tested, including Google Ad Manager responses |
| VAST 4.0 | Supported and tested |
| VAST 4.1 | Supported and tested, on its own and inside VMAP |
| VAST 4.2, 4.3 and later | Loads. Elements shared with 4.1 are broken down; elements new in that version appear only in the formatted view. Not tested. |
| VMAP 1.0 | Supported and tested: inline VAST as XML or CDATA, `AdTagURI` and `CustomAdData` sources, and break tracking events |

The tool never checks the version number, so a newer version is never rejected. See [Updating for a new VAST or VMAP version](#updating-for-a-new-vast-or-vmap-version) for how to add new elements to the breakdown.

## Limitations

- **Nothing is fetched.** Wrapper `VASTAdTagURI` and VMAP `AdTagURI` URLs are shown, not followed, so a wrapper chain isn't unwrapped. Media file URLs aren't checked to see whether they load.
- **Only in the formatted view:** these elements aren't in the breakdown tables, though you can still see them in the formatted response:
  - `AdParameters`, `InteractiveCreativeFile` (SIMID) and `ClosedCaptionFiles`
  - icon images (icon click and view trackers *are* listed)
  - `Pricing`, `AdServingId`, `Category` and `BlockedAdCategories`
  - Wrapper attributes other than `fallbackOnNoAd`
  - VMAP `CustomAdData` content
- **Nested parameters aren't split.** A value such as `cust_params=sample_ct%3Dlinear%26pos%3D1` is shown decoded on one row (`sample_ct=linear&pos=1`), not as separate sub-parameters.
- **A literal `;` inside a URL value** splits the parameter. Values must encode it as `%3B`, which ad servers normally do.
- **Nested CDATA:** VAST wrapped in CDATA inside VMAP must split any inner `]]>` as `]]]]><![CDATA[>`. XML doesn't allow one CDATA block inside another, so every parser rejects the unsplit form.
- **One response at a time.** Nothing is saved, except which tab you had open last.
- **Error wording varies.** XML error messages come from the browser, so their exact wording differs between browsers.

## Running the tests

The tests are only needed if you change the code. Open a terminal in the project folder:

```bash
npm install
```

```bash
npm test
```

`npm install` downloads the one development dependency (`@xmldom/xmldom`, an XML parser for running the tests outside a browser). `npm test` runs:

- unit tests for the URL, CSV, XML, VAST and VMAP logic
- browser tests that open `index.html` in headless Google Chrome straight from disk and use both tabs. No server is started.

The browser tests look for Chrome at its standard macOS location. On Windows or Linux, or for a different Chrome, set `CHROME_PATH` first. Windows example (PowerShell):

```powershell
$env:CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"; npm test
```

Linux example:

```bash
CHROME_PATH=/usr/bin/google-chrome npm test
```

If Chrome isn't found, the browser tests are reported as skipped and the unit tests still run.

## Project structure

```
index.html              the page; open this
css/style.css           all styles, light and dark
js/
  url-params.js         splits an ad tag URL into parameters
  csv.js                reads the expectations CSV
  url-check.js          compares parameters with the CSV
  xml.js                parses and pretty-prints XML, and repairs common problems
  vast.js               reads ads, creatives, trackers, media and verification from a <VAST>
  report.js             builds the VAST / VMAP report, including VMAP breaks
  dom.js                small DOM and clipboard helpers
  url-tab.js            the "VAST ad tag URL" tab
  xml-view.js           the foldable formatted-XML view
  vast-tab.js           the "VAST / VMAP" tab
  app.js                tab switching
test/                   unit tests, browser tests (ui.test.js) and XML fixtures
docs/                   a Google sample response, and the update guide
LICENSE                 MIT license
```

The scripts are plain `<script>` files, not ES modules, because browsers block modules on pages opened from disk. Each file adds its functions to `window.AdInspector`.

## Updating for a new VAST or VMAP version

When IAB Tech Lab publishes a new VAST or VMAP spec, a response in the new version already loads and appears in the formatted view. Work is only needed so that new elements also appear in the breakdown tables.

### What already works without changes

- **Version numbers:** no version is ever rejected, and the number is shown in the summary.
- **Tracking events:** any `<Tracking event="…">`, including new event names, is listed automatically.
- **Namespaces:** elements are matched by name, so a new namespace URL doesn't break parsing.

### Where to change the code

Search for the name given rather than relying on line numbers.

| If the new spec… | Change |
|---|---|
| adds a click or tracker element (like `ClickTracking`) | add its name to `CLICK_TRACKERS` in `js/vast.js` |
| adds an impression-type element (like `Viewable`) | the `['Viewable', 'NotViewable', 'ViewUndetermined']` list in `extractVast` in `js/vast.js` |
| adds a companion or non-linear resource type | `RESOURCES` in `js/vast.js` |
| adds a media element (like `Mezzanine`) | a `mediaRow(...)` call next to the `MediaFile` and `Mezzanine` ones in `extractVast` |
| changes creative IDs (like `UniversalAdId` in 4.1) | `universalAdId`, and the creative row fields in `extractVast` |
| changes ad pods or fallback rules | the `hasPod` and `role` logic at the start of the ad loop in `extractVast` |
| changes ad verification | the `Verification` loop at the end of `extractVast` |
| renames or moves an element | accept both names, the way `buildReport` in `js/report.js` accepts `VASTAdData` or the older `VASTData` |
| is a new VMAP version | the `AdBreak` loop in `buildReport` in `js/report.js` |
| restructures the document (for example, no more `<Creatives>`) | a larger change to `extractVast` |

Also update:
- the hint "VAST 2, 3, 4 and VMAP 1.0 are detected automatically" in `js/vast-tab.js`
- the support table in this README

### Steps

1. **Get a sample response** in the new version. IAB Tech Lab publishes official samples with each spec, or use one from your ad server. Save it in `test/fixtures/`.
2. **Write the test first.** In `test/vast.test.js` (or `test/report.test.js` for VMAP), add a test that loads the sample and checks what should appear: the new tracker type, media row or ID. Run `npm test` and confirm the new test fails.
3. **Change the code** using the table above. Run `npm test` until everything passes, including the browser tests.
4. **Check by eye.** Open `index.html`, paste the sample, and look at the tables.
5. **Keep the no-server rule.** The page must still work when opened straight from disk: no server, no `fetch`, no ES modules and nothing loaded from a CDN. A new `js/` file must also be added as a `<script>` tag in `index.html`, before the files that use it.

[docs/updating-for-new-vast-versions.md](docs/updating-for-new-vast-versions.md) has the same guide.

## License

[MIT](LICENSE). You may use, copy, modify and distribute this tool, including commercially, as long as the copyright and license notice are kept.
