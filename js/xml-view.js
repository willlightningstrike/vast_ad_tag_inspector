// Renders a parsed XML document as an indented, colour-coded, foldable tree.
// Every piece of content is inserted as text, so pasted markup can never run.
(function (root) {
  const { el, textPieces, escText, escAttr } = root.AdInspector;
  const ELEMENT = 1, TEXT = 3, CDATA = 4, COMMENT = 8;

  function openTag(node, selfClose) {
    const parts = ['<', el('span', { className: 'x-tag' }, node.nodeName)];
    for (let i = 0; i < node.attributes.length; i++) {
      const a = node.attributes[i];
      parts.push(' ', el('span', { className: 'x-attr' }, a.name), '=', el('span', { className: 'x-val' }, `"${escAttr(a.value)}"`));
    }
    parts.push(selfClose ? '/>' : '>');
    return parts;
  }

  const closeTag = (node) => ['</', el('span', { className: 'x-tag' }, node.nodeName), '>'];

  // Text is shown escaped, as it is written in XML; CDATA is shown as-is inside its markers.
  function textPart(node) {
    const t = (node.nodeValue || '').trim();
    return node.nodeType === CDATA ? el('span', { className: 'x-cdata' }, `<![CDATA[${t}]]>`) : escText(t);
  }

  function piecePart(p) {
    if (p.kind === 'cdata') return el('span', { className: 'x-cdata' }, `<![CDATA[${p.text}]]>`);
    if (p.kind === 'comment') return el('span', { className: 'x-comment' }, `<!--${p.text}-->`);
    return escText(p.text);
  }

  function significantChildren(node) {
    const kids = [];
    for (let n = node.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === ELEMENT || n.nodeType === COMMENT) kids.push(n);
      else if ((n.nodeType === TEXT || n.nodeType === CDATA) && (n.nodeValue || '').trim()) kids.push(n);
    }
    return kids;
  }

  function renderNode(node) {
    if (node.nodeType === COMMENT) return el('div', { className: 'x-comment' }, `<!--${node.nodeValue}-->`);
    if (node.nodeType !== ELEMENT) return el('div', { className: 'leaf' }, textPart(node));
    const kids = significantChildren(node);
    if (kids.length === 0) return el('div', { className: 'leaf' }, openTag(node, true));
    const pieces = textPieces(node);
    if (pieces.length) {
      return el('div', { className: 'leaf' }, openTag(node, false), pieces.map(piecePart), closeTag(node));
    }
    return el('details', { open: true },
      el('summary', {}, openTag(node, false), el('span', { className: 'ellipsis' }, ' … ', closeTag(node))),
      el('div', { className: 'kids' }, kids.map(renderNode)),
      el('div', { className: 'close' }, closeTag(node)));
  }

  function renderXmlTree(doc) {
    return el('div', { className: 'xml-view' }, renderNode(doc.documentElement));
  }

  root.AdInspector = Object.assign(root.AdInspector || {}, { renderXmlTree });
})(typeof window !== 'undefined' ? window : globalThis);
