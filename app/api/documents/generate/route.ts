import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { query } from '@/lib/db'
import { saveUploadedFile, saveBufferAsUpload, readUploadedFileBuffer } from '@/lib/uploads'
import { marked } from 'marked'

// Same PDF-footer-junk filter used at extraction time (app/api/bids/analyze) -- kept here too
// as a safety net in case a disclaimer line slips through manual edits or the AI formatting
// step, since only Terms & Conditions content should ever end up in the generated document.
function isFooterNoiseLine(line: string): boolean {
  if (!line) return false
  if (/disclaimer/i.test(line)) return true
  if (/(system|computer)[\s-]*generated/i.test(line)) return true
  if (/no\s+signature/i.test(line)) return true
  if (/page\s*\d+\s*(of|\/)\s*\d+/i.test(line)) return true
  if (/^generated\s*(on|date|by)\b/i.test(line)) return true
  if (/^printed\s*(on|by)\b/i.test(line)) return true
  return false
}

function stripDisclaimerLines(text: string): string {
  const lineFiltered = text
    .split('\n')
    .filter((line) => !isFooterNoiseLine(line.trim()))
    .join('\n')

  // Same section-level cutoff as app/api/bids/analyze's extractBuyerAddedTerms -- the
  // generic "Additional Terms and Conditions" (ATC) / General Terms and Conditions (GTC)
  // boilerplate that follows the buyer-specific terms in GeM documents must never end up
  // in a generated document, however termsContent got here (a fresh analysis' buyerTerms
  // is already cut there, but manually typed/pasted content bypasses that entirely).
  const endMarkers = [
    /This Bid is governed by the General Terms and Conditions/i,
    /In terms of GeM GTC/i,
    /Additional\s+Terms\s+(?:and|&)\s+Conditions/i,
  ]
  let cutIndex: number | undefined
  for (const em of endMarkers) {
    const m = lineFiltered.match(em)
    if (m && m.index !== undefined && (cutIndex === undefined || m.index < cutIndex)) {
      cutIndex = m.index
    }
  }
  return cutIndex !== undefined ? lineFiltered.slice(0, cutIndex) : lineFiltered
}

