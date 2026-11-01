// Wires up the tabs and starts each tool.
(function (root) {
  const A = root.AdInspector;
  const KEY = 'ad-inspector-tab';

  function show(name) {
    for (const btn of document.querySelectorAll('[data-tab]')) {
      const active = btn.dataset.tab === name;
      btn.setAttribute('aria-selected', String(active));
      btn.tabIndex = active ? 0 : -1;
      document.getElementById(btn.getAttribute('aria-controls')).hidden = !active;
    }
    try { localStorage.setItem(KEY, name); } catch (e) { /* storage unavailable */ }
  }

  const tabs = [...document.querySelectorAll('[data-tab]')];
  tabs.forEach((btn, i) => {
    btn.addEventListener('click', () => show(btn.dataset.tab));
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      show(next.dataset.tab);
      next.focus();
    });
  });

  A.initUrlTab(document.getElementById('panel-url'));
  if (A.initVastTab) A.initVastTab(document.getElementById('panel-vast'));

  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { saved = null; }
  show(saved === 'vast' ? 'vast' : 'url');
})(window);
