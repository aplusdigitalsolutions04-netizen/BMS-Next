import { NextRequest, NextResponse } from 'next/server'
import openai from '@/lib/openai'

export async function POST(req: NextRequest) {
  try {
    const { rawTerms, bidTitle, gemOrderId, firmName } = await req.json()
    if (!rawTerms) return NextResponse.json({ error: 'rawTerms is required' }, { status: 400 })

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: `You are a professional legal document formatter for Indian government procurement / GEM portal bids.

Format the following raw Terms & Conditions into a clean, professional, numbered format for a Buyer Compliance Document.

Context:
- Bid/Document Title: ${bidTitle || 'Bid Document'}
- GEM Order / Tender Ref: ${gemOrderId || 'N/A'}
- Vendor / Firm: ${firmName || 'N/A'}

Raw Terms & Conditions:
${rawTerms}

Formatting Instructions:
1. Create numbered main sections (1., 2., 3., ...) with clear bold headings
2. Use sub-points (1.1, 1.2, ...) where appropriate
3. Preserve ALL original requirements -- do not omit anything
4. Group related items under logical headings (Delivery, Payment, Warranty, Compliance, etc.)
5. Add a final "Acknowledgement & Undertaking" section with a declaration statement
6. Write in formal Indian business English
7. IMPORTANT -- the raw text above was extracted from a PDF and may still contain leftover page-footer junk: page numbers (e.g. "Page 3 of 45"), "Disclaimer: this is a system/computer generated document..." notices, "Generated On:" timestamps, or stray standalone numbers. COMPLETELY REMOVE any such fragments -- they are NOT part of the actual terms and must not appear anywhere in your output.
8. Return ONLY the formatted markdown -- no preamble or explanation`,
        },
      ],
      max_tokens: 16000,
      temperature: 0.2,
    })

    const finishReason = completion.choices[0]?.finish_reason
    const formatted = completion.choices[0]?.message?.content?.trim() || rawTerms
    if (finishReason === 'length') {
      console.error('format-terms: output truncated by max_tokens limit')
    }
    return NextResponse.json({ formatted, truncated: finishReason === 'length' })
  } catch (error) {
    console.error('format-terms error:', error)
    return NextResponse.json({ error: 'Formatting failed' }, { status: 500 })
  }
}
