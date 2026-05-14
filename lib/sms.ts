import twilio from 'twilio'

type TwilioClient = ReturnType<typeof twilio>

function getTwilio(): TwilioClient {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) throw new Error('Twilio credentials are not configured')
  return twilio(sid, token)
}

export async function sendReviewRequestSMS(
  to: string,
  customerName: string,
  businessName: string,
  reviewLink: string,
  templateBody?: string
): Promise<void> {
  const from = process.env.TWILIO_PHONE_NUMBER
  if (!from) throw new Error('TWILIO_PHONE_NUMBER is not configured')

  const body = templateBody
    ? templateBody
        .replace('{{customer_name}}', customerName)
        .replace('{{business_name}}', businessName)
        .replace('{{review_link}}', reviewLink)
    : `Hi ${customerName}! Thank you for choosing ${businessName}. We'd love your feedback: ${reviewLink}`

  await getTwilio().messages.create({ body, from, to })
}
