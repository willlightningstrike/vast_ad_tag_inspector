// Drives the real page in headless Chrome, opened from file:// (no server).
// Skipped when Chrome is not installed; set CHROME_PATH to use another binary.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const skip = fs.existsSync(CHROME) ? false : 'Google Chrome not found (set CHROME_PATH)';
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const LONG_ATTR = 'a'.repeat(400);
const LONG_HTML = '<div>' + 'x'.repeat(200) + '</div>';
const INPUTS = {
  google: read('docs', 'samples', 'google-single-inline-linear-vast3.xml'),
  vast4: read('test', 'fixtures', 'vast4.xml'),
  malformed: read('test', 'fixtures', 'malformed.xml'),
  pod: '<VAST version="3.0"><Ad id="61150959.140171158085632" sequence="1"><InLine><Creatives><Creative id="c1"><Linear/></Creative></Creatives></InLine></Ad>'
    + '<Ad id="61150990.140171158085000"><InLine><Creatives><Creative id="c2"><Linear/></Creative></Creatives></InLine></Ad>'
    + '<Ad id="w"><Wrapper fallbackOnNoAd="true"><VASTAdTagURI>https://t.example/v</VASTAdTagURI></Wrapper></Ad></VAST>',
  escaped: '<VAST version="3.0"><Ad id="a&quot;b"><InLine><Error>https://t.example/e?a=1&amp;b=2</Error></InLine></Ad></VAST>',
  verification: `<VAST version="4.1"><Ad id="v"><InLine><AdVerifications><Verification vendor="x">
    <VerificationParameters>${'a'.repeat(80)}Z</VerificationParameters></Verification></AdVerifications></InLine></Ad></VAST>`,
  repaired: 'HTTP/1.1 200 OK\n<xml><vmap:VMAP version="1.0"><vmap:AdBreak timeOffset="start" breakId="pre"><vmap:AdSource>'
    + '<vmap:AdTagURI templateType="vast3"><![CDATA[https://ads.example/tag]]></vmap:AdTagURI></vmap:AdSource></vmap:AdBreak></vmap:VMAP></xml>',
  long: `<VAST version="4.0"><Ad id="a" data="${LONG_ATTR}"><InLine><Creatives><Creative id="c"><NonLinearAds>
    <NonLinear width="1" height="1"><HTMLResource><![CDATA[${LONG_HTML}]]></HTMLResource></NonLinear>
    </NonLinearAds></Creative></Creatives></InLine></Ad></VAST>`,
};

