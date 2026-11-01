const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DOMParser } = require('@xmldom/xmldom');
const { parseXml } = require('../js/xml.js');
const { positionFromOffset, buildReport } = require('../js/report.js');

const fixture = (name) => path.join(__dirname, 'fixtures', name);
const SAMPLE = path.join(__dirname, '..', 'docs', 'samples', 'google-single-inline-linear-vast3.xml');
const parseFile = (file) => parseXml(fs.readFileSync(file, 'utf8'), DOMParser);
const report = (file) => buildReport(parseFile(file).doc);

test('positionFromOffset table', () => {
  const cases = {
    start: 'Preroll', '00:00:00': 'Preroll', '00:00:00.000': 'Preroll', '0%': 'Preroll',
    '00:10:00.000': 'Midroll', '50%': 'Midroll', '#2': 'Midroll (#2)',
    end: 'Postroll', '100%': 'Postroll', soon: 'Unknown (soon)',
  };
  for (const [offset, expected] of Object.entries(cases)) {
    assert.equal(positionFromOffset(offset), expected, offset);
  }
});

test('vast report', () => {
  const r = report(SAMPLE);
  assert.equal(r.format, 'VAST');
  assert.equal(r.version, '3.0');
  assert.deepEqual(r.counts, { breaks: 0, ads: 1, podAds: 0, fallbackAds: 0, creatives: 2, trackers: 26, mediaFiles: 6, verifications: 0 });
  assert.equal(r.empty, false);
});

function checkVmap(r) {
  assert.equal(r.format, 'VMAP');
  assert.equal(r.version, '1.0');
  assert.deepEqual(r.vastVersions, ['3.0']);
  assert.equal(r.counts.breaks, 3);
  assert.equal(r.counts.ads, 1);
  assert.equal(r.counts.creatives, 1);
  assert.deepEqual(
    r.creativeRows.map((c) => [c.breakId, c.position, c.creativeId, c.placeholder, c.kind, c.url]),
    [
      ['pre', 'Preroll', 'cp1', false, 'Linear', null],
      ['mid', 'Midroll', null, true, 'Ad tag (not fetched)', 'https://t.example/midtag'],
      ['post', 'Postroll', null, true, 'Custom data (not parsed)', null],
    ]
  );
  const bs = r.trackers.find((t) => t.type === 'VMAP: breakStart');
  assert.equal(bs.breakId, 'pre');
  assert.equal(bs.url, 'https://t.example/bs');
}

test('vmap report', () => {
  checkVmap(report(fixture('vmap.xml')));
});

test('vmap with other prefix', () => {
  checkVmap(report(fixture('vmap-other-prefix.xml')));
});

test('empty vast report', () => {
  const r = report(fixture('empty.xml'));
  assert.equal(r.empty, true);
  assert.equal(r.counts.trackers, 1);
});

test('not vast', () => {
  const r = buildReport(parseXml('<html><body/></html>', DOMParser).doc);
  assert.deepEqual(r, { error: 'Not a VAST or VMAP document (root is <html>)' });
});

test('malformed', () => {
  assert.ok(parseFile(fixture('malformed.xml')).error);
});

const parseStr = (s) => parseXml(s, DOMParser).doc;
const VMAP_NS = 'xmlns:vmap="http://www.iab.net/videosuite/vmap"';
const ONE_AD = '<VAST version="3.0"><Ad id="a1"><InLine><Creatives><Creative id="c1"><Linear><Duration>00:00:05</Duration></Linear></Creative></Creatives></InLine></Ad></VAST>';

test('vmap break with empty VAST keeps a row', () => {
  const r = buildReport(parseStr(`<vmap:VMAP ${VMAP_NS} version="1.0">
    <vmap:AdBreak timeOffset="start" breakId="pre"><vmap:AdSource><vmap:VASTAdData><VAST version="3.0"/></vmap:VASTAdData></vmap:AdSource></vmap:AdBreak>
    <vmap:AdBreak timeOffset="00:10:00" breakId="mid"><vmap:AdSource><vmap:VASTAdData><VAST version="3.0"><Error>https://t.example/e</Error></VAST></vmap:VASTAdData></vmap:AdSource></vmap:AdBreak>
  </vmap:VMAP>`), DOMParser);
  assert.deepEqual(r.creativeRows.map((c) => [c.breakId, c.position, c.kind, c.placeholder]), [
    ['pre', 'Preroll', 'No ads (empty VAST / no fill)', true],
    ['mid', 'Midroll', 'No ads (empty VAST / no fill)', true],
  ]);
});

test('vmap VASTData spelling is read', () => {
  const r = buildReport(parseStr(`<vmap:VMAP ${VMAP_NS} version="1.0"><vmap:AdBreak timeOffset="start" breakId="pre"><vmap:AdSource><vmap:VASTData>${ONE_AD}</vmap:VASTData></vmap:AdSource></vmap:AdBreak></vmap:VMAP>`), DOMParser);
  assert.equal(r.counts.ads, 1);
  assert.equal(r.creativeRows[0].creativeId, 'c1');
});

