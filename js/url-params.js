// Breaks an VAST ad tag URL (or bare query string) into its parameters.
(function (root) {
  function decode(s) {
    try {
      return decodeURIComponent(s.replace(/\+/g, ' '));
    } catch (e) {
      return s;
    }
  }

  function parseAdUrl(input) {
    let s = String(input || '').trim();
    const quoted = /^(["'])([\s\S]*)\1\s*,?$/.exec(s);
    if (quoted) s = quoted[2].trim();
    if (!s) return { error: 'Paste an VAST ad tag URL.' };

    const hash = s.indexOf('#');
    if (hash !== -1) s = s.slice(0, hash);

    const q = s.indexOf('?');
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s);
    // In a bare query string ("a=1&b=x?y"), a "?" belongs to a value, not the URL.
    const bareQuery = q !== -1 && !hasScheme && s.slice(0, q).includes('=');
    let base = null;
    let query = s;
    if (q !== -1 && !bareQuery) {
      base = s.slice(0, q) || null;
      query = s.slice(q + 1);
    } else if (hasScheme && q === -1) {
      base = s;
      query = '';
    }

    const params = [];
    for (const part of query.replace(/&amp;/gi, '&').split(/[&;]/)) {
      if (!part) continue;
      const eq = part.indexOf('=');
      const rawName = eq === -1 ? part : part.slice(0, eq);
      const raw = eq === -1 ? '' : part.slice(eq + 1);
      params.push({ name: decode(rawName), raw, value: decode(raw) });
    }
    return { base, params };
  }

  const api = { parseAdUrl };
  root.AdInspector = Object.assign(root.AdInspector || {}, api);
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
