import Anthropic from '@anthropic-ai/sdk'

function getClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured')
  return new Anthropic({ apiKey: key })
}

export interface ReviewDraft {
  tone: 'professional' | 'friendly' | 'formal'
  text: string
}

export async function draftReviewResponse(
  reviewText: string,
  rating: number,
  source: string,
  brandVoice: string
): Promise<ReviewDraft[]> {
  const systemPrompt = `You are a review response assistant for a local service business.

Brand voice: ${brandVoice}

Rules:
- Never fabricate events or details not mentioned in the review
- Never offer discounts or incentives for reviews (ToS violation)
- Keep responses under 150 words
- Be genuine and specific to the review content
- For negative reviews: acknowledge, apologize, offer to make it right offline
- For positive reviews: thank sincerely, reinforce the specific compliment

Return ONLY a JSON object with this exact structure:
{
  "drafts": [
    { "tone": "professional", "text": "..." },
    { "tone": "friendly", "text": "..." },
    { "tone": "formal", "text": "..." }
  ]
}`

  const userPrompt = `Write 3 response drafts for this ${rating}-star ${source} review:

"${reviewText}"

Return the JSON object only, no other text.`

  const message = await getClient().messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type from AI')

  const parsed = JSON.parse(content.text) as { drafts: ReviewDraft[] }
  return parsed.drafts
}

export function classifySentiment(rating: number, text: string): 'positive' | 'neutral' | 'negative' {
  if (rating >= 4) return 'positive'
  if (rating <= 2) return 'negative'
  const negativeWords = ['bad', 'terrible', 'awful', 'worst', 'horrible', 'poor', 'disappointed', 'never again']
  const hasNegativeWords = negativeWords.some(word => text.toLowerCase().includes(word))
  return hasNegativeWords ? 'negative' : 'neutral'
}