test('vmap VAST wrapped in CDATA is read', () => {
  const r = buildReport(parseStr(`<vmap:VMAP ${VMAP_NS} version="1.0"><vmap:AdBreak timeOffset="end" breakId="post"><vmap:AdSource><vmap:VASTAdData><![CDATA[${ONE_AD}]]></vmap:VASTAdData></vmap:AdSource></vmap:AdBreak></vmap:VMAP>`), DOMParser);
  assert.equal(r.counts.ads, 1);
  assert.deepEqual([r.creativeRows[0].position, r.creativeRows[0].creativeId], ['Postroll', 'c1']);
});

test('finds VAST inside a wrapper element', () => {
  const r = buildReport(parseXml('<xml><VAST version="3.0"><Ad id="a"><InLine><Creatives><Creative id="c"><Linear/></Creative></Creatives></InLine></Ad></VAST></xml>', DOMParser).doc);
  assert.equal(r.format, 'VAST');
  assert.equal(r.counts.creatives, 1);
  assert.deepEqual(r.notes, ['Found <VAST> inside <xml>.']);
});

test('prefers VMAP over the VAST inside it when both are wrapped', () => {
  const r = buildReport(parseXml('<response><vmap:VMAP xmlns:vmap="http://www.iab.net/vmap-1.0" version="1.0"><vmap:AdBreak timeOffset="start"><vmap:AdSource><vmap:VASTAdData><VAST version="3.0"/></vmap:VASTAdData></vmap:AdSource></vmap:AdBreak></vmap:VMAP></response>', DOMParser).doc, DOMParser);
  assert.equal(r.format, 'VMAP');
  assert.equal(r.counts.breaks, 1);
  assert.deepEqual(r.notes, ['Found <vmap:VMAP> inside <response>.']);
});

test('no notes when VAST is the root', () => {
  assert.deepEqual(report(SAMPLE).notes, []);
});

test('VAST 4.1 inside VMAP, as XML and as CDATA', () => {
  const v41 = fs.readFileSync(fixture('vast4.xml'), 'utf8').replace(/^<\?xml[^>]*>\s*/, '');
  // XML forbids nested CDATA, so the inner "]]>" is split the way ad servers must write it.
  const cdata = '<![CDATA[' + v41.split(']]>').join(']]]]><![CDATA[>') + ']]>';
  const brk = (timeOffset, breakId, data) => `<vmap:AdBreak timeOffset="${timeOffset}" breakType="linear" breakId="${breakId}">`
    + `<vmap:AdSource id="${breakId}-src"><vmap:VASTAdData>${data}</vmap:VASTAdData></vmap:AdSource></vmap:AdBreak>`;
  const vmap = '<vmap:VMAP xmlns:vmap="http://www.iab.net/vmap-1.0" version="1.0">'
    + brk('00:00:30.000', 'mid1', v41) + brk('end', 'post', cdata) + '</vmap:VMAP>';
  const parsed = parseXml(vmap, DOMParser);
  assert.equal(parsed.error, undefined);
  const r = buildReport(parsed.doc, DOMParser);
  assert.equal(r.format, 'VMAP');
  assert.deepEqual(r.vastVersions, ['4.1']);
  assert.deepEqual(r.counts, { breaks: 2, ads: 2, podAds: 2, fallbackAds: 0, creatives: 4, trackers: 8, mediaFiles: 4, verifications: 2 });
  assert.deepEqual(r.creativeRows.map((x) => [x.breakId, x.position, x.adId, x.creativeId, x.adIdAttr, x.universalAdId, x.kind]), [
    ['mid1', 'Midroll', 'v4', 'c4', 'AD-4', 'ad-id.org: UAID-4', 'Linear'],
    ['mid1', 'Midroll', 'v4', 'c5', null, null, 'NonLinear ×2'],
    ['post', 'Postroll', 'v4', 'c4', 'AD-4', 'ad-id.org: UAID-4', 'Linear'],
    ['post', 'Postroll', 'v4', 'c5', null, null, 'NonLinear ×2'],
  ]);
  assert.deepEqual(r.verifications.map((v) => v.vendor), ['ias.com-omid', 'ias.com-omid']);
  assert.ok(r.mediaFiles.some((m) => m.resourceType === 'Mezzanine'));
});

test('pod and fallback ads are counted across VMAP breaks', () => {
  const ad = (id, seq) => `<Ad id="${id}"${seq ? ` sequence="${seq}"` : ''}><InLine><Creatives><Creative><Linear/></Creative></Creatives></InLine></Ad>`;
  const brk = (offset, ads) => `<vmap:AdBreak timeOffset="${offset}"><vmap:AdSource><vmap:VASTAdData><VAST version="3.0">${ads}</VAST></vmap:VASTAdData></vmap:AdSource></vmap:AdBreak>`;
  const xml = `<vmap:VMAP xmlns:vmap="http://www.iab.net/vmap-1.0" version="1.0">${brk('start', ad('p1', '1') + ad('p2', '2') + ad('f1'))}${brk('end', ad('s1'))}</vmap:VMAP>`;
  const r = buildReport(parseXml(xml, DOMParser).doc, DOMParser);
  assert.equal(r.counts.podAds, 2);
  assert.equal(r.counts.fallbackAds, 1);
  assert.deepEqual(r.creativeRows.map((x) => [x.position, x.role]), [
    ['Preroll', 'Pod #1'], ['Preroll', 'Pod #2'], ['Preroll', 'Fallback'], ['Postroll', 'Standalone'],
  ]);
});
