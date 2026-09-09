import { NextRequest, NextResponse } from 'next/server'
import pdfParse from 'pdf-parse'
import openai from '@/lib/openai'

// AI extraction for a document uploaded into a client-tagged folder -- pulls the handful of
// challan-style fields (date, challan number, client name, product name, quantity) out of the
// PDF text so the user doesn't have to retype them. MRP is intentionally never extracted here
// (see the upload form) -- it's always a manual entry.
export async function POST(req: NextRequest) {
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
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Automatic extraction only supports PDF files -- scanned images and other formats need to be filled in manually.' }, { status: 400 })
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer())

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
        { error: 'No text could be extracted from the PDF. Scanned or image-based PDFs are not supported -- please fill the fields in manually.' },
        { status: 400 }
      )
    }

    const prompt = `You are extracting a few specific fields from a challan / delivery note / invoice document for filing purposes.

Read the ENTIRE document text below and return a JSON object with EXACTLY these keys:
- "date": the document/challan date, formatted as YYYY-MM-DD if a date is present, otherwise null.
- "challanNumber": the challan number / delivery note number / document reference number, otherwise null.
- "clientName": the customer/client/consignee name the document is addressed to, otherwise null.
- "productName": the main product/item name (if multiple items, join their names with ", "), otherwise null.
- "quantity": the quantity (include units if shown, e.g. "50 pcs"; if multiple items, join with ", " in the same order as productName), otherwise null.

Do not include any other keys. Do not guess values that aren't actually present in the text -- use null instead.

DOCUMENT TEXT:
${rawText.substring(0, 40000)}`

    let completion
    try {
      completion = await openai.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'gpt-4o-mini',
        temperature: 0.1,
        max_tokens: 1000,
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

    let result: { date?: string | null; challanNumber?: string | null; clientName?: string | null; productName?: string | null; quantity?: string | null }
    try {
      result = JSON.parse(completion.choices[0].message.content || '{}')
    } catch {
      return NextResponse.json({ error: 'Could not parse the extraction result -- please fill the fields in manually.' }, { status: 500 })
    }

    return NextResponse.json({
      date: result.date || '',
      challanNumber: result.challanNumber || '',
      clientName: result.clientName || '',
      productName: result.productName || '',
      quantity: result.quantity || '',
    })
  } catch (error) {
    console.error('Document extraction failed:', error)
    return NextResponse.json({ error: 'Failed to extract data from document' }, { status: 500 })
  }
}
