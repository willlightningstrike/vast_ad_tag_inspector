// "VAST ad tag URL" tab: paste a URL, upload a CSV, see each parameter checked.
(function (root) {
  const { el, clear, parseAdUrl, parseExpectations, checkParams } = root.AdInspector;

  const RESULT_TEXT = {
    missing: '✗ parameter missing',
    unexpected: '✗ unexpected value',
    differs: '✗ value differs',
    match: '✓',
    present: '✓ present',
    absent: '✓ not present',
    'not-checked': 'not checked',
  };

  function initUrlTab(panel) {
    let expectations = null;
    let fileName = null;

    const urlInput = el('textarea', {
      id: 'url-input', rows: 4, spellcheck: 'false', autocomplete: 'off',
      placeholder: 'https://ads.example.com/vast?iu=/1234/video&sz=640x480&output=vast',
    });
    const fileInput = el('input', { type: 'file', id: 'csv-input', accept: '.csv,text/csv,text/plain', className: 'visually-hidden' });
    const fileStatus = el('span', { className: 'file-status' });
    const clearBtn = el('button', { type: 'button', className: 'link-button', hidden: true }, 'Clear');
    const results = el('div', { className: 'results', 'aria-live': 'polite' });

    panel.append(
      el('div', { className: 'field' },
        el('label', { for: 'url-input' }, 'VAST ad tag URL'),
        urlInput),
      el('div', { className: 'field' },
        el('span', { className: 'field-label' }, 'Expected parameters'),
        el('div', { className: 'file-row' },
          el('label', { for: 'csv-input', className: 'button' }, 'Choose CSV file'),
          fileInput, fileStatus, clearBtn),
        el('p', { className: 'hint' },
          'One parameter per line, as ', el('code', {}, 'name,expected value'),
          ', or just ', el('code', {}, 'name'), ' to check it is present. Add a third value, as in ',
          el('code', {}, 'name,expected value,unexpected value'), ' or ', el('code', {}, 'name,,unexpected value'),
          ', to flag a parameter whose value contains it. Put quotes around a value that has a comma.')),
      results);

    function setFile(name, text) {
      fileName = name;
      expectations = text === null ? null : parseExpectations(text);
      fileStatus.textContent = name ? `${name} · ${expectations.length} expected parameter${expectations.length === 1 ? '' : 's'}` : '';
      clearBtn.hidden = !name;
      render();
    }

    // Each choice or Clear bumps this, so a slower, older read can't overwrite a newer state.
    let readId = 0;
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const id = ++readId;
      const reader = new FileReader();
      reader.onload = () => { if (id === readId) setFile(file.name, String(reader.result)); };
      reader.onerror = () => { if (id === readId) fileStatus.textContent = `Could not read ${file.name}.`; };
      reader.readAsText(file);
      fileInput.value = '';
    });
    clearBtn.addEventListener('click', () => { readId++; setFile(null, null); });
    urlInput.addEventListener('input', render);

    function render() {
      clear(results);
      if (!urlInput.value.trim()) {
        results.append(el('p', { className: 'empty' }, 'Paste an VAST ad tag URL to see its parameters.'));
        return;
      }
      const parsed = parseAdUrl(urlInput.value);
      if (parsed.error) {
        results.append(el('p', { className: 'notice error' }, parsed.error));
        return;
      }
      if (parsed.params.length === 0 && !(expectations && expectations.length)) {
        results.append(el('p', { className: 'notice' }, 'This URL has no query parameters.'));
        return;
      }

      const check = checkParams(parsed.params, expectations || []);
      const c = check.counts;
      const showUnexpected = check.rows.some((r) => r.unexpected !== null);
      results.append(
        parsed.base ? el('p', { className: 'endpoint' }, el('span', {}, 'Endpoint '), el('code', {}, parsed.base)) : null,
        el('p', { className: 'counts' },
          el('span', { className: 'count count-match' }, `${c.match} match`),
          el('span', { className: 'count count-problem' }, `${c.problems} problem${c.problems === 1 ? '' : 's'}`),
          el('span', { className: 'count count-unchecked' }, `${c.notChecked} not checked`),
          fileName ? null : el('span', { className: 'count-hint' }, 'Choose a CSV file to check expected values.')),
        el('div', { className: 'table-wrap' },
          el('table', { className: 'data checks' },
            el('thead', {}, el('tr', {},
              el('th', { scope: 'col' }, 'Parameter'),
              el('th', { scope: 'col' }, 'In URL'),
              el('th', { scope: 'col' }, 'Expected (CSV)'),
              showUnexpected ? el('th', { scope: 'col' }, 'Unexpected (CSV)') : null,
              el('th', { scope: 'col' }, 'Result'))),
            el('tbody', {}, check.rows.map((row) => rowFor(row, showUnexpected))))));
    }

    function rowFor(row, showUnexpected) {
      const inUrl = row.inUrl.length
        ? row.inUrl.map((v, i) => [i ? el('br') : null, v === '' ? el('span', { className: 'muted' }, '(empty)') : v])
        : '—';
      let expected = row.expected;
      if (expected === null) expected = row.status === 'not-checked' ? '—' : el('span', { className: 'muted' }, 'any value');
      return el('tr', { className: `status-${row.status}` },
        el('td', { className: 'mono' }, row.name),
        el('td', { className: 'mono' }, inUrl),
        el('td', { className: 'mono' }, expected),
        showUnexpected ? el('td', { className: 'mono' }, row.unexpected === null ? '—' : row.unexpected) : null,
        el('td', { className: 'result' }, RESULT_TEXT[row.status]));
    }

    render();
  }

  root.AdInspector = Object.assign(root.AdInspector || {}, { initUrlTab });
})(typeof window !== 'undefined' ? window : globalThis);