async function imgToDataUrl(filePath: string): Promise<string> {
  try {
    const buf = await readUploadedFileBuffer(path.basename(filePath))
    if (!buf) return ''
    const ext = path.extname(filePath).toLowerCase().replace('.', '')
    const mime =
      ext === 'png'  ? 'image/png'  :
      ext === 'gif'  ? 'image/gif'  :
      ext === 'webp' ? 'image/webp' : 'image/jpeg'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return ''
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()

    const firmId         = formData.get('firmId') as string
    const title          = formData.get('title') as string
    const documentNumber = formData.get('documentNumber') as string | null
    const templateId     = formData.get('templateId') as string | null
    const termsContent   = formData.get('termsContent') as string
    const uploadedBy     = formData.get('uploadedBy') as string | null
    const gemOrderId     = formData.get('gemOrderId') as string | null
    const buyerName      = formData.get('buyerName') as string | null
    const buyerAddress   = formData.get('buyerAddress') as string | null
    const headerImage    = formData.get('headerImage') as File | null
    const bidDocumentId  = formData.get('bidDocumentId') as string | null

    if (!firmId || !title) {
      return NextResponse.json({ error: 'firmId and title are required.' }, { status: 400 })
    }
    if (!templateId && (!headerImage || headerImage.size === 0)) {
      return NextResponse.json({ error: 'Header image or template is required.' }, { status: 400 })
    }

    const [templateRows, firmRows] = await Promise.all([
      templateId
        ? query<Record<string, unknown>>(`SELECT * FROM template WHERE id = ?`, [templateId])
        : Promise.resolve([]),
      query<Record<string, unknown>>(
        `SELECT f.*, a.addressLine, a.city, a.state, a.pincode FROM firm f LEFT JOIN address a ON a.firmId = f.id WHERE f.id = ? LIMIT 1`,
        [firmId]
      ),
    ])

    const template = templateRows[0] || null
    const firm = firmRows[0] || null

    if (templateId && !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const firmName = (firm?.name as string) || (template?.name as string) || 'Company'

    let resolvedHeaderPath = (template?.headerFilePath as string) || ''
    if (headerImage && headerImage.size > 0) {
      const saved = await saveUploadedFile(headerImage, 'header', { folder: 'template', companyName: (firm?.name as string) || null })
      resolvedHeaderPath = saved.filePath
    }

    const headerDataUrl = resolvedHeaderPath ? await imgToDataUrl(resolvedHeaderPath) : ''

    const esc = (s: unknown) =>
      String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    const docNum  = documentNumber?.trim() || 'TC-' + Date.now()
    const docDate = new Date().toLocaleDateString('en-IN', {
      day: '2-digit', month: 'long', year: 'numeric',
    })

    const contactPerson = (firm?.contactPerson as string) || ''

    const toName = (buyerName    || '').trim()
    const toAddr = (buyerAddress || '').trim()

    let parsedContent = stripDisclaimerLines(termsContent || '')
    if (parsedContent) {
      const parsed = await marked.parse(parsedContent, { breaks: true })
      parsedContent = typeof parsed === 'string' ? parsed : String(parsed)
    }

    const headerImgHtml = headerDataUrl
      ? `<img src="${headerDataUrl}" alt="Company Header" style="width:100%;display:block;height:auto;" />`
      : `<div style="padding:20px 40px;font-size:22px;font-weight:800;color:#1e3a8a;text-align:center;">${esc(firmName)}</div>`

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width">
<title>${esc(title)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    font-family:'Segoe UI',Arial,sans-serif;
    font-size:12px;
    line-height:1.65;
    color:#1f2937;
    background:#b0b8c1;
  }

  /* Pages container */
  #pages{
    display:flex;
    flex-direction:column;
    align-items:center;
    gap:18px;
    padding:24px 16px 40px;
  }

  /* Each A4 page */
  .a4pg{
    width:794px;
    height:1123px;
    background:#fff;
    box-shadow:0 4px 18px rgba(0,0,0,.25);
    display:flex;
    flex-direction:column;
    overflow:hidden;
    position:relative;
  }

  /* Page header - full width image, natural height */
  .pg-hdr{
    width:100%;
    background:#fff;
    border-bottom:2px solid #1e3a8a;
    flex-shrink:0;
    line-height:0;
    overflow:hidden;
  }

  /* Page body */
  .pg-bd{
    flex:1;
    padding:22px 38px 18px;
    overflow:hidden;
  }

  /* Page footer */
  .pg-ftr{
    flex-shrink:0;
    padding:7px 38px;
    border-top:1px solid #e5e7eb;
    background:#f9fafb;
    display:flex;
    justify-content:space-between;
    align-items:center;
    font-size:9.5px;
    color:#9ca3af;
  }

  /* Content styles */
  .to-block{margin-bottom:18px}
  .to-lbl{font-weight:700;color:#111827;font-size:12px;margin-bottom:2px}
  .to-name{font-weight:700;color:#1f2937;font-size:12px}
  .to-addr{color:#374151;text-transform:uppercase;font-size:11px;letter-spacing:.3px;margin-top:2px}

  .doc-title{
    font-size:13.5px;font-weight:800;color:#1e3a8a;
    text-align:center;margin:10px 0 14px;
    text-decoration:underline;text-underline-offset:3px;
  }
.doc-gemref{font-weight:800;color:#111827;font-size:13px;margin-bottom:14px}

  /* TC content */
  .tc-wrap h1,.tc-wrap h2{color:#1e3a8a;margin:14px 0 6px;font-size:13px}
  .tc-wrap h3{color:#374151;margin:12px 0 5px;font-size:12.5px;font-weight:700}
  .tc-wrap p{margin-bottom:7px;color:#374151;text-align:justify;font-size:12px}
  .tc-wrap ul,.tc-wrap ol{margin:5px 0 8px 20px}
  .tc-wrap li{margin-bottom:4px;color:#374151;font-size:12px;text-align:justify}
  .tc-wrap table{width:100%;border-collapse:collapse;margin:8px 0;font-size:11px}
  .tc-wrap th{background:#1e3a8a;color:#fff;padding:7px 10px;text-align:left;font-weight:600;font-size:10.5px}
  .tc-wrap td{border:1px solid #d1d5db;padding:6px 10px}
  .tc-wrap strong{color:#111827}

  /* Signature */
  .sig-block{margin-top:30px}
  .sig-thanks{font-weight:700;color:#1f2937;margin-bottom:2px}
  .sig-name{font-weight:700;color:#1f2937}
  .sig-firm{font-weight:700;color:#1f2937;margin-bottom:18px}
  .sig-auth{display:inline-block;text-align:center;min-width:190px;margin-top:4px}
  .sig-auth .for-line{font-style:italic;font-size:11.5px;color:#374151;margin-bottom:28px}
  .sig-auth .sig-line{border-bottom:1px solid #9ca3af;min-width:170px;margin-bottom:5px}
  .sig-auth .prop{font-size:12px;font-weight:700;color:#1f2937;margin-bottom:16px}
  .sig-auth .stamp{font-size:11.5px;font-weight:700;color:#374151;margin-top:3px}
  .sig-auth .auth{font-size:11.5px;font-weight:700;color:#374151}

  /* Print: each a4pg = one physical A4 page */
  @page{size:A4 portrait;margin:0}
  @media print{
    body{background:#fff}
    #pages{padding:0;gap:0;background:#fff}
    .a4pg{
      width:210mm;
      height:297mm;
      box-shadow:none;
      page-break-after:always;
      break-after:page;
    }
    .a4pg:last-child{page-break-after:avoid;break-after:avoid}
    .pg-bd{overflow:visible}
  }
</style>
</head>
<body>

<!-- Hidden: header template -->
<div id="hdr-tpl" style="display:none">${headerImgHtml}</div>

<!-- Hidden: footer texts -->
<span id="ftr-l" style="display:none">${docDate}</span>
<span id="ftr-r" style="display:none">Ref: ${esc(docNum)}${gemOrderId ? ` | ${esc(gemOrderId)}` : ''}</span>

<!-- Source content (off-screen, measured by JS) -->
<div id="src" style="position:absolute;left:-9999px;top:0;width:718px;visibility:visible;">

  ${toName || toAddr ? `<div class="to-block">
    <div class="to-lbl">To,</div>
    ${toName ? `<div class="to-name">${esc(toName)}</div>` : ''}
    ${toAddr ? `<div class="to-addr">${esc(toAddr).replace(/\n/g, '<br>')}</div>` : ''}
  </div>` : ''}

  <div class="doc-title">${esc(title)}</div>

  ${gemOrderId ? `<div class="doc-gemref">${esc(gemOrderId)}</div>` : ''}

  <div class="tc-wrap">${parsedContent}</div>

  <div class="sig-block">
    <div class="sig-thanks">Thanks</div>
    ${contactPerson ? `<div class="sig-name">${esc(contactPerson)}</div>` : ''}
    <div class="sig-firm">${esc(firmName)}</div>
    <div class="sig-auth">
      <div class="for-line">For ${esc(firmName)}</div>
      <div class="sig-line"></div>
      <div class="prop">Proprietor</div>
      <div class="stamp">(Sign &amp; Stamp)</div>
      <div class="auth">Authorized Signatory</div>
    </div>
  </div>

</div>

<!-- Pages are injected here by JS -->
<div id="pages"></div>

<script>
(function () {
  var A4H = 1123;
  var pagesEl = document.getElementById('pages');
  var hdrHtml = document.getElementById('hdr-tpl').innerHTML;
  var ftrL    = document.getElementById('ftr-l').textContent;
  var ftrR    = document.getElementById('ftr-r').textContent;
  var srcEl   = document.getElementById('src');

  function newPage() {
    var pg = document.createElement('div');
    pg.className = 'a4pg';
    pagesEl.appendChild(pg);

    var hdr = document.createElement('div');
    hdr.className = 'pg-hdr';
    hdr.innerHTML = hdrHtml;
    pg.appendChild(hdr);

    var bd = document.createElement('div');
    bd.className = 'pg-bd';
    pg.appendChild(bd);

    var ftr = document.createElement('div');
    ftr.className = 'pg-ftr';
    ftr.innerHTML = '<span>' + ftrL + '</span><span>' + ftrR + '</span>';
    pg.appendChild(ftr);

    var hH = hdr.offsetHeight;
    var fH = ftr.offsetHeight;
    /* scrollHeight of pg-bd already includes its own padding */
    var maxScroll = A4H - hH - fH;

    return { body: bd, max: maxScroll };
  }

  window.addEventListener('load', function () {
    /* Collect direct children of #src - these are the content blocks */
    var nodes = Array.from(srcEl.children);

    function makeTcWrapBlock(el) {
      var wrapper = document.createElement('div');
      wrapper.className = 'tc-wrap';
      wrapper.style.cssText = 'margin:0;padding:0';
      wrapper.appendChild(el.cloneNode(true));
      return wrapper;
    }

    function measureStandalone(el) {
      srcEl.appendChild(el);
      var h = el.getBoundingClientRect().height;
      srcEl.removeChild(el);
      return h;
    }

    /* Any single element that's still taller than a full page (a long list, a table, a
       group of paragraphs wrapped in a div, nested sub-lists, etc.) gets recursively
       broken down into its own children -- one level at a time -- until each piece fits,
       or it has no further children to split by (a genuinely atomic block, left as-is
       and covered by the overflow-visible safety net below). This replaces the earlier
       fix that only special-cased <ul>/<ol>, which still lost content whenever clauses
       were grouped in some other wrapper (nested lists, divs, etc). */
    var PAGE_BUDGET = 500;
    function explode(el) {
      if (measureStandalone(el) <= PAGE_BUDGET) return [el];
      var children = Array.from(el.children);
      if (children.length < 2) return [el];

      var startAttr = el.tagName === 'OL' ? el.getAttribute('start') : null;
      var base = startAttr ? parseInt(startAttr, 10) : 1;
      var out = [];
      for (var i = 0; i < children.length; i++) {
        var wrap = document.createElement(el.tagName);
        wrap.className = el.className;
        if (el.tagName === 'OL') wrap.setAttribute('start', String(base + i));
        wrap.appendChild(children[i].cloneNode(true));
        out.push.apply(out, explode(wrap));
      }
      return out;
    }

    /* For tc-wrap, unwrap to get individual elements for finer distribution */
    var allBlocks = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.className === 'tc-wrap') {
        var kids = Array.from(n.children);
        for (var k = 0; k < kids.length; k++) {
          var pieces = explode(kids[k]);
          for (var p = 0; p < pieces.length; p++) {
            allBlocks.push(makeTcWrapBlock(pieces[p]));
          }
        }
      } else {
        allBlocks.push(n.cloneNode(true));
      }
    }

    /* Measure each block's natural height inside #src's own unconstrained, off-screen
       context BEFORE deciding which page it lands on. Relying on cur.body.scrollHeight
       while cur.body sits inside an overflow:hidden flex column (as before) is not
       reliable across browsers -- some report the clipped/flexed height instead of the
       true content height, so pages never fill up and everything lands on page 1. */
    var heights = allBlocks.map(function (b) {
      srcEl.appendChild(b);
      var h = b.getBoundingClientRect().height;
      srcEl.removeChild(b);
      return h;
    });

    var cur = newPage();
    var used = 0;

    for (var j = 0; j < allBlocks.length; j++) {
      var clone = allBlocks[j];
      var h = heights[j];

      if (used > 0 && used + h > cur.max) {
        cur = newPage();
        used = 0;
      }

      cur.body.appendChild(clone);
      used += h;

      /* Safety net: a single block taller than a whole page (e.g. a large table, or a
         list/paragraph that still wasn't split finely enough) must never be silently
         clipped away by this page's overflow:hidden. Letting it spill past the visual
         page boundary looks imperfect but guarantees no content is ever lost. */
      if (h > cur.max) {
        cur.body.style.overflow = 'visible';
        if (cur.body.parentElement) cur.body.parentElement.style.overflow = 'visible';
      }
    }

    srcEl.remove();
  });
})();
</script>
</body>
</html>`

    const uniqueFilename = `generated_${Date.now()}.html`
    const htmlBuffer = Buffer.from(fullHtml, 'utf8')
    await saveBufferAsUpload(htmlBuffer, uniqueFilename, 'text/html', 'generatedDoc', (firm?.name as string) || null)

    const fileSize = htmlBuffer.byteLength
    const filePath = `/uploads/${uniqueFilename}`

    const docId = crypto.randomUUID()
    const metaId = crypto.randomUUID()

    await query(
      `INSERT INTO document (id, firmId, title, documentNumber, bidDocumentId, issueDate, expiryDate, isArchived, isDeleted, createdOn) VALUES (?, ?, ?, ?, ?, NULL, NULL, 0, 0, NOW())`,
      [docId, firmId, title, docNum, bidDocumentId || null]
    )
    await query(
      `INSERT INTO documentmeta (id, documentId, categoryCode, departmentCode, statusCode, description, keywords, fileName, fileSize, fileType, tags, filePath, uploadedBy, uploadDate, version, approvalStatus) VALUES (?, ?, NULL, NULL, NULL, ?, NULL, ?, ?, ?, NULL, ?, ?, NOW(), 1, 'APPROVED')`,
      [metaId, docId, 'Auto-generated Terms & Conditions document', uniqueFilename, fileSize, 'text/html', filePath, uploadedBy || 'system']
    )

    if (firm) {
      query(
        `INSERT INTO notification (id, title, message, type, isRead, createdOn) VALUES (?, ?, ?, ?, 0, NOW())`,
        [crypto.randomUUID(), 'Document Generated', `Document '${title}' has been generated successfully.`, 'success']
      ).catch((err) => console.error('Notification insert failed:', err))
      // No email is sent for generated documents.
    }

    const [docRow] = await query<Record<string, unknown>>(
      `SELECT d.*, dm.id AS meta_id, dm.categoryCode, dm.departmentCode, dm.statusCode, dm.description, dm.keywords, dm.fileName, dm.fileSize, dm.fileType, dm.tags, dm.filePath, dm.uploadedBy, dm.uploadDate, dm.version
       FROM document d LEFT JOIN documentmeta dm ON dm.documentId = d.id WHERE d.id = ?`,
      [docId]
    )

    const document = {
      ...docRow,
      isArchived: !!docRow?.isArchived,
      isDeleted: !!docRow?.isDeleted,
      meta: docRow?.meta_id ? {
        id: docRow.meta_id,
        documentId: docId,
        categoryCode: docRow.categoryCode,
        departmentCode: docRow.departmentCode,
        statusCode: docRow.statusCode,
        description: docRow.description,
        keywords: docRow.keywords,
        fileName: docRow.fileName,
        fileSize: docRow.fileSize,
        fileType: docRow.fileType,
        tags: docRow.tags,
        filePath: docRow.filePath,
        uploadedBy: docRow.uploadedBy,
        uploadDate: docRow.uploadDate,
        version: docRow.version,
        category: null,
        department: null,
        status: null,
      } : null,
    }

    return NextResponse.json(document, { status: 201 })
  } catch (error) {
    console.error('Document generation error:', error)
    return NextResponse.json({ error: 'Failed to generate document' }, { status: 500 })
  }
}
