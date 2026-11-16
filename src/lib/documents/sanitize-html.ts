const ALLOWED_TAGS = new Set(['p','div','span','br','hr','h1','h2','h3','h4','h5','h6','strong','b','em','i','u','s','ul','ol','li','blockquote','font','table','thead','tbody','tfoot','tr','td','th','img','a']);
const BLOCKED_BLOCKS = /<(script|style|iframe|object|embed|svg|math|form|input|video|audio|canvas|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const VOID_TAGS = new Set(['br','hr','img']);

function safeStyle(value: string, allowPositionedField = false): string {
  const allowed = new Set(['color','background-color','font-size','font-family','font-weight','font-style','text-decoration','text-align','line-height','direction','width','height','max-width','border','border-color','border-width','border-style','vertical-align','padding','margin','transform','transform-origin','z-index','position','left','top','float','margin-left','margin-right']);
  return value.split(';').map((part) => {
    const index = part.indexOf(':');
    if (index < 1) return '';
    const name = part.slice(0,index).trim().toLowerCase();
    const content = part.slice(index+1).trim();
    if (!allowed.has(name) || !content || /url\s*\(|expression|javascript:|@import|[<>\\]/i.test(content)) return '';
    if (name === 'transform' && !/^rotate\(-?(?:\d{1,3})deg\)$/i.test(content)) return '';
    if (name === 'transform-origin' && !/^(center|top|bottom|left|right|center center)$/i.test(content)) return '';
    if (name === 'z-index' && !/^-?\d{1,2}$/.test(content)) return '';
    if (name === 'position' && content !== 'relative' && !(allowPositionedField && content === 'absolute')) return '';
    if (['left','top'].includes(name) && !/^-?\d{1,3}px$/.test(content)) return '';
    if (name === 'float' && !/^(left|right|none)$/.test(content)) return '';
    if (['margin-left','margin-right'].includes(name) && !/^(auto|0|-?\d{1,3}(?:px|%))$/.test(content)) return '';
    if (name === 'font-size' && !/^(?:\d{1,2}(?:\.\d+)?)(?:px|pt|em|rem|%)$/i.test(content)) return '';
    if (name === 'text-align' && !/^(left|right|center|justify|start|end)$/i.test(content)) return '';
    if (name === 'direction' && !/^(ltr|rtl)$/i.test(content)) return '';
    return name + ':' + content;
  }).filter(Boolean).join(';');
}

function safeUrl(value: string, image = false): string {
  const trimmed = value.trim();
  if (image) return /^\/api\/(?:documents\/images\?path=[A-Za-z0-9%._/-]+|public\/document-verification\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/qr)$/i.test(trimmed) ? trimmed : '';
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) return trimmed;
  return '';
}

/** Conservative allow-list sanitizer shared by browser and server code. */
export function sanitizeDocumentHtml(input: unknown): string {
  let html = String(input ?? '').slice(0, 1_500_000);
  html = html.replace(/<!--[\s\S]*?-->/g, '').replace(BLOCKED_BLOCKS, '');
  html = html.replace(/<![^>]*>/g, '');
  return html.replace(/<\/?([a-z][a-z0-9-]*)\b([^>]*)>/gi, (whole, rawTag: string, rawAttrs: string) => {
    const tag = String(rawTag).toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (whole.startsWith('</')) return VOID_TAGS.has(tag) ? '' : '</' + tag + '>';
    const attrs: string[] = [];
    const allowPositionedField = /data-document-field\\s*=\\s*(["']true["']|true)/i.test(rawAttrs) && /class\\s*=\\s*(["'][^"']*document-positioned-field[^"']*["'])/i.test(rawAttrs);
    const matcher = /([a-zA-Z_:][a-zA-Z0-9:._-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/g;
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(rawAttrs))) {
      const name = match[1].toLowerCase();
      const value = match[2] ?? match[3] ?? match[4] ?? '';
      if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction') continue;
      if (name === 'style') {
        const style = safeStyle(value, allowPositionedField);
        if (style) attrs.push('style="' + style.replace(/&/g,'&amp;').replace(/"/g,'&quot;') + '"');
      } else if (name === 'href' && tag === 'a') {
        const url = safeUrl(value);
        if (url) attrs.push('href="' + url.replace(/&/g,'&amp;').replace(/"/g,'&quot;') + '"');
      } else if (name === 'src' && tag === 'img') {
        const url = safeUrl(value, true);
        if (url) attrs.push('src="' + url.replace(/&/g,'&amp;').replace(/"/g,'&quot;') + '"');
      } else if (['alt','title','dir','colspan','rowspan','width','height','size','class','data-page-break','data-document-field','data-document-locked','contenteditable','tabindex'].includes(name)) {
        if (name === 'dir' && !/^(ltr|rtl|auto)$/i.test(value)) continue;
        if (['colspan','rowspan'].includes(name) && !/^[1-9]\d?$/.test(value)) continue;
        if (name === 'size' && !/^[1-7]$/.test(value)) continue;
        if (name === 'class' && !value.split(/\\s+/).every(token => ['document-page-break','document-positioned-field','document-field-drag-handle','document-positioned-field-selected'].includes(token))) continue;
        if (name === 'data-page-break' && value !== 'true') continue;
        if (name === 'data-document-field' && value !== 'true') continue;
        if (name === 'data-document-locked' && !/^(true|false)$/.test(value)) continue;
        if (name === 'contenteditable' && !/^(true|false)$/.test(value)) continue;
        if (name === 'tabindex' && !/^(?:-1|0)$/.test(value)) continue;
        if (['width','height'].includes(name) && !/^\d{1,4}(?:px|%)?$/.test(value)) continue;
        attrs.push(name + '="' + value.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;') + '"');
      }
    }
    return '<' + tag + (attrs.length ? ' ' + attrs.join(' ') : '') + '>';
  });
}
