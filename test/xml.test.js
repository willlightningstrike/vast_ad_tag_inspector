const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DOMParser } = require('@xmldom/xmldom');
const { parseXml, childElements, attr, text, formatXml } = require('../js/xml.js');

const parse = (s) => parseXml(s, DOMParser);
const SAMPLE = path.join(__dirname, '..', 'docs', 'samples', 'google-single-inline-linear-vast3.xml');

test('parses and strips BOM', () => {
  const r = parse('﻿  <VAST version="3.0"/>');
  assert.equal(r.doc.documentElement.localName, 'VAST');
});

test('malformed reports line', () => {
  const r = parse('<VAST version="3.0">\n<Ad>\n</VAST>');
  assert.ok(r.error);
  assert.ok(r.error.message.length > 0);
  assert.equal(typeof r.error.line, 'number');
});

test('empty input', () => {
  assert.deepEqual(parse('   '), { error: { message: 'Paste a VAST or VMAP response.', line: null, column: null } });
});

test('helpers ignore namespace', () => {
  const r = parse('<vmap:VMAP xmlns:vmap="http://www.iab.net/videosuite/vmap"><vmap:AdBreak timeOffset="start"/></vmap:VMAP>');
  const root = r.doc.documentElement;
  const breaks = childElements(root, 'AdBreak');
  assert.equal(breaks.length, 1);
  assert.equal(attr(breaks[0], 'timeOffset'), 'start');
});

test('text reads cdata', () => {
  assert.equal(text(parse('<a><![CDATA[  https://x/y  ]]></a>').doc.documentElement), 'https://x/y');
});

test('formatXml layout', () => {
  const doc = parse('<a x="1"><b><![CDATA[ u ]]></b><c/><!--n--></a>').doc;
  assert.equal(formatXml(doc), '<a x="1">\n  <b><![CDATA[u]]></b>\n  <c/>\n  <!--n-->\n</a>');
});

test('formatXml escapes', () => {
  const doc = parse('<a t="&quot;&amp;">1 &lt; 2</a>').doc;
  assert.equal(formatXml(doc), '<a t="&quot;&amp;">1 &lt; 2</a>');
});

test('formatXml sample', () => {
  const out = formatXml(parse(fs.readFileSync(SAMPLE, 'utf8')).doc);
  assert.ok(out.startsWith('<VAST'));
  assert.ok(out.includes('\n  <Ad id="5925573263">'));
});

test('browser parsererror message is cleaned up', () => {
  // Chrome reports XML errors as a <parsererror> element wrapped in boilerplate text.
  class ChromeLikeParser {
    parseFromString() {
      return new DOMParser().parseFromString(
        '<VAST><parsererror><h3>This page contains the following errors:</h3>' +
        '<div>error on line 1 at column 31: Unexpected closing tag: VAST != Ad\n</div>' +
        '<h3>Below is a rendering of the page up to the first error.</h3></parsererror></VAST>',
        'application/xml');
    }
  }
  assert.deepEqual(parseXml('<VAST><Ad></VAST>', ChromeLikeParser).error, {
    message: 'Unexpected closing tag: VAST != Ad', line: 1, column: 31,
  });
});

test('firefox parsererror drops the echoed source line', () => {
  // Firefox's <parsererror> repeats the whole source line in a <sourcetext> child.
  class FirefoxLikeParser {
    parseFromString() {
      return new DOMParser().parseFromString(
        '<parsererror xmlns="http://www.mozilla.org/newlayout/xml/parsererror.xml">XML Parsing Error: not well-formed\n' +
        'Location: file:///x/index.html\nLine Number 1, Column 42:<sourcetext>&lt;VAST version="3.0"&gt;' + 'x'.repeat(5000) +
        '\n-----------------------------------------^</sourcetext></parsererror>',
        'application/xml');
    }
  }
  assert.deepEqual(parseXml('<VAST>', FirefoxLikeParser).error, {
    message: 'XML Parsing Error: not well-formed', line: 1, column: 42,
  });
});

test('skips text before the xml and says so', () => {
  const r = parse('HTTP/1.1 200 OK\nContent-Type: text/xml\n\n<VAST version="3.0"/>');
  assert.equal(r.doc.documentElement.localName, 'VAST');
  assert.deepEqual(r.notes, ['Ignored text before the XML: "HTTP/1.1 200 OK Content-Type: text/xml"']);
});

test('no notes for a clean document or leading whitespace', () => {
  assert.deepEqual(parse('\n\n  <VAST version="3.0"/>').notes, []);
});

