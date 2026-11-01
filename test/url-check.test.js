const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAdUrl } = require('../js/url-params.js');
const { parseExpectations } = require('../js/csv.js');
const { checkParams } = require('../js/url-check.js');

const run = (url, csv) => checkParams(parseAdUrl(url).params, parseExpectations(csv));
const summary = (r) => r.rows.map((row) => `${row.name} ${row.status}`);

test('mockup scenario', () => {
  const r = run(
    '?iu=%2F1234%2Fvideo&sz=640x480&output=vast&env=instream&correlator=17301&cust_params=genre%3Dsports',
    'iu,/1234/video\nsz,640x480\noutput,vast\nenv,vp\nvpos,preroll'
  );
  assert.deepEqual(summary(r), [
    'vpos missing', 'env differs', 'iu match', 'sz match', 'output match',
    'correlator not-checked', 'cust_params not-checked',
  ]);
  assert.deepEqual(r.counts, { match: 3, problems: 2, notChecked: 2 });
  assert.deepEqual(r.rows[1].inUrl, ['instream']);
  assert.deepEqual(r.rows[0].inUrl, []);
});

test('presence check', () => {
  const ok = run('?vpos=', 'vpos');
  assert.deepEqual(summary(ok), ['vpos present']);
  assert.equal(ok.counts.match, 1);
  assert.deepEqual(summary(run('?a=1', 'vpos')), ['vpos missing', 'a not-checked']);
});

test('encoded expected value matches raw', () => {
  assert.deepEqual(summary(run('?iu=%2F1234', 'iu,%2F1234')), ['iu match']);
});

test('case sensitive', () => {
  assert.deepEqual(summary(run('?env=VP', 'env,vp')), ['env differs']);
  assert.deepEqual(summary(run('?Env=vp', 'env,vp')), ['env missing', 'Env not-checked']);
});

test('repeated url param any occurrence', () => {
  const r = run('?pos=1&pos=2', 'pos,2');
  assert.deepEqual(summary(r), ['pos match']);
  assert.deepEqual(r.rows[0].inUrl, ['1', '2']);
});

test('same name twice in csv', () => {
  assert.deepEqual(summary(run('?pos=1&pos=2', 'pos,1\npos,2')), ['pos match', 'pos match']);
  const r = run('?pos=1&pos=2', 'pos,1\npos,3');
  assert.deepEqual(summary(r), ['pos differs', 'pos match']);
  assert.equal(r.rows[0].expected, '3');
});

test('no csv', () => {
  const r = checkParams(parseAdUrl('?a=1&b=2').params, []);
  assert.deepEqual(summary(r), ['a not-checked', 'b not-checked']);
  assert.deepEqual(r.counts, { match: 0, problems: 0, notChecked: 2 });
});

test('unexpected value found is a problem', () => {
  const r = run('?env=instream&a=1', 'env,,instream');
  assert.deepEqual(summary(r), ['env unexpected', 'a not-checked']);
  assert.deepEqual(r.counts, { match: 0, problems: 1, notChecked: 1 });
  assert.equal(r.rows[0].unexpected, 'instream');
});

test('unexpected value matches when the url value contains it', () => {
  assert.deepEqual(summary(run('?cust_params=sample_ct%3Dlinear', 'cust_params,,linear')), ['cust_params unexpected']);
  assert.deepEqual(summary(run('?iu=%2F1234%2Fvideo', 'iu,,%2F1234')), ['iu unexpected']);
  assert.deepEqual(summary(run('?env=vp', 'env,,instream')), ['env present']);
});

test('missing parameter passes an unexpected-only line', () => {
  const r = run('?a=1', 'env,,instream');
  assert.deepEqual(summary(r), ['env absent', 'a not-checked']);
  assert.equal(r.counts.match, 1);
  assert.deepEqual(summary(run('?a=1', 'env,vp,instream')), ['env missing', 'a not-checked']);
});

test('unexpected value outranks a matching expected value', () => {
  assert.deepEqual(summary(run('?pos=1&pos=bad', 'pos,1,bad')), ['pos unexpected']);
  assert.deepEqual(summary(run('?pos=1', 'pos,1,bad')), ['pos match']);
  assert.deepEqual(summary(run('?pos=2', 'pos,1,bad')), ['pos differs']);
});

test('problem rows order: missing, unexpected, differs', () => {
  assert.deepEqual(summary(run('?b=2&c=bad', 'b,1\nc,,bad\na,1')), ['a missing', 'c unexpected', 'b differs']);
});
