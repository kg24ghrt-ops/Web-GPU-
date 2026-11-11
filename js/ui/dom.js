export function create(tag, { className, html, text, ...attrs } = {}) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (html !== undefined) el.innerHTML = html;
  if (text !== undefined) el.textContent = text;
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on') && k.length > 2 && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  return el;
}
