// Parses the expectations CSV: one "parameter[,expected value[,unexpected value]]" per line.
// Values that contain a comma are quoted, as Excel writes them: "300x250,728x90".
(function (root) {
  const HEADER = [/^(parameter|param|key|name)$/i, /^(expected[ _]?)?value$/i, /^unexpected([ _]?value)?$/i];

  // Splits one line into trimmed fields; a quoted field keeps its commas and unescapes "".
  function fields(line) {
    const out = [];
    let i = 0;
    for (;;) {
      while (line[i] === ' ' || line[i] === '\t') i++;
      let value;
      if (line[i] === '"') {
        value = '';
        for (i++; i < line.length; i++) {
          if (line[i] !== '"') value += line[i];
          else if (line[i + 1] === '"') { value += '"'; i++; }
          else { i++; break; }
        }
        const comma = line.indexOf(',', i);
        i = comma === -1 ? line.length : comma;
      } else {
        const comma = line.indexOf(',', i);
        value = line.slice(i, comma === -1 ? line.length : comma);
        i = comma === -1 ? line.length : comma;
      }
      out.push(value.trim());
      if (i >= line.length) return out;
      i++;
    }
  }

  const isHeader = (f) => f.length >= 2 && f.length <= 3 && f.every((v, i) => HEADER[i].test(v));

  function parseExpectations(text) {
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
    const out = [];
    lines.forEach((lineText, i) => {
      if (!lineText.trim()) return;
      const f = fields(lineText);
      if (i === 0 && isHeader(f)) return;
      const [name, expected = '', unexpected = ''] = f;
      if (!name) return;
      out.push({ line: i + 1, name, expected: expected === '' ? null : expected, unexpected: unexpected === '' ? null : unexpected });
    });
    return out;
  }

  const api = { parseExpectations };
  root.AdInspector = Object.assign(root.AdInspector || {}, api);
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