test('error position counts the skipped text', () => {
  const multi = parse('junk\nmore junk\n<VAST><Ad></VAST>');
  assert.equal(multi.error.line, 3);
  const single = parse('junk <VAST><Ad></VAST>');
  const clean = parse('<VAST><Ad></VAST>');
  assert.equal(single.error.line, 1);
  assert.equal(single.error.column, clean.error.column + 5);
});

test('declares a missing namespace prefix and removes the declaration again', () => {
  const r = parse('<vmap:VMAP version="1.0"><vmap:AdBreak breakId="pre"/></vmap:VMAP>');
  const root = r.doc.documentElement;
  assert.equal(root.localName, 'VMAP');
  assert.equal(childElements(root, 'AdBreak').length, 1);
  assert.equal(root.hasAttribute('xmlns:vmap'), false);
  assert.ok(formatXml(r.doc).startsWith('<vmap:VMAP version="1.0">'));
  assert.deepEqual(r.notes, ['Added the missing namespace declaration for the "vmap:" prefix.']);
});

test('a real error is still reported when declaring prefixes does not help', () => {
  const r = parse('<vmap:VMAP version="1.0"><vmap:AdBreak></vmap:VMAP>');
  assert.ok(r.error);
});

test('formatting keeps whitespace between text and CDATA pieces (bug #1)', () => {
  const doc = parse('<V><A><![CDATA[first ]]><![CDATA[second]]></A><B>one <![CDATA[two]]> three</B><C>\n  <![CDATA[ x ]]>\n</C></V>').doc;
  const again = parse(formatXml(doc)).doc.documentElement;
  assert.equal(text(childElements(again, 'A')[0]), 'first second');
  assert.equal(text(childElements(again, 'B')[0]), 'one two three');
  assert.ok(formatXml(doc).includes('<C><![CDATA[x]]></C>'));
});

test('formatted text never contains a bare ]]> (bug #4)', () => {
  const out = formatXml(parse('<VAST version="4.1"><Error>https://t.example/?x=]]&gt;</Error></VAST>').doc);
  assert.ok(out.includes('<Error>https://t.example/?x=]]&gt;</Error>'), out);
});

test('a pasted element named parsererror is not a parse error (bug #5)', () => {
  const ok = parse('<VAST><Ad><InLine><Extensions><Extension type="debug"><parsererror>diagnostic</parsererror></Extension></Extensions></InLine></Ad></VAST>');
  assert.equal(ok.error, undefined);
  // A browser-like parser that marks real failures with an XHTML-namespaced <parsererror>.
  class BrowserLikeParser {
    parseFromString(s, type) {
      try {
        return new DOMParser({ onError: (level, msg) => { if (level !== 'warning') throw new Error(msg); } }).parseFromString(s, type);
      } catch (e) {
        return new DOMParser().parseFromString('<html><parsererror xmlns="http://www.w3.org/1999/xhtml">broken</parsererror></html>', type);
      }
    }
  }
  const custom = parseXml('<VAST><Extension><parsererror>diagnostic</parsererror></Extension></VAST>', BrowserLikeParser);
  assert.equal(custom.error, undefined);
  assert.equal(parseXml('<VAST><Ad></VAST>', BrowserLikeParser).error.message, 'broken');
});

test('a comment inside a text value stays inline when formatting (review 2, #1)', () => {
  const doc = parse('<V><P>key<!--debug-->=value</P><Q> a <!--x--> b </Q></V>').doc;
  const out = formatXml(doc);
  assert.ok(out.includes('<P>key<!--debug-->=value</P>'), out);
  const again = parse(out).doc.documentElement;
  assert.equal(text(childElements(again, 'P')[0]), 'key=value');
  assert.equal(text(childElements(again, 'Q')[0]), 'a  b');
});

test('newline, tab and carriage return in attributes survive formatting (review 2, #3)', () => {
  const doc = parse('<VAST><Ad id="a&#10;b&#9;c&#13;d"/></VAST>').doc;
  const out = formatXml(doc);
  assert.ok(out.includes('<Ad id="a&#10;b&#9;c&#13;d"/>'), out);
  assert.equal(childElements(parse(out).doc.documentElement, 'Ad')[0].getAttribute('id'), 'a\nb\tc\rd');
  const cr = parse('<VAST><Error>a&#13;b</Error></VAST>').doc;
  assert.equal(childElements(parse(formatXml(cr)).doc.documentElement, 'Error')[0].textContent, 'a\rb');
});
