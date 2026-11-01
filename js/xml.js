// XML parsing, namespace-agnostic element helpers, and pretty-printing.
(function (root) {
  const ELEMENT = 1, TEXT = 3, CDATA = 4, COMMENT = 8;

  // Browsers wrap parse errors in boilerplate (Chrome) or add Location/Line lines (Firefox);
  // keep just the reason, and report line/column separately.
  function errorParts(message) {
    const m = /line[^\d]*(\d+)[^\d]+col(?:umn)?[^\d]*(\d+)/i.exec(message);
    const reason = message
      .replace(/This page contains the following errors:/i, '')
      .replace(/Below is a rendering of the page up to the first error\.?/i, '')
      .replace(/(?:error )?on line \d+ at column \d+:\s*/i, '')
      .replace(/^\s*Location:.*$/im, '')
      .replace(/Line Number \d+, Column \d+:/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    return { message: reason || message.trim(), line: m ? Number(m[1]) : null, column: m ? Number(m[2]) : null };
  }

  // Browsers report a failed parse by inserting a <parsererror> element in their own namespace.
  // Learn that marker once per parser from a deliberately broken document, so a pasted element
  // that merely happens to be called parsererror is not mistaken for one.
  const errorMarkers = new WeakMap();
  function parserErrorMarker(DOMParserCtor) {
    if (!errorMarkers.has(DOMParserCtor)) {
      let marker = null;
      try {
        const onError = (level, message) => { if (level !== 'warning') throw new Error(message); };
        const bad = new DOMParserCtor({ onError }).parseFromString('<', 'application/xml');
        const el = bad && bad.getElementsByTagName('parsererror')[0];
        if (el) marker = { ns: el.namespaceURI };
      } catch (e) {
        // This parser throws on errors instead of marking them (xmldom does).
      }
      errorMarkers.set(DOMParserCtor, marker);
    }
    return errorMarkers.get(DOMParserCtor);
  }

  function tryParse(s, DOMParserCtor) {
    let doc;
    let failure = null;
    try {
      // Browsers ignore this option; xmldom (used in tests) reports problems through it.
      const onError = (level, message, ctx) => {
        if (level === 'warning') return;
        const loc = (ctx && ctx.locator) || {};
        failure = { message: String(message).trim(), line: loc.lineNumber || null, column: loc.columnNumber || null };
        throw new Error(message);
      };
      doc = new DOMParserCtor({ onError }).parseFromString(s, 'application/xml');
    } catch (e) {
      return { error: failure || errorParts(String(e.message || e)) };
    }
    const marker = parserErrorMarker(DOMParserCtor);
    let perr = null;
    if (marker && doc) {
      const found = doc.getElementsByTagName('parsererror');
      for (let i = 0; i < found.length && !perr; i++) {
        if (found[i].namespaceURI === marker.ns) perr = found[i];
      }
    }
    if (perr) {
      let msg = '';
      for (let n = perr.firstChild; n; n = n.nextSibling) {
        if (n.localName !== 'sourcetext') msg += n.textContent;
      }
      return { error: errorParts(msg || 'Invalid XML') };
    }
    if (!doc || !doc.documentElement) return { error: { message: 'Invalid XML', line: null, column: null } };
    return { doc };
  }

  const KNOWN_NAMESPACES = { vmap: 'http://www.iab.net/vmap-1.0', xsi: 'http://www.w3.org/2001/XMLSchema-instance' };

  // Prefixes used on element or attribute names that the text never declares with xmlns:prefix.
  function undeclaredPrefixes(s) {
    const used = new Set();
    for (const m of s.matchAll(/<\/?([A-Za-z_][\w.-]*):[A-Za-z_]/g)) used.add(m[1]);
    for (const m of s.matchAll(/\s([A-Za-z_][\w.-]*):[A-Za-z_][\w.-]*\s*=/g)) used.add(m[1]);
    return [...used].filter((p) => p !== 'xml' && p !== 'xmlns' &&
      !new RegExp(`xmlns:${p.replace(/\./g, '\\.')}\\s*=`).test(s));
  }

  // Adds xmlns:prefix declarations to the root element's start tag.
  function declarePrefixes(s, prefixes) {
    const open = /<[A-Za-z_][\w.:-]*/.exec(s);
    if (!open) return s;
    const at = open.index + open[0].length;
    const decls = prefixes.map((p) => ` xmlns:${p}="${KNOWN_NAMESPACES[p] || `urn:undeclared:${p}`}"`).join('');
    return s.slice(0, at) + decls + s.slice(at);
  }

  // Moves an error position from the parsed text back onto the text as pasted.
  function shiftError(error, skipped) {
    if (!skipped || !error.line) return error;
    const lines = skipped.split('\n');
    const column = error.line === 1 && error.column ? error.column + lines[lines.length - 1].length : error.column;
    return { ...error, line: error.line + lines.length - 1, column };
  }

  function excerpt(s) {
    const t = s.replace(/\s+/g, ' ').trim();
    return t.length > 60 ? t.slice(0, 60) + '…' : t;
  }

  // Parses pasted XML. Text before the first "<" is skipped, and undeclared namespace
  // prefixes are declared on a second attempt; each repair is described in `notes`.
  function parseXml(text, DOMParserCtor) {
    const raw = String(text || '').replace(/^\uFEFF/, '');
    const start = raw.indexOf('<');
    const skipped = start > 0 ? raw.slice(0, start) : '';
    const s = raw.slice(skipped.length).trim();
    if (!s) return { error: { message: 'Paste a VAST or VMAP response.', line: null, column: null } };
    const notes = [];
    if (skipped.trim()) notes.push(`Ignored text before the XML: "${excerpt(skipped)}"`);

    const first = tryParse(s, DOMParserCtor);
    if (!first.error) return { doc: first.doc, notes };
    const prefixes = undeclaredPrefixes(s);
    const retry = prefixes.length ? tryParse(declarePrefixes(s, prefixes), DOMParserCtor) : null;
    if (!retry || retry.error) return { error: shiftError(first.error, skipped) };
    for (const p of prefixes) retry.doc.documentElement.removeAttribute(`xmlns:${p}`);
    const names = prefixes.map((p) => `"${p}:"`).join(', ');
    notes.push(prefixes.length === 1
      ? `Added the missing namespace declaration for the ${names} prefix.`
      : `Added the missing namespace declarations for the ${names} prefixes.`);
    return { doc: retry.doc, notes };
  }

  function childElements(el, localName) {
    const out = [];
    if (!el) return out;
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === ELEMENT && (!localName || n.localName === localName)) out.push(n);
    }
    return out;
  }

  function firstChild(el, localName) {
    return childElements(el, localName)[0] || null;
  }

  function descendants(el, localName) {
    const out = [];
    (function walk(node) {
      for (const c of childElements(node)) {
        if (c.localName === localName) out.push(c);
        walk(c);
      }
    })(el);
    return out;
  }

  function text(el) {
    if (!el) return null;
    const t = (el.textContent || '').trim();
    return t || null;
  }

  function attr(el, name) {
    if (!el || !el.hasAttribute(name)) return null;
    return el.getAttribute(name);
  }

  // A parser turns a literal CR into LF, and newline or tab in an attribute into a space,
  // so those characters are written as character references to survive a re-parse.
  const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#13;');
  const escAttr = (s) => escText(s).replace(/"/g, '&quot;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;');

  function openTag(el) {
    let s = '<' + el.nodeName;
    for (let i = 0; i < el.attributes.length; i++) {
      const a = el.attributes[i];
      s += ' ' + a.name + '="' + escAttr(a.value) + '"';
    }
    return s;
  }

  // Renders a text or CDATA node trimmed; returns '' for whitespace-only text.
  function inline(node) {
    const t = (node.nodeValue || '').trim();
    if (!t) return '';
    return node.nodeType === CDATA ? '<![CDATA[' + t + ']]>' : escText(t);
  }

  // The text, CDATA and comment pieces of an element with no child elements, in order, with the
  // value's outer edges trimmed across pieces; whitespace between pieces is part of the value and
  // is kept. Returns [] when there is no text at all (whitespace and comments only).
  function textPieces(el) {
    const pieces = [];
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === ELEMENT) return [];
      const kind = n.nodeType === CDATA ? 'cdata' : n.nodeType === TEXT ? 'text' : n.nodeType === COMMENT ? 'comment' : null;
      if (kind) pieces.push({ kind, text: n.nodeValue || '' });
    }
    const isText = (p) => p.kind !== 'comment';
    if (!pieces.some((p) => isText(p) && p.text.trim())) return [];
    const trimEdge = (order, strip) => {
      for (const i of order) {
        const p = pieces[i];
        if (!isText(p)) continue;
        if (!p.text.trim()) { p.drop = true; continue; }
        p.text = strip(p.text);
        return;
      }
    };
    const idx = pieces.map((_, i) => i);
    trimEdge(idx, (t) => t.replace(/^\s+/, ''));
    trimEdge(idx.reverse(), (t) => t.replace(/\s+$/, ''));
    return pieces.filter((p) => !p.drop);
  }

  function formatNode(el, depth, lines) {
    const pad = '  '.repeat(depth);
    const kids = [];
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === ELEMENT || n.nodeType === COMMENT) kids.push(n);
      else if ((n.nodeType === TEXT || n.nodeType === CDATA) && inline(n)) kids.push(n);
    }
    const pieces = textPieces(el);
    if (kids.length === 0) {
      lines.push(pad + openTag(el) + '/>');
    } else if (pieces.length) {
      const body = pieces.map((p) => (p.kind === 'cdata' ? '<![CDATA[' + p.text + ']]>'
        : p.kind === 'comment' ? '<!--' + p.text + '-->' : escText(p.text))).join('');
      lines.push(pad + openTag(el) + '>' + body + '</' + el.nodeName + '>');
    } else {
      lines.push(pad + openTag(el) + '>');
      for (const n of kids) {
        if (n.nodeType === ELEMENT) formatNode(n, depth + 1, lines);
        else if (n.nodeType === COMMENT) lines.push(pad + '  <!--' + n.nodeValue + '-->');
        else lines.push(pad + '  ' + inline(n));
      }
      lines.push(pad + '</' + el.nodeName + '>');
    }
  }

  function formatXml(doc) {
    const lines = [];
    formatNode(doc.documentElement, 0, lines);
    return lines.join('\n');
  }

  const api = { parseXml, childElements, firstChild, descendants, text, attr, formatXml, textPieces, escText, escAttr };
  root.AdInspector = Object.assign(root.AdInspector || {}, api);
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