// Runs inside the page; writes a JSON report into <pre id="report">.
async function driver(INPUTS) {
  const R = { errors: window.__errors };
  const report = () => {
    const pre = document.createElement('pre');
    pre.id = 'report';
    pre.hidden = true;
    pre.textContent = JSON.stringify(R);
    document.body.appendChild(pre);
  };
  try {
    await steps();
  } catch (e) {
    R.fatal = String(e && e.stack ? e.stack : e);
  }
  report();

  async function steps() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const copied = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { copied.push(t); } } });
  window.alert = () => { R.alerted = true; };
  const type = (sel, value) => { $(sel).value = value; $(sel).dispatchEvent(new Event('input')); };

  type('#url-input', 'https://ads.example.com/vast?iu=%2F1234%2Fvideo&sz=640x480&env=instream&correlator=1');
  const headers = () => $$('table.checks thead th').map((th) => th.textContent);
  R.headersWithoutCsv = headers();
  const dt = new DataTransfer();
  dt.items.add(new File(['key,expected_value,unexpected_value\niu,/1234/video\nenv,vp\nvpos\nsz,,480\nvast_ver,,2\n'], 'expected.csv', { type: 'text/csv' }));
  $('#csv-input').files = dt.files;
  $('#csv-input').dispatchEvent(new Event('change'));
  await wait(100);
  R.url = {
    endpoint: $('.endpoint code').textContent,
    counts: $$('.counts .count').map((c) => c.textContent),
    file: $('.file-status').textContent,
    headers: headers(),
    rows: $$('table.checks tbody tr').map((r) => [r.className, ...[...r.cells].map((c) => c.textContent)]),
  };

  // CSV reads that finish out of order, or after Clear, must not win (bug #2).
  const RealFileReader = window.FileReader;
  // The stub finishes reads synchronously with known text: a real Blob read is not reliably
  // waited for by headless Chrome's virtual clock.
  const pending = [];
  const contents = {};
  window.FileReader = class { readAsText(file) { pending.push({ file, reader: this }); } };
  const choose = (name, text) => {
    contents[name] = text;
    const t = new DataTransfer();
    t.items.add(new File([text], name, { type: 'text/csv' }));
    $('#csv-input').files = t.files;
    $('#csv-input').dispatchEvent(new Event('change'));
  };
  const finish = (i) => { const p = pending[i]; p.reader.result = contents[p.file.name]; p.reader.onload(); };
  choose('A.csv', 'env,instream');
  choose('B.csv', 'env,vp');
  finish(1);
  finish(0);
  R.race = { afterOutOfOrder: $('.file-status').textContent };
  choose('C.csv', 'env,x');
  $('.file-row .link-button').click();
  finish(2);
  R.race.afterClear = $('.file-status').textContent;
  window.FileReader = RealFileReader;

  $('#tab-vast').click();
  R.vastTabShown = !$('#panel-vast').hidden && $('#panel-url').hidden;

  const paste = async (xml) => { type('#vast-input', xml); await wait(400); };
  await paste(INPUTS.google);
  R.google = {
    tiles: $$('.tiles li').map((li) => [li.querySelector('span').textContent, li.querySelector('b').textContent]),
    creativeIds: $$('table.creatives tbody tr').map((r) => r.cells[5].textContent),
    roles: $$('table.creatives tbody tr').map((r) => r.cells[4].textContent),
    headers: $$('table.creatives thead th').map((th) => th.textContent),
    singleUrlLabels: $$('table.trackers td.urls > .where').map((w) => getComputedStyle(w).display),
  };
  $('.section-actions .copy').click();
  await wait(50);
  R.google.copiedFormatted = copied.pop() || '';

  await paste(INPUTS.vast4);
  R.vast4 = { scriptsInResults: $$('.results script').length, htmlShownAsText: $('.xml-view').textContent.includes('<script>alert(1)</script>') };
  const lines = (td) => { const r = document.createRange(); r.selectNodeContents(td); return [td.textContent, r.getClientRects().length]; };
  R.vast4.mediaWordLines = $$('table.media tbody tr').flatMap((tr) => [2, 4, 5, 6].map((i) => lines(tr.cells[i])));

  await paste(INPUTS.long);
  const summary = $('.xml-view details details summary');
  R.long = {
    summaryOverflows: summary.scrollWidth > summary.clientWidth + 1,
    pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    shownUrl: $('table.media td.urls code').textContent,
  };
  $('table.media .copy').click();
  await wait(50);
  R.long.copiedResource = copied.pop() || '';

  await paste(INPUTS.pod);
  R.pod = {
    tiles: $$('.tiles li').map((li) => [li.querySelector('span').textContent, li.querySelector('b').textContent]),
    rows: $$('table.creatives tbody tr').map((r) => [r.cells[1].textContent, r.cells[3].textContent, r.cells[4].textContent, r.cells[8].textContent]),
  };

  await paste(INPUTS.escaped);
  R.escaped = $('.xml-view').textContent;

  await paste(INPUTS.verification);
  const showAll = $('table.verification .toggle');
  const paramText = () => $('table.verification tbody td:nth-child(5) code').textContent;
  R.verification = { before: paramText() };
  showAll.click();
  R.verification.expanded = paramText();
  R.verification.button = showAll.textContent;
  showAll.click();
  R.verification.collapsed = paramText();

  await paste(INPUTS.repaired);
  R.repaired = {
    kind: $('table.creatives tbody tr').cells[9].textContent,
    notes: $$('.notice.note').map((n) => n.textContent),
    format: $('.tiles li b').textContent,
    position: $('table.creatives tbody tr').cells[1].textContent,
    firstLine: $('.xml-view summary').textContent,
  };

  await paste(INPUTS.malformed);
  R.malformed = $('.notice.error') ? $('.notice.error').textContent : null;
  }
}

function runPage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adi-ui-'));
  try {
    const base = 'file://' + ROOT + '/';
    const json = JSON.stringify(INPUTS).replace(/</g, '\\u003c');
    const code = String(driver).replace(/<\/script/gi, '<\\/script');
    const html = read('index.html')
      .replace(/(src|href)="(js|css)\//g, `$1="${base}$2/`)
      .replace('<head>', () => "<head><script>window.__errors=[];addEventListener('error',e=>__errors.push(e.message));</script>")
      .replace('</body>', () => `<script>(${code})(${json});</script></body>`);
    const page = path.join(dir, 'harness.html');
    fs.writeFileSync(page, html);
    const dom = execFileSync(CHROME, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${path.join(dir, 'profile')}`, '--allow-file-access-from-files',
      '--window-size=900,800', '--virtual-time-budget=20000', '--dump-dom', 'file://' + page,
    ], { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] });
    const m = /<pre id="report"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
    if (!m) throw new Error('page produced no report');
    const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    return JSON.parse(unescape(m[1]));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

let R;
test.before(() => { if (!skip) R = runPage(); });

test('page loads without script errors', { skip }, () => {
  assert.equal(R.fatal, undefined);
  assert.deepEqual(R.errors, []);
});

test('url tab checks parameters against the csv', { skip }, () => {
  assert.equal(R.url.endpoint, 'https://ads.example.com/vast');
  assert.deepEqual(R.headersWithoutCsv, ['Parameter', 'In URL', 'Expected (CSV)', 'Result']);
  assert.deepEqual(R.url.headers, ['Parameter', 'In URL', 'Expected (CSV)', 'Unexpected (CSV)', 'Result']);
  assert.deepEqual(R.url.counts, ['2 match', '3 problems', '1 not checked']);
  assert.equal(R.url.file, 'expected.csv · 5 expected parameters');
  assert.deepEqual(R.url.rows, [
    ['status-missing', 'vpos', '—', 'any value', '—', '✗ parameter missing'],
    ['status-unexpected', 'sz', '640x480', 'any value', '480', '✗ unexpected value'],
    ['status-differs', 'env', 'instream', 'vp', '—', '✗ value differs'],
    ['status-match', 'iu', '/1234/video', '/1234/video', '—', '✓'],
    ['status-absent', 'vast_ver', '—', 'any value', '2', '✓ not present'],
    ['status-not-checked', 'correlator', '1', '—', '—', 'not checked'],
  ]);
});

