import { NextRequest, NextResponse } from 'next/server'
import pdfParse from 'pdf-parse'
import openai from '@/lib/openai'
import { saveUploadedFile } from '@/lib/uploads'

// Lines that are PDF page-footer junk (per-page disclaimer, page numbers, generation timestamps)
// rather than actual buyer T&C content. GeM PDFs repeat these on EVERY page, so they must be
// stripped line-by-line as noise -- they can't be used as a single "end of section" cutoff
// (a fixed cutoff on the first occurrence truncated multi-page T&C after page 1).
function isFooterNoiseLine(line: string): boolean {
  if (!line) return true
  if (/^all the buyer-added bid-specific terms/i.test(line)) return true
  if (/^GEM\/\d{4}\/[A-Z]\/\d+$/i.test(line)) return true
  if (/disclaimer/i.test(line)) return true
  if (/(system|computer)[\s-]*generated/i.test(line)) return true
  if (/no\s+signature/i.test(line)) return true
  if (/page\s*\d+\s*(of|\/)\s*\d+/i.test(line)) return true
  if (/^page\s*\d+$/i.test(line)) return true
  if (/^\d{1,4}\s*\/\s*\d{1,4}$/.test(line)) return true
  // NOTE: a bare standalone number line (e.g. "9") used to be stripped here as a
  // presumed page number, but PDF text extraction often puts a numbered clause's
  // "9." on its own line, separate from the clause text on the next line -- that
  // silently deleted the marker and merged/lost real T&C clauses (9, 10, 11, ...).
  // Real page-number-only footers are still caught by the "Page N" / "N of M" rules above.
  if (/^generated\s*(on|date|by)\b/i.test(line)) return true
  if (/^dated\s*:/i.test(line)) return true
  if (/^printed\s*(on|by)\b/i.test(line)) return true
  return false
}

// Extract the VERBATIM "Buyer Added Bid Specific Terms and Conditions" block from raw text.
function extractBuyerAddedTerms(rawText: string): string {
  if (!rawText) return ''
  const norm = rawText.replace(/\r/g, '')
  const heading = norm.match(/Buyer\s+Added\s+Bid\s+Specific\s+Terms\s+(?:and|&)\s+Conditions/i)
  if (!heading || heading.index === undefined) return ''

  let section = norm.slice(heading.index + heading[0].length)

  // Only genuine one-time closing markers -- NOT "Disclaimer", which repeats on every page
  // footer and would truncate multi-page T&C content after just the first page.
  // "Additional Terms and Conditions" / "ATC" is a separate, generic boilerplate section
  // that follows the buyer-specific terms in GeM PDFs -- it must stop extraction too,
  // otherwise that generic section gets appended onto the real buyer terms.
  const endMarkers = [
    /This Bid is governed by the General Terms and Conditions/i,
    /In terms of GeM GTC/i,
    /Additional\s+Terms\s+(?:and|&)\s+Conditions/i,
    /\n\s*---+\s*\n/,
  ]
  // Cut at whichever marker occurs EARLIEST in the text, not just the first one in this
  // list that happens to match -- array order isn't necessarily the order they appear in.
  let cutIndex: number | undefined
  for (const em of endMarkers) {
    const e = section.match(em)
    if (e && e.index !== undefined && (cutIndex === undefined || e.index < cutIndex)) {
      cutIndex = e.index
    }
  }
  if (cutIndex !== undefined) {
    section = section.slice(0, cutIndex)
  }

  const lines = section.split('\n').map((l) => l.trim())
  const out: string[] = []
  let buffer = ''
  const flush = () => { if (buffer.trim()) out.push(buffer.trim()); buffer = '' }

  for (const line of lines) {
    if (isFooterNoiseLine(line)) { flush(); continue }
    if (/^\d+\.\s+\S/.test(line) && line.length < 90) {
      flush()
      out.push('SHS' + line)
      continue
    }
    buffer += (buffer ? ' ' : '') + line
  }
  flush()

  return out
    .map((p) => (p.startsWith('SHS') ? `\n### ${p.slice(3)}` : p))
    .join('\n\n')
    .trim()
}

