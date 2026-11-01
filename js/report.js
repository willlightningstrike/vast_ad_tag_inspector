// Builds the VAST / VMAP report shown in the VAST tab.
(function (root) {
  const isNode = typeof module !== 'undefined';
  const X = isNode ? require('./xml.js') : root.AdInspector;
  const { extractVast } = isNode ? require('./vast.js') : root.AdInspector;
  const { childElements, firstChild, descendants, text, attr, parseXml } = X;

  function positionFromOffset(offset) {
    const o = String(offset || '').trim();
    if (o === 'start') return 'Preroll';
    if (o === 'end') return 'Postroll';
    if (/^#\d+$/.test(o)) return `Midroll (${o})`;
    const pct = /^(\d+(?:\.\d+)?)%$/.exec(o);
    if (pct) {
      const n = Number(pct[1]);
      return n === 0 ? 'Preroll' : n === 100 ? 'Postroll' : 'Midroll';
    }
    if (/^\d+:\d{2}:\d{2}(\.\d+)?$/.test(o)) return /[1-9]/.test(o) ? 'Midroll' : 'Preroll';
    return `Unknown (${o})`;
  }

  function placeholder(ctx, kind, url) {
    return {
      ...ctx, adId: null, adType: null, sequence: null, creativeId: null, adIdAttr: null,
      universalAdId: null, kind, duration: null, url, placeholder: true,
    };
  }

  // VMAP carries the VAST as child elements of <VASTAdData> (or the older <VASTData>),
  // or as escaped/CDATA text inside it; the text form needs its own parse.
  function inlineVast(data, DOMParserCtor) {
    if (!data) return null;
    const el = firstChild(data, 'VAST');
    if (el) return el;
    const body = text(data);
    if (!body || !DOMParserCtor) return null;
    const parsed = parseXml(body, DOMParserCtor);
    return parsed.doc && parsed.doc.documentElement.localName === 'VAST' ? parsed.doc.documentElement : null;
  }

  // The VMAP or VAST element to report on: the document root, or the first one inside a wrapper.
  function reportRoot(docEl) {
    if (docEl.localName === 'VAST' || docEl.localName === 'VMAP') return docEl;
    return descendants(docEl, 'VMAP')[0] || descendants(docEl, 'VAST')[0] || null;
  }

  function buildReport(doc, DOMParserCtor) {
    const rootEl = reportRoot(doc.documentElement);
    if (!rootEl) return { error: `Not a VAST or VMAP document (root is <${doc.documentElement.nodeName}>)` };
    const notes = rootEl === doc.documentElement ? [] : [`Found <${rootEl.nodeName}> inside <${doc.documentElement.nodeName}>.`];
    const parts = [];
    const extraTrackers = [];
    let format;
    let version;
    let breaks = 0;

    if (rootEl.localName === 'VAST') {
      format = 'VAST';
      const part = extractVast(rootEl, { breakId: null, timeOffset: null, position: 'not stated' });
      parts.push({ part, rows: part.creativeRows });
      version = part.version;
    } else if (rootEl.localName === 'VMAP') {
      format = 'VMAP';
      version = attr(rootEl, 'version');
      for (const br of childElements(rootEl, 'AdBreak')) {
        breaks++;
        const timeOffset = attr(br, 'timeOffset');
        const ctx = { breakId: attr(br, 'breakId'), timeOffset, position: positionFromOffset(timeOffset) };
        const rows = [];
        const source = firstChild(br, 'AdSource');
        const data = firstChild(source, 'VASTAdData') || firstChild(source, 'VASTData');
        const inline = inlineVast(data, DOMParserCtor);
        const tagUri = firstChild(source, 'AdTagURI');
        if (inline) {
          const part = extractVast(inline, ctx);
          parts.push({ part, rows: part.creativeRows });
          if (part.creativeRows.length === 0) rows.push(placeholder(ctx, 'No ads (empty VAST / no fill)', null));
        } else if (data) {
          rows.push(placeholder(ctx, 'VAST data could not be read', null));
        } else if (tagUri) {
          rows.push(placeholder(ctx, 'Ad tag (not fetched)', text(tagUri)));
        } else if (firstChild(source, 'CustomAdData')) {
          rows.push(placeholder(ctx, 'Custom data (not parsed)', null));
        } else {
          rows.push(placeholder(ctx, 'No ad source', null));
        }
        if (rows.length) parts.push({ part: null, rows });
        for (const t of childElements(firstChild(br, 'TrackingEvents'), 'Tracking')) {
          const url = text(t);
          if (url) extraTrackers.push({ type: `VMAP: ${attr(t, 'event')}`, url, adId: null, creativeId: null, breakId: ctx.breakId });
        }
      }
    }

    const vasts = parts.map((p) => p.part).filter(Boolean);
    const creativeRows = parts.flatMap((p) => p.rows);
    const trackers = vasts.flatMap((p) => p.trackers).concat(extraTrackers);
    const mediaFiles = vasts.flatMap((p) => p.mediaFiles);
    const verifications = vasts.flatMap((p) => p.verifications);
    const ads = vasts.reduce((n, p) => n + p.adCount, 0);
    const vastVersions = [...new Set(vasts.map((p) => p.version).filter(Boolean))];

    return {
      format, version, vastVersions, notes,
      empty: ads === 0 && creativeRows.length === 0,
      creativeRows, trackers, mediaFiles, verifications,
      counts: {
        breaks,
        ads,
        podAds: vasts.reduce((n, p) => n + p.podAdCount, 0),
        fallbackAds: vasts.reduce((n, p) => n + p.fallbackAdCount, 0),
        creatives: vasts.reduce((n, p) => n + p.creativeCount, 0),
        trackers: trackers.length,
        mediaFiles: mediaFiles.filter((m) => m.resourceType === 'MediaFile' || m.resourceType === 'Mezzanine').length,
        verifications: verifications.length,
      },
    };
  }

  const api = { positionFromOffset, buildReport };
  root.AdInspector = Object.assign(root.AdInspector || {}, api);
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
