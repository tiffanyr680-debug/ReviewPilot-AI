import { Resend } from 'resend'

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY is not configured')
  return new Resend(key)
}

const FROM = process.env.RESEND_FROM_EMAIL || 'noreply@reviewpilot.ai'

export async function sendReviewRequestEmail(
  to: string,
  customerName: string,
  businessName: string,
  reviewLink: string
): Promise<void> {
  const resend = getResend()
  await resend.emails.send({
    from: FROM,
    to,
    subject: `How was your experience with ${businessName}?`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #0F172A;">Hi ${customerName},</h2>
        <p>Thank you for choosing ${businessName}! We hope you had a great experience.</p>
        <p>Would you mind taking 2 minutes to share your feedback? Your review helps others find us and helps us improve.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${reviewLink}" style="background-color: #10b981; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Leave a Review
          </a>
        </div>
        <p style="color: #64748b; font-size: 14px;">Thank you for your time!</p>
        <p style="color: #64748b; font-size: 14px;">— The ${businessName} Team</p>
      </div>
    `,
  })
}

export async function sendNegativeReviewAlert(
  ownerEmail: string,
  businessName: string,
  reviewAuthor: string,
  rating: number,
  reviewContent: string,
  source: string
): Promise<void> {
  const resend = getResend()
  await resend.emails.send({
    from: FROM,
    to: ownerEmail,
    subject: `New ${rating}-star review on ${source} for ${businessName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 4px; margin-bottom: 20px;">
          <h2 style="color: #dc2626; margin: 0 0 8px;">New ${rating}-star review requires attention</h2>
          <p style="margin: 0; color: #991b1b;">from ${reviewAuthor} on ${source}</p>
        </div>
        <blockquote style="border-left: 3px solid #e2e8f0; padding-left: 16px; color: #475569; margin: 20px 0;">
          "${reviewContent}"
        </blockquote>
        <p>Log in to ReviewPilot AI to respond with an AI-drafted reply.</p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/inbox" style="background-color: #0F172A; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">
          Respond Now
        </a>
      </div>
    `,
  })
}
