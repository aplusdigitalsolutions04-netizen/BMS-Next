import { marked } from 'marked';

marked.use({ gfm: true, breaks: false });

export function pdfUrl(p: string): string {
  return `/${(p || '').replace(/\\/g, '/').replace(/^\/+/, '')}`;
}

export function formatDate(d: string) {
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return d; }
}

export function extractGemId(text: string): string {
  const m = text.match(/GEM\/\d{4}\/[A-Z]\/\d+/i);
  return m ? m[0] : '';
}

export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script,iframe,object,embed,link,style,base,meta').forEach(el => el.remove())
  doc.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on') || /^(href|src|action|formaction|data)$/i.test(attr.name) && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name)
      }
    })
  })
  return doc.body.innerHTML
}

export function cleanMarkdown(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];

  for (const line of lines) {
    const t = line.trim();

    if (/^\|/.test(t) && !/^\|[-: ]+\|/.test(t)) {
      const cells = t.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 2) {
        const valueCells = cells.slice(1);
        const allEmpty = valueCells.every(c =>
          /^\*?(?:not mentioned[^*]*|n\/a|not applicable|not available|--|-)\*?\.?$/i.test(c) || c === ''
        );
        if (allEmpty) continue;
      }
    }

    if (/^[-*]\s/.test(t)) {
      const content = t.replace(/^[-*]\s+/, '').replace(/\*\*[^*]+:\*\*\s*/g, '').trim();
      if (/^\*?(?:not mentioned[^*]*|n\/a|not applicable|not available)\*?\.?$/i.test(content)) continue;
    }

    if (/^\*not mentioned[^*]*\*\.?$/i.test(t)) continue;

    out.push(line);
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

export async function mdToHtml(md: string): Promise<string> {
  let html = await marked.parse(md);
  if (typeof html !== 'string') html = String(html);
  html = html.replace(/<table>([\s\S]*?)<\/table>/gi, (match, inner) => {
    const thCount = (inner.match(/<th[\s>]/gi) || []).length;
    return thCount === 2 ? `<table class="two-col-table">${inner}</table>` : match;
  });
  return html;
}

export async function renderMdParts(text: string): Promise<{ overview: string; detail: string }> {
  const cleaned = cleanMarkdown(text);
  const sections = cleaned.split(/(?=^#{2,3} )/m);
  let overviewMd = '';
  let detailMd = '';
  for (const s of sections) {
    const lines = s.trim().split('\n');
    if (lines.length === 1 && /^#{2,3} /.test(lines[0])) continue;
    const headingLine = lines[0] || '';
    if (/quick overview|tender overview|bid overview/i.test(headingLine)) overviewMd += s;
    else detailMd += s;
  }
  if (!overviewMd.trim() && sections.length > 1) {
    const firstTableIdx = sections.findIndex(s => /^\|.+\|/m.test(s));
    if (firstTableIdx >= 0) {
      overviewMd = sections[firstTableIdx];
      detailMd = sections.filter((_, i) => i !== firstTableIdx).join('');
    }
  }
  const [overview, detail] = await Promise.all([
    overviewMd.trim() ? mdToHtml(overviewMd) : Promise.resolve(''),
    detailMd.trim()   ? mdToHtml(detailMd)   : Promise.resolve(''),
  ]);
  return { overview, detail };
}

export function extractBuyerInfo(parameters: { name: string; value: string | null }[]): { name: string; address: string } {
  const get = (re: RegExp) => parameters?.find(p => re.test(p.name))?.value || '';
  const ministry   = get(/^ministry$/i);
  const department = get(/^department$/i);
  const name = [ministry, department].filter(Boolean).join(' -- ') || ministry || department || '';
  const address = get(/bid address|consignee|delivery address|buyer address/i);
  return { name: name.trim(), address: address.trim() };
}

export function extractTermsAndConditions(summary: string, parameters: { name: string; value: string | null }[]): string {
  const param = parameters?.find(p => p.name.match(/terms? & conditions?/i));
  if (param && param.value) return param.value;

  if (!summary) return '';
  const lines = summary.split('\n');
  let insideTerms = false;
  const termsLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^##+\s*.*terms?\s*(&|and)\s*conditions?/i.test(trimmed)) {
      insideTerms = true;
      continue;
    }
    if (insideTerms && /^##+\s/i.test(trimmed)) {
      break;
    }
    if (insideTerms) {
      termsLines.push(line);
    }
  }

  if (termsLines.length > 0) {
    return termsLines.join('\n').trim();
  }

  return '';
}

export function getBidTheme(darkMode: boolean) {
  return {
    cardBg: darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200',
    textPrimary: darkMode ? 'text-white' : 'text-gray-900',
    textSecondary: darkMode ? 'text-gray-400' : 'text-gray-500',
    divider: darkMode ? 'border-gray-700' : 'border-gray-200',
    inputClass: `w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition ${
      darkMode
        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-blue-500'
        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'}`,
  };
}
