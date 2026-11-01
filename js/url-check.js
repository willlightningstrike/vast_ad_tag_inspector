// Compares URL parameters with CSV expectations.
(function (root) {
  function checkParams(params, expectations) {
    const expectedNames = new Set(expectations.map((e) => e.name));
    const groups = { missing: [], unexpected: [], differs: [], passes: [] };

    for (const e of expectations) {
      const found = params.filter((p) => p.name === e.name);
      const row = { name: e.name, inUrl: found.map((p) => p.value), expected: e.expected, unexpected: e.unexpected, status: '' };
      if (e.unexpected !== null && found.some((p) => p.value.includes(e.unexpected) || p.raw.includes(e.unexpected))) row.status = 'unexpected';
      else if (found.length === 0) row.status = e.expected === null && e.unexpected !== null ? 'absent' : 'missing';
      else if (e.expected === null) row.status = 'present';
      else if (found.some((p) => p.value === e.expected || p.raw === e.expected)) row.status = 'match';
      else row.status = 'differs';
      (groups[row.status] || groups.passes).push(row);
    }
    const { missing, unexpected, differs, passes } = groups;

    const notChecked = params
      .filter((p) => !expectedNames.has(p.name))
      .map((p) => ({ name: p.name, inUrl: [p.value], expected: null, unexpected: null, status: 'not-checked' }));

    return {
      rows: [...missing, ...unexpected, ...differs, ...passes, ...notChecked],
      counts: { match: passes.length, problems: missing.length + unexpected.length + differs.length, notChecked: notChecked.length },
    };
  }

  const api = { checkParams };
  root.AdInspector = Object.assign(root.AdInspector || {}, api);
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
