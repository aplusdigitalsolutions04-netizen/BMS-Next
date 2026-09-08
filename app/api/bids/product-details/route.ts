import { NextRequest, NextResponse } from 'next/server'
import openai from '@/lib/openai'

export async function POST(req: NextRequest) {
  try {
    const { productName, requiredSpecs } = await req.json()
    if (!productName?.trim()) {
      return NextResponse.json({ error: 'productName is required' }, { status: 400 })
    }

    const prompt = `You are a product specification expert for Indian government tenders (GeM).

The bidder wants to offer this product: "${productName.trim()}"

The tender requires these specifications:
${requiredSpecs || 'Not provided'}

TASK -- respond with ONLY valid JSON (no markdown fences) in this exact shape:
{
  "details": "Full technical specification of the offered product as plain text, one spec per line in 'Parameter: Value' format. Include: Make/Brand, Model, all key technical parameters relevant to this product category (print technology, speed, RAM, connectivity, warranty, certifications like BIS/RoHS/EPR, power supply, dimensions, weight etc.). Use real, accurate publicly-known specs for this product model. If exact model specs are unknown, state typical specs for this model series and mark uncertain ones with '(verify)'.",
  "comparison": [
    {
      "parameter": "spec name from tender requirement",
      "required": "what the tender requires",
      "offered": "what this product provides",
      "match": "yes" | "partial" | "no" | "unknown"
    }
  ],
  "verdict": "One-line overall verdict in simple terms: is this product suitable for this tender or not, and what to double-check."
}

RULES:
- comparison array must cover EVERY requirement listed in the tender specs above.
- match = "yes" if product clearly meets/exceeds, "partial" if close but needs verification, "no" if it fails, "unknown" if product data unavailable.
- Never invent fake certifications. If unsure, use "unknown".`

    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
    })

    let result
    try {
      result = JSON.parse(completion.choices[0].message.content || '{}')
    } catch {
      return NextResponse.json({ error: 'AI response could not be parsed' }, { status: 500 })
    }

    return NextResponse.json({
      details: result.details || '',
      comparison: Array.isArray(result.comparison) ? result.comparison : [],
      verdict: result.verdict || '',
    })
  } catch (error) {
    console.error('Product details AI failed:', error)
    return NextResponse.json({ error: 'Failed to fetch product details' }, { status: 500 })
  }
}