test('vast tab shows the google sample summary', { skip }, () => {
  assert.equal(R.vastTabShown, true);
  assert.deepEqual(R.google.tiles, [
    ['Format', 'VAST 3.0'], ['Ads', '1'], ['Creatives', '2'], ['Trackers', '26'], ['Media files', '6'],
  ]);
  assert.deepEqual(R.google.headers, ['Position', 'Ad id', 'Ad type', 'Ad sequence', 'Ad role', 'Creative id', 'AdID', 'Universal Ad ID', 'Kind', 'Duration']);
  assert.deepEqual(R.google.roles, ['Standalone', 'Standalone']);
  assert.equal(R.google.creativeIds.length, 2);
  assert.equal(R.google.creativeIds[0], '138381721867');
  assert.ok(R.google.copiedFormatted.startsWith('<VAST'));
  assert.ok(R.google.copiedFormatted.includes('\n  <Ad id="5925573263">'));
});

test('a single tracker URL shows its ad label on its own line', { skip }, () => {
  assert.ok(R.google.singleUrlLabels.length > 0);
  assert.ok(R.google.singleUrlLabels.every((d) => d === 'block'), R.google.singleUrlLabels.join());
});

test('pasted script is shown as text and never runs', { skip }, () => {
  assert.equal(R.alerted, undefined);
  assert.equal(R.vast4.scriptsInResults, 0);
  assert.equal(R.vast4.htmlShownAsText, true);
});

test('media kind, delivery, size and bitrate are never split mid-word', { skip }, () => {
  assert.ok(R.vast4.mediaWordLines.length > 0);
  assert.deepEqual(R.vast4.mediaWordLines.filter(([, n]) => n !== 1), []);
});

test('long attributes wrap inside the formatted view', { skip }, () => {
  assert.equal(R.long.summaryOverflows, false);
  assert.equal(R.long.pageOverflows, false);
});

test('html resource copy button copies the full resource', { skip }, () => {
  assert.equal(R.long.shownUrl, LONG_HTML.slice(0, 120) + '…');
  assert.equal(R.long.copiedResource, LONG_HTML);
});

test('pod, fallback and fallbackOnNoAd are labelled', { skip }, () => {
  assert.deepEqual(R.pod.tiles, [
    ['Format', 'VAST 3.0'], ['Ads', '3'], ['Pod ads', '1'], ['Fallback ads', '2'], ['Creatives', '2'], ['Trackers', '0'], ['Media files', '0'],
  ]);
  assert.deepEqual(R.pod.rows, [
    ['61150959.140171158085632', '1', 'Pod #1', 'Linear'],
    ['61150990.140171158085000', '—', 'Fallback', 'Linear'],
    ['w', '—', 'Fallback', 'Wrapper → VASTAdTagURI (not fetched)fallbackOnNoAd: truehttps://t.example/vCopy'],
  ]);
});

test('a slower, older CSV read never replaces a newer file or a Clear (bug #2)', { skip }, () => {
  assert.equal(R.race.afterOutOfOrder, 'B.csv · 1 expected parameter');
  assert.equal(R.race.afterClear, '');
});

test('formatted view shows XML escapes, not decoded characters (bug #7)', { skip }, () => {
  assert.ok(R.escaped.includes('id="a&quot;b"'), R.escaped);
  assert.ok(R.escaped.includes('https://t.example/e?a=1&amp;b=2'), R.escaped);
});

test('show all expands an 81-character verification parameter (bug #10)', { skip }, () => {
  const full = 'a'.repeat(80) + 'Z';
  assert.equal(R.verification.before, 'a'.repeat(80) + '…');
  assert.equal(R.verification.expanded, full);
  assert.equal(R.verification.button, 'Show less');
  assert.equal(R.verification.collapsed, 'a'.repeat(80) + '…');
});

test('repaired input is reported and still broken down', { skip }, () => {
  assert.equal(R.repaired.kind, 'Ad tag (not fetched)https://ads.example/tagCopy');
  assert.deepEqual(R.repaired.notes, [
    'Ignored text before the XML: "HTTP/1.1 200 OK"',
    'Added the missing namespace declaration for the "vmap:" prefix.',
    'Found <vmap:VMAP> inside <xml>.',
  ]);
  assert.equal(R.repaired.format, 'VMAP 1.0');
  assert.equal(R.repaired.position, 'Preroll');
  assert.match(R.repaired.firstLine, /^<xml>/);
});

test('malformed xml shows the error with its location', { skip }, () => {
  assert.match(R.malformed, /^XML error \(line \d+, column \d+\): /);
});
