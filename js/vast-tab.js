// "VAST / VMAP" tab: paste a response, see it formatted and broken down.
(function (root) {
  const { el, clear, copyButton, parseXml, formatXml, buildReport, renderXmlTree } = root.AdInspector;

  const dash = (v) => (v === null || v === undefined || v === '' ? '—' : v);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function urlCell(url, copy) {
    if (!url) return '—';
    return [el('code', {}, url), copyButton(copy || url)];
  }

  function table(className, headers, rows) {
    return el('div', { className: 'table-wrap' },
      el('table', { className: `data ${className}` },
        el('thead', {}, el('tr', {}, headers.map((h) => el('th', { scope: 'col' }, h)))),
        el('tbody', {}, rows)));
  }

  function section(title, ...content) {
    return el('section', { className: 'section' },
      el('div', { className: 'section-head' }, el('h2', {}, title)),
      content);
  }

  function where(t) {
    return [t.breakId && `Break ${t.breakId}`, t.adId && `Ad ${t.adId}`, t.creativeId && `Creative ${t.creativeId}`]
      .filter(Boolean).join(', ');
  }

  function trackerUrl(t) {
    const label = where(t);
    return [label ? el('span', { className: 'where' }, label) : null, el('code', {}, t.url), copyButton(t.url)];
  }

  function tiles(report) {
    const c = report.counts;
    let format = `${report.format} ${dash(report.version)}`;
    if (report.format === 'VMAP' && report.vastVersions.length) format += ` (VAST ${report.vastVersions.join(', ')})`;
    const items = [
      [format, 'Format'],
      report.format === 'VMAP' ? [c.breaks, 'Ad breaks'] : null,
      [c.ads, 'Ads'],
      c.podAds > 0 ? [c.podAds, 'Pod ads'] : null,
      c.fallbackAds > 0 ? [c.fallbackAds, 'Fallback ads'] : null,
      [c.creatives, 'Creatives'],
      [c.trackers, 'Trackers'],
      [c.mediaFiles, 'Media files'],
      c.verifications > 0 ? [c.verifications, 'Verifications'] : null,
    ].filter(Boolean);
    return el('ul', { className: 'tiles' }, items.map(([value, label]) => el('li', {}, el('b', {}, String(value)), el('span', {}, label))));
  }

  function creativesTable(report) {
    if (!report.creativeRows.length) return el('p', { className: 'empty' }, 'No creatives in this response.');
    const vmap = report.format === 'VMAP';
    const headers = [vmap ? 'Break' : null, 'Position', 'Ad id', 'Ad type', 'Ad sequence', 'Ad role', 'Creative id', 'AdID', 'Universal Ad ID', 'Kind', 'Duration'].filter(Boolean);
    const rows = report.creativeRows.map((r) => el('tr', { className: r.placeholder ? 'placeholder' : null },
      vmap ? el('td', { className: 'mono' }, [r.breakId, r.timeOffset].filter(Boolean).join(' · ') || '—') : null,
      el('td', { className: 'words' }, r.position),
      el('td', { className: 'mono' }, dash(r.adId)),
      el('td', { className: 'words' }, dash(r.adType)),
      el('td', { className: 'mono' }, dash(r.sequence)),
      el('td', { className: 'words' }, dash(r.role)),
      el('td', { className: 'mono' }, dash(r.creativeId)),
      el('td', { className: 'mono' }, dash(r.adIdAttr)),
      el('td', { className: 'mono' }, dash(r.universalAdId)),
      el('td', {}, r.kind,
        r.fallbackOnNoAd !== null ? el('span', { className: 'fallback-flag' }, `fallbackOnNoAd: ${r.fallbackOnNoAd}`) : null,
        r.url ? el('span', { className: 'placeholder-url' }, urlCell(r.url)) : null),
      el('td', { className: 'mono words' }, dash(r.duration))));
    return table('creatives', headers, rows);
  }

  function trackersTable(report) {
    if (!report.trackers.length) return el('p', { className: 'empty' }, 'No trackers in this response.');
    const groups = new Map();
    for (const t of report.trackers) {
      if (!groups.has(t.type)) groups.set(t.type, []);
      groups.get(t.type).push(t);
    }
    const rows = [...groups].map(([type, list]) => {
      let urls;
      if (list.length === 1) {
        urls = trackerUrl(list[0]);
      } else {
        const listEl = el('ul', { className: 'url-list', hidden: true }, list.map((t) => el('li', {}, trackerUrl(t))));
        const toggle = el('button', {
          type: 'button', className: 'toggle', 'aria-expanded': 'false',
          onclick: () => {
            listEl.hidden = !listEl.hidden;
            toggle.setAttribute('aria-expanded', String(!listEl.hidden));
            toggle.textContent = `${listEl.hidden ? '▸ Show' : '▾ Hide'} ${list.length} URLs`;
          },
        }, `▸ Show ${list.length} URLs`);
        urls = [toggle, listEl];
      }
      return el('tr', { className: 'group-row' },
        el('td', {}, type),
        el('td', { className: 'mono' }, String(list.length)),
        el('td', { className: 'urls' }, urls));
    });
    return table('trackers', ['Type', 'Count', 'URL'], rows);
  }

  function mediaTable(report) {
    if (!report.mediaFiles.length) return el('p', { className: 'empty' }, 'No media files in this response.');
    const rows = report.mediaFiles.map((m) => el('tr', {},
      el('td', { className: 'mono' }, dash(m.adId)),
      el('td', { className: 'mono' }, dash(m.creativeId)),
      el('td', {}, m.kind),
      el('td', { className: 'mono' }, m.resourceType === 'MediaFile' || m.resourceType === 'Mezzanine'
        ? dash(m.type)
        : [m.resourceType, m.type ? ` ${m.type}` : '']),
      el('td', {}, dash(m.delivery)),
      el('td', { className: 'mono' }, m.width && m.height ? `${m.width}×${m.height}` : '—'),
      el('td', { className: 'mono' }, dash(m.bitrate)),
      el('td', { className: 'mono' }, dash(m.codec)),
      el('td', { className: 'mono' }, dash(m.apiFramework)),
      el('td', { className: 'urls' }, urlCell(m.url, m.full))));
    return table('media', ['Ad id', 'Creative id', 'Kind', 'Type', 'Delivery', 'Size', 'Bitrate', 'Codec', 'apiFramework', 'URL'], rows);
  }

  function parametersCell(text) {
    if (!text) return '—';
    if (text.length <= 80) return el('code', {}, text);
    const short = el('code', {}, text.slice(0, 80) + '…');
    let expanded = false;
    const toggle = el('button', {
      type: 'button', className: 'toggle',
      onclick: () => {
        expanded = !expanded;
        short.textContent = expanded ? text : text.slice(0, 80) + '…';
        toggle.textContent = expanded ? 'Show less' : 'Show all';
      },
    }, 'Show all');
    return [short, ' ', toggle];
  }

  function verificationTable(report) {
    if (!report.verifications.length) return el('p', { className: 'empty' }, 'No ad verification in this response.');
    const rows = report.verifications.map((v) => el('tr', {},
      el('td', { className: 'mono' }, dash(v.adId)),
      el('td', {}, dash(v.vendor)),
      el('td', {}, v.resources.length
        ? v.resources.map((r, i) => [i ? el('br') : null, r.resourceType, r.apiFramework ? ` (${r.apiFramework})` : ''])
        : '—'),
      el('td', { className: 'urls' }, v.resources.length
        ? v.resources.map((r, i) => [i ? el('br') : null, urlCell(r.url)])
        : '—'),
      el('td', {}, parametersCell(v.parameters)),
      el('td', { className: 'urls' }, v.trackers.length
        ? el('ul', { className: 'url-list' }, v.trackers.map((t) => el('li', {}, el('span', { className: 'where' }, t.event), el('code', {}, t.url), copyButton(t.url))))
        : '—')));
    return table('verification', ['Ad id', 'Vendor', 'Resource', 'URL', 'Parameters', 'Trackers'], rows);
  }

  function errorNotice(message) {
    return el('p', { className: 'notice error' }, message);
  }

  function initVastTab(panel) {
    const input = el('textarea', {
      id: 'vast-input', rows: 8, spellcheck: 'false', autocomplete: 'off',
      placeholder: '<VAST version="3.0"> … </VAST>  or  <vmap:VMAP …> … </vmap:VMAP>',
    });
    const results = el('div', { className: 'results', 'aria-live': 'polite' });
    panel.append(
      el('div', { className: 'field' },
        el('label', { for: 'vast-input' }, 'VAST or VMAP response'),
        input,
        el('p', { className: 'hint' }, 'VAST 2, 3, 4 and VMAP 1.0 are detected automatically. Nothing is sent anywhere, and linked ad tags are not fetched.')),
      results);

    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(render, 250);
    });

    function render() {
      clear(results);
      if (!input.value.trim()) {
        results.append(el('p', { className: 'empty' }, 'Paste a VAST or VMAP response to format it and list what it contains.'));
        return;
      }
      const parsed = parseXml(input.value, window.DOMParser);
      if (parsed.error) {
        const e = parsed.error;
        const where = e.line ? ` (line ${e.line}${e.column ? `, column ${e.column}` : ''})` : '';
        results.append(errorNotice(`XML error${where}: ${e.message}`));
        return;
      }
      const report = buildReport(parsed.doc, window.DOMParser);
      if (report.error) {
        results.append(errorNotice(report.error));
        return;
      }

      for (const note of [...parsed.notes, ...report.notes]) results.append(el('p', { className: 'notice note' }, note));
      results.append(
        section('Formatted response',
          el('div', { className: 'section-actions' }, copyButton(formatXml(parsed.doc), 'Copy formatted')),
          renderXmlTree(parsed.doc)),
        section('Summary',
          report.empty ? el('p', { className: 'notice' }, 'No ads in this response (empty VAST / no fill).') : null,
          tiles(report)),
        section(`Creatives (${report.creativeRows.length} ${report.creativeRows.length === 1 ? 'row' : 'rows'})`, creativesTable(report)),
        section(`Trackers / beacons (${plural(report.counts.trackers, 'URL')})`, trackersTable(report)),
        section('Media files', mediaTable(report)),
        section('Ad verification', verificationTable(report)));
    }

    render();
  }

  root.AdInspector = Object.assign(root.AdInspector || {}, { initVastTab });
})(typeof window !== 'undefined' ? window : globalThis);
