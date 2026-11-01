const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAdUrl } = require('../js/url-params.js');

test('splits full url', () => {
  const r = parseAdUrl('https://ads.example.com/vast?iu=%2F1234%2Fvideo&sz=640x480&output=vast');
  assert.equal(r.base, 'https://ads.example.com/vast');
  assert.deepEqual(r.params, [
    { name: 'iu', raw: '%2F1234%2Fvideo', value: '/1234/video' },
    { name: 'sz', raw: '640x480', value: '640x480' },
    { name: 'output', raw: 'vast', value: 'vast' },
  ]);
});

test('plus decodes to space', () => {
  assert.equal(parseAdUrl('?q=a+b').params[0].value, 'a b');
});

test('bare query string', () => {
  for (const input of ['a=1&b=2', '?a=1&b=2']) {
    const r = parseAdUrl(input);
    assert.equal(r.base, null);
    assert.equal(r.params.length, 2);
  }
});

test('empty value and no equals', () => {
  const r = parseAdUrl('?correlator=&flag');
  assert.deepEqual(r.params.map((p) => [p.name, p.value]), [['correlator', ''], ['flag', '']]);
});

test('repeated params keep order', () => {
  assert.deepEqual(parseAdUrl('?pos=1&x=9&pos=2').params.map((p) => p.name), ['pos', 'x', 'pos']);
});

test('cust_params decoded on one row', () => {
  const r = parseAdUrl('?cust_params=genre%3Dsports%26pos%3D1');
  assert.equal(r.params.length, 1);
  assert.equal(r.params[0].value, 'genre=sports&pos=1');
});

test('fragment ignored', () => {
  const r = parseAdUrl('https://h/p?a=1#frag');
  assert.deepEqual(r.params, [{ name: 'a', raw: '1', value: '1' }]);
});

test('trims whitespace, newlines and quotes', () => {
  const r = parseAdUrl('  "https://h/p?a=1&b=2"\n');
  assert.equal(r.base, 'https://h/p');
  assert.equal(r.params.length, 2);
});

test('bad percent-encoding keeps raw value', () => {
  const r = parseAdUrl('?a=%E0%A4%A&b=%');
  assert.deepEqual(r.params.map((p) => [p.name, p.value]), [['a', '%E0%A4%A'], ['b', '%']]);
});

test('empty input', () => {
  assert.deepEqual(parseAdUrl(''), { error: 'Paste an VAST ad tag URL.' });
});

test('html-escaped ampersands from XML are separators', () => {
  const r = parseAdUrl('https://h/p?iu=%2F1&amp;sz=640x480&amp;output=vast');
  assert.deepEqual(r.params.map((p) => [p.name, p.value]), [['iu', '/1'], ['sz', '640x480'], ['output', 'vast']]);
});

test('strips a trailing comma after a quoted url copied from JSON', () => {
  for (const input of ['"https://a.example/x?a=1&b=2",', "'https://a.example/x?a=1&b=2' ,"]) {
    const r = parseAdUrl(input);
    assert.equal(r.base, 'https://a.example/x');
    assert.deepEqual(r.params.map((p) => p.value), ['1', '2']);
  }
});

test('semicolon divides parameters like ampersand', () => {
  const r = parseAdUrl('https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_ad_samples&sz=640x480'
    + '&cust_params=sample_ct%3Dlinear;ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unviewed_position_start=1'
    + '&env=vp&impl=s&correlator=;slot=123456;;');
  assert.equal(r.base, 'https://pubads.g.doubleclick.net/gampad/ads');
  assert.deepEqual(r.params.map((p) => [p.name, p.value]), [
    ['iu', '/21775744923/external/single_ad_samples'],
    ['sz', '640x480'],
    ['cust_params', 'sample_ct=linear'],
    ['ciu_szs', '300x250,728x90'],
    ['gdfp_req', '1'],
    ['output', 'vast'],
    ['unviewed_position_start', '1'],
    ['env', 'vp'],
    ['impl', 's'],
    ['correlator', ''],
    ['slot', '123456'],
  ]);
});

test('a question mark inside a bare query value stays in the value (bug #3)', () => {
  const r = parseAdUrl('description_url=https://example.com/video?clip=1&env=vp');
  assert.equal(r.base, null);
  assert.deepEqual(r.params.map((p) => [p.name, p.value]), [['description_url', 'https://example.com/video?clip=1'], ['env', 'vp']]);
  assert.deepEqual(parseAdUrl('q=a?b&env=vp').params.map((p) => [p.name, p.value]), [['q', 'a?b'], ['env', 'vp']]);
  const full = parseAdUrl('https://h.example/p?u=x?y&a=1');
  assert.equal(full.base, 'https://h.example/p');
  assert.deepEqual(full.params.map((p) => [p.name, p.value]), [['u', 'x?y'], ['a', '1']]);
});
