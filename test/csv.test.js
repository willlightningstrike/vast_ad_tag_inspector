const test = require('node:test');
const assert = require('node:assert/strict');
const { parseExpectations } = require('../js/csv.js');

test('name and value', () => {
  assert.deepEqual(parseExpectations('iu,/1234/video\nsz,640x480'), [
    { line: 1, name: 'iu', expected: '/1234/video', unexpected: null },
    { line: 2, name: 'sz', expected: '640x480', unexpected: null },
  ]);
});

test('name only is presence check', () => {
  for (const text of ['vpos', 'vpos,']) {
    assert.deepEqual(parseExpectations(text), [{ line: 1, name: 'vpos', expected: null, unexpected: null }]);
  }
});

test('an unquoted comma starts the next column', () => {
  assert.deepEqual(parseExpectations('ciu_szs,300x250,728x90'), [{ line: 1, name: 'ciu_szs', expected: '300x250', unexpected: '728x90' }]);
});

test('a quoted value keeps its commas', () => {
  assert.deepEqual(parseExpectations('ciu_szs,"300x250,728x90", "a,b" '), [{ line: 1, name: 'ciu_szs', expected: '300x250,728x90', unexpected: 'a,b' }]);
});

test('third column is the unexpected value', () => {
  assert.deepEqual(parseExpectations('env,,instream\nenv,vp,instream'), [
    { line: 1, name: 'env', expected: null, unexpected: 'instream' },
    { line: 2, name: 'env', expected: 'vp', unexpected: 'instream' },
  ]);
});

test('skips a three-column header row', () => {
  for (const header of ['key, expected_value, unexpected_value', 'parameter,value,unexpected', 'Name,Expected value,Unexpected value']) {
    assert.deepEqual(parseExpectations(header + '\na,1'), [{ line: 2, name: 'a', expected: '1', unexpected: null }]);
  }
});

test('strips one pair of quotes and trims', () => {
  assert.deepEqual(parseExpectations(' env , "vp" '), [{ line: 1, name: 'env', expected: 'vp', unexpected: null }]);
});

test('skips header row', () => {
  for (const header of ['parameter,value', 'Param,Value', 'KEY,VALUE', 'name,value']) {
    assert.deepEqual(parseExpectations(header + '\na,1'), [{ line: 2, name: 'a', expected: '1', unexpected: null }]);
  }
});

test('does not skip a real first row', () => {
  assert.deepEqual(parseExpectations('parameter,x'), [{ line: 1, name: 'parameter', expected: 'x', unexpected: null }]);
});

test('ignores blank lines', () => {
  assert.deepEqual(parseExpectations('a,1\n\n  \nb,2\n').map((e) => e.line), [1, 4]);
});

test('handles BOM and CRLF', () => {
  assert.deepEqual(parseExpectations('﻿a,1\r\nb,2\r\n\r\n'), [
    { line: 1, name: 'a', expected: '1', unexpected: null },
    { line: 2, name: 'b', expected: '2', unexpected: null },
  ]);
});

test('same name twice kept', () => {
  assert.equal(parseExpectations('pos,1\npos,2').length, 2);
});

test('unescapes doubled quotes inside a quoted value', () => {
  assert.equal(parseExpectations('cust_params,"a ""b"" c"')[0].expected, 'a "b" c');
});

test('a header after leading blank lines is still skipped (bug #9)', () => {
  assert.deepEqual(parseExpectations('\n  \nparameter,value\nenv,vp'), [{ line: 4, name: 'env', expected: 'vp', unexpected: null }]);
});