export async function POST(req: NextRequest) {
  // Early check -- detect placeholder OpenAI key
  const apiKey = process.env.OPENAI_API_KEY || ''
  if (!apiKey || apiKey.includes('...') || apiKey === 'your-openai-api-key') {
    return NextResponse.json(
      { error: 'OpenAI API key is not configured. Replace OPENAI_API_KEY in .env.local with your actual key.' },
      { status: 500 }
    )
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const saved = await saveUploadedFile(file, 'file', { folder: 'bidPdf' })

    // 1. Parse PDF -- read straight from the uploaded file's own bytes (kept in memory
    // above) rather than reading it back from storage, since it now lives in Google Drive
    // rather than the local uploads/ folder.
    let rawText = ''
    try {
      const pdfData = await pdfParse(fileBuffer)
      rawText = pdfData.text
    } catch (pdfErr) {
      console.error('PDF parse error:', pdfErr)
      return NextResponse.json(
        { error: 'Failed to parse PDF. Please upload a valid text-based PDF (scanned image PDFs are not supported).' },
        { status: 400 }
      )
    }

    if (!rawText || rawText.trim().length === 0) {
      return NextResponse.json(
        { error: 'No text could be extracted from the PDF. Scanned or image-based PDFs are not supported — please use a text-based PDF.' },
        { status: 400 }
      )
    }

    // 2. Analyze with OpenAI
    const prompt = `You are a Senior Bid/Tender Analyst specializing in Indian government procurement -- GeM (Government e-Marketplace), CPPP, GePNIC, state e-procurement portals, and private sector tenders.

Thoroughly read the ENTIRE document text below and produce a **JSON object**.
The JSON MUST have EXACTLY two keys:
1. "summaryMarkdown": A complete, accurate, well-structured Markdown report just like you usually write. Use ## headings, ### sub-headings, tables, etc.
2. "parameters": An array of objects, where each object has EXACTLY "name" and "value" keys. Extract the following specific parameters exactly:
- "Bid Number"
- "Category"
- "Department"
- "Ministry"
- "Bid End Date"
- "Bid End Time"
- "EMD Required" (Strictly "Yes" or "No")
- "EMD Amount" (Extract amount)
- "EPBG Required" (Strictly "Yes" or "No")
- "EPBG Amount"
- "RA Required" (Strictly "Yes" or "No")
- "RA Type"
- "Bid Address"
- "Terms & Conditions" (Extract ONLY the "Buyer Added Bid Specific Terms and Conditions" section -- payment terms, delivery timelines, guarantee/warranty, and other conditions specific to THIS bid, as a comprehensive text block. Do NOT include the generic "Additional Terms and Conditions" (ATC) boilerplate section, or the standard "General Terms and Conditions" / GeM GTC clauses that follow it -- those are the same on every bid, not buyer-specific).


ALSO, for EACH item in the tender, add three parameters:
- "Item Name N" (where N is the sequence number starting from 1)
- "Item Quantity N"
- "Item Specifications N" (Extract all the detailed technical specifications, model requirements, key features, or description of the product/item exactly as specified in the document. Do not summarize this; capture the key specs).

ALSO, add TWO parameters related to documents:
- "Documents Required" (Strictly "Yes" or "No")
- "Document Details" (Store all required document names separated by a comma or line break).

RULES FOR PARAMETERS:
- Missing value? Store null for "value".
- Yes/No fields MUST be exactly "Yes" or "No".
- Keep the names exactly as requested.

RULES FOR SUMMARY MARKDOWN:
- Extract EVERY detail present. Do NOT skip, merge, or summarize away any data.
- Include a 2-column table for Quick Overview.
- Include detailed description, technical specifications, EMD details, MSME benefits, timeline, terms & conditions.

IMPORTANT -- the document text below is extracted from a PDF and repeats page-footer junk on
every page: disclaimers ("Disclaimer: this is a system/computer generated document..."), "no
signature required" notices, page numbers, and generation timestamps. These are NOT part of
the tender's actual terms and conditions -- do not mention them, quote them, or include them
anywhere in "summaryMarkdown" or the "Terms & Conditions" parameter value.

DOCUMENT TEXT:
${rawText.split('\n').filter((line) => !isFooterNoiseLine(line.trim())).join('\n').substring(0, 60000)}`

    let completion
    try {
      completion = await openai.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 16000,
        response_format: { type: 'json_object' },
      })
    } catch (aiErr) {
      const detail = String(aiErr)
      console.error('OpenAI call failed:', detail)
      const msg = detail.includes('401') || detail.toLowerCase().includes('auth') || detail.toLowerCase().includes('api key')
        ? 'OpenAI API key is invalid. Set the correct key in .env.local and restart the server.'
        : detail.includes('429')
          ? 'OpenAI rate limit reached. Please try again after a moment.'
          : `OpenAI error: ${detail.slice(0, 200)}`
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    if (completion.choices[0]?.finish_reason === 'length') {
      console.error('bids/analyze: OpenAI response truncated by max_tokens limit')
    }

    let result: { summaryMarkdown?: string; parameters?: { name: string; value: string | null }[] }
    try {
      result = JSON.parse(completion.choices[0].message.content || '{}')
    } catch {
      // If OpenAI returned plain text instead of JSON, treat the whole response as the summary
      result = { summaryMarkdown: completion.choices[0].message.content ?? '', parameters: [] }
    }

    const buyerTerms = extractBuyerAddedTerms(rawText)

    return NextResponse.json({
      summary: result.summaryMarkdown ?? '',
      parameters: Array.isArray(result.parameters) ? result.parameters : [],
      buyerTerms,
      truncated: completion.choices[0]?.finish_reason === 'length',
      fileName: file.name,
      filePath: saved.filePath,
    })
  } catch (error) {
    console.error('Bid AI extraction failed:', error)
    return NextResponse.json(
      { error: 'Failed to process bid document', detail: String(error) },
      { status: 500 }
    )
  }
}
