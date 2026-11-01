const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DOMParser } = require('@xmldom/xmldom');
const { parseXml } = require('../js/xml.js');
const { extractVast } = require('../js/vast.js');

const CTX = { breakId: null, timeOffset: null, position: 'not stated' };
const fixture = (name) => path.join(__dirname, 'fixtures', name);
const SAMPLE = path.join(__dirname, '..', 'docs', 'samples', 'google-single-inline-linear-vast3.xml');
const load = (file) => extractVast(parseXml(fs.readFileSync(file, 'utf8'), DOMParser).doc.documentElement, CTX);
const countType = (r, type) => r.trackers.filter((t) => t.type === type).length;

test('google sample', () => {
  const r = load(SAMPLE);
  assert.equal(r.version, '3.0');
  assert.equal(r.adCount, 1);
  assert.equal(r.creativeCount, 2);
  assert.equal(r.trackers.length, 26);
  assert.equal(countType(r, 'Tracking: creativeView'), 3);
  assert.equal(countType(r, 'CompanionClickThrough'), 2);
  assert.equal(countType(r, 'IconClickThrough'), 1);
  assert.equal(countType(r, 'Extension: ShowAdTracking'), 1);
  assert.equal(countType(r, 'Extension: video_ad_loaded'), 1);
  assert.equal(countType(r, 'Extension: MediaLoadAttemptTracking'), 1);
  assert.deepEqual(
    {
      adId: r.creativeRows[0].adId, adType: r.creativeRows[0].adType, creativeId: r.creativeRows[0].creativeId,
      adIdAttr: r.creativeRows[0].adIdAttr, universalAdId: r.creativeRows[0].universalAdId, kind: r.creativeRows[0].kind,
      duration: r.creativeRows[0].duration, position: r.creativeRows[0].position, placeholder: r.creativeRows[0].placeholder,
    },
    {
      adId: '5925573263', adType: 'InLine', creativeId: '138381721867', adIdAttr: 'H0Hrk8zCNZI',
      universalAdId: 'googlevideo: H0Hrk8zCNZI', kind: 'Linear', duration: '00:00:10', position: 'not stated', placeholder: false,
    }
  );
  assert.equal(r.creativeRows[1].kind, 'Companion ×2 (300x250, 728x90)');
  assert.equal(r.mediaFiles.length, 8);
  assert.equal(r.mediaFiles.filter((m) => m.resourceType === 'MediaFile').length, 6);
  assert.equal(r.mediaFiles.filter((m) => m.kind === 'Companion' && m.resourceType === 'StaticResource').length, 2);
  assert.equal(r.mediaFiles.find((m) => m.type === 'application/x-mpegURL').bitrate, '96–494');
  assert.equal(r.verifications.length, 0);
});

test('vast2 AdID', () => {
  const r = load(fixture('vast2.xml'));
  assert.equal(r.version, '2.0');
  assert.equal(r.creativeRows[0].adIdAttr, 'AD-2');
  assert.equal(r.trackers.filter((t) => t.type.startsWith('Tracking:')).length, 2);
});

test('vast4 default namespace', () => {
  const r = load(fixture('vast4.xml'));
  const row = r.creativeRows[0];
  assert.equal(row.adIdAttr, 'AD-4');
  assert.equal(row.universalAdId, 'ad-id.org: UAID-4');
  assert.equal(row.sequence, '1');
  assert.equal(countType(r, 'Viewable'), 1);
  assert.equal(countType(r, 'NotViewable'), 1);
  assert.equal(countType(r, 'Verification: verificationNotExecuted'), 1);
  assert.equal(r.trackers.filter((t) => t.type.startsWith('Extension:')).length, 0);
  assert.ok(r.mediaFiles.some((m) => m.kind === 'Mezzanine' && m.resourceType === 'Mezzanine'));
  assert.ok(r.mediaFiles.some((m) => m.bitrate === '500–1500'));
  assert.equal(r.creativeRows[1].kind, 'NonLinear ×2');
  assert.equal(r.verifications[0].vendor, 'ias.com-omid');
  assert.equal(r.verifications[0].parameters, 'p=1');
  assert.equal(r.verifications[0].resources[0].apiFramework, 'omid');
  assert.equal(r.verifications[0].resources[0].url, 'https://t.example/ias.js');
});

test('html resource kept as text', () => {
  const r = load(fixture('vast4.xml'));
  const html = r.mediaFiles.find((m) => m.resourceType === 'HTMLResource');
  assert.ok(html.url.startsWith('<script>alert(1)</script>'));
});

test('google-style verification', () => {
  const r = load(fixture('vast3-google-verification.xml'));
  assert.equal(r.verifications[0].vendor, 'doubleverify.com-omid');
  assert.equal(countType(r, 'Verification: verificationNotExecuted'), 1);
  assert.equal(r.trackers.filter((t) => t.type.startsWith('Extension:')).length, 0);
});

test('wrapper placeholder', () => {
  const r = load(fixture('wrapper.xml'));
  assert.equal(r.creativeRows.length, 1);
  const row = r.creativeRows[0];
  assert.equal(row.adType, 'Wrapper');
  assert.equal(row.placeholder, true);
  assert.equal(row.url, 'https://t.example/next');
  assert.equal(row.kind, 'Wrapper → VASTAdTagURI (not fetched)');
  assert.equal(r.creativeCount, 0);
  assert.equal(countType(r, 'Impression'), 1);
  assert.equal(countType(r, 'Error'), 1);
});

