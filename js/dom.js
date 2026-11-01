// Small DOM helpers. Content always goes in as text nodes, never as HTML.
(function (root) {
  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'className') node.className = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : String(value));
    }
    append(node, children);
    return node;
  }

  function append(node, children) {
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false) continue;
      node.appendChild(typeof child === 'string' || typeof child === 'number'
        ? document.createTextNode(String(child))
        : child);
    }
    return node;
  }

  function fallbackCopy(text) {
    const area = el('textarea', { readonly: true, style: 'position:fixed;top:-1000px;opacity:0' });
    area.value = text;
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    area.remove();
    return ok;
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {
      // fall through to the textarea method
    }
    return fallbackCopy(text);
  }

  function copyButton(text, label) {
    const idle = label || 'Copy';
    const btn = el('button', {
      type: 'button',
      className: 'copy',
      title: 'Copy to clipboard',
      onclick: async () => {
        const ok = await copyText(text);
        btn.textContent = ok ? 'Copied' : 'Copy failed';
        setTimeout(() => { btn.textContent = idle; }, 1500);
      },
    }, idle);
    return btn;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  const api = { el, append, copyText, copyButton, clear };
  root.AdInspector = Object.assign(root.AdInspector || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