test('empty vast', () => {
  const r = load(fixture('empty.xml'));
  assert.equal(r.adCount, 0);
  assert.deepEqual(r.creativeRows, []);
  assert.equal(r.trackers.length, 1);
  assert.equal(r.trackers[0].type, 'Error');
  assert.equal(r.trackers[0].url, 'https://t.example/nofill');
  assert.equal(r.trackers[0].adId, null);
});

const fromString = (xml) => extractVast(parseXml(xml, DOMParser).doc.documentElement, CTX);

test('ad with neither InLine nor Wrapper still gets a row', () => {
  const r = fromString('<VAST version="4.0"><Ad id="x1"></Ad></VAST>');
  assert.equal(r.adCount, 1);
  assert.equal(r.creativeRows.length, 1);
  assert.equal(r.creativeRows[0].adId, 'x1');
  assert.equal(r.creativeRows[0].adType, null);
  assert.equal(r.creativeRows[0].kind, 'no InLine or Wrapper');
  assert.equal(r.creativeRows[0].placeholder, true);
});

test('missing event and type attributes are labelled, not null', () => {
  const r = fromString(`<VAST version="4.0"><Ad id="a"><InLine>
    <Creatives><Creative id="c"><Linear><TrackingEvents><Tracking>https://t.example/1</Tracking></TrackingEvents></Linear></Creative></Creatives>
    <Extensions><Extension><Tracking>https://t.example/2</Tracking></Extension></Extensions>
    <AdVerifications><Verification vendor="v"><Tracking>https://t.example/3</Tracking></Verification></AdVerifications>
  </InLine></Ad></VAST>`);
  assert.deepEqual(r.trackers.map((t) => t.type), ['Tracking: (no event)', 'Extension: (no type)', 'Verification: (no event)']);
  assert.equal(r.verifications[0].trackers[0].event, '(no event)');
});

test('long HTMLResource keeps its full text for copying', () => {
  const body = 'x'.repeat(200);
  const r = fromString(`<VAST version="4.0"><Ad><InLine><Creatives><Creative><NonLinearAds><NonLinear width="1" height="1">
    <HTMLResource>${body}</HTMLResource></NonLinear></NonLinearAds></Creative></Creatives></InLine></Ad></VAST>`);
  const m = r.mediaFiles[0];
  assert.equal(m.url, 'x'.repeat(120) + '…');
  assert.equal(m.full, body);
});

const inline = (id, seq) => `<Ad id="${id}"${seq ? ` sequence="${seq}"` : ''}><InLine><Creatives><Creative id="c-${id}"><Linear/></Creative></Creatives></InLine></Ad>`;

test('ads with sequence are pod ads and the rest are fallback ads', () => {
  const r = fromString(`<VAST version="3.0">${inline('61150959.140171158085632', '1')}${inline('61150990.140171158085000')}</VAST>`);
  assert.deepEqual(r.creativeRows.map((x) => [x.adId, x.sequence, x.role]), [
    ['61150959.140171158085632', '1', 'Pod #1'],
    ['61150990.140171158085000', null, 'Fallback'],
  ]);
  assert.equal(r.podAdCount, 1);
  assert.equal(r.fallbackAdCount, 1);
});

test('ads without any pod are standalone, not fallback', () => {
  const r = fromString(`<VAST version="3.0">${inline('a')}${inline('b')}</VAST>`);
  assert.deepEqual(r.creativeRows.map((x) => x.role), ['Standalone', 'Standalone']);
  assert.equal(r.podAdCount, 0);
  assert.equal(r.fallbackAdCount, 0);
});

test('pod ads keep their own sequence numbers', () => {
  const r = fromString(`<VAST version="4.0">${inline('x', '2')}${inline('y', '1')}${inline('z')}</VAST>`);
  assert.deepEqual(r.creativeRows.map((x) => x.role), ['Pod #2', 'Pod #1', 'Fallback']);
});

test('placeholder rows carry the ad role too', () => {
  const r = fromString('<VAST version="3.0"><Ad id="w" sequence="1"><Wrapper><VASTAdTagURI>https://t.example/v</VASTAdTagURI></Wrapper></Ad><Ad id="e"><InLine></InLine></Ad></VAST>');
  assert.deepEqual(r.creativeRows.map((x) => [x.adId, x.role, x.placeholder]), [['w', 'Pod #1', true], ['e', 'Fallback', true]]);
});

test('wrapper fallbackOnNoAd is reported when set', () => {
  const wrapper = (a) => `<VAST version="3.0"><Ad id="w"><Wrapper${a}><VASTAdTagURI>https://t.example/v</VASTAdTagURI></Wrapper></Ad></VAST>`;
  assert.equal(fromString(wrapper(' fallbackOnNoAd="true"')).creativeRows[0].fallbackOnNoAd, 'true');
  assert.equal(fromString(wrapper(' fallbackOnNoAd="false"')).creativeRows[0].fallbackOnNoAd, 'false');
  assert.equal(fromString(wrapper('')).creativeRows[0].fallbackOnNoAd, null);
});
