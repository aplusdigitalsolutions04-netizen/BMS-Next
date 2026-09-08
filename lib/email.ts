import nodemailer from 'nodemailer'
import { query } from './db'
import { marked } from 'marked'

let transporter: nodemailer.Transporter | null = null

async function getTransporter(): Promise<nodemailer.Transporter | null> {
  if (transporter) return transporter

  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
    return transporter
  }

  // Demo mode: create ethereal account — await so first email actually works
  try {
    const account = await nodemailer.createTestAccount()
    transporter = nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.user, pass: account.pass },
    })
    console.log('Ethereal Email initialized for demo mode')
    return transporter
  } catch (err) {
    console.error('Failed to create Ethereal test account:', err)
    return null
  }
}

export async function dispatchNotification(
  subject: string,
  message: string,
  uploaderId?: string | null
) {
  const t = await getTransporter()
  if (!t) return

  try {
    const admins = await query<{ email: string }>(
      `SELECT email FROM user WHERE roleCode IN ('ADMIN', 'MANAGER') AND isActive = 1`
    )

    const recipients = new Set(admins.map((a) => a.email))

    if (uploaderId && uploaderId !== 'system') {
      // Prefer an exact username match (unique) over fullName (which two active users
      // could share) -- and only fall back to fullName when it uniquely identifies one
      // active user, so a notification never goes to the wrong person's inbox.
      const byUsername = await query<{ email: string }>(
        `SELECT email FROM user WHERE username = ? AND isActive = 1 LIMIT 1`,
        [uploaderId]
      )
      if (byUsername[0]?.email) {
        recipients.add(byUsername[0].email)
      } else {
        const byFullName = await query<{ email: string }>(
          `SELECT email FROM user WHERE fullName = ? AND isActive = 1`,
          [uploaderId]
        )
        if (byFullName.length === 1) recipients.add(byFullName[0].email)
      }
    }

    const toEmails = Array.from(recipients).filter(Boolean)
    if (toEmails.length === 0) return

    let finalHtml: string | undefined
    try {
      const tmplRows = await query<{ metadata: string }>(
        `SELECT metadata FROM masterdata WHERE code = 'EMAIL_TEMPLATE' LIMIT 1`
      )
      if (tmplRows[0]?.metadata) {
        const rawText = tmplRows[0].metadata.replace(/{{message}}/g, message)
        const parsed = await marked.parse(rawText, { breaks: true })
        finalHtml = typeof parsed === 'string' ? parsed : String(parsed)
      }
    } catch {
      // ignore template fetch failure
    }

    const mailOptions: nodemailer.SendMailOptions = {
      from: `"Aplusdigitalsolutions" <${process.env.SMTP_USER || 'no-reply@portal.local'}>`,
      to: toEmails.join(', '),
      subject,
      text: message,
      ...(finalHtml && { html: finalHtml }),
    }

    const info = await t.sendMail(mailOptions)
    console.log(
      `Email dispatched to [${toEmails.join(', ')}]: ${nodemailer.getTestMessageUrl(info) || info.messageId}`
    )
  } catch (err) {
    console.error('Error dispatching email notification:', err)
  }
}

export async function sendShareEmail(
  toEmail: string,
  sheetName: string,
  shareLink: string
) {
  const t = await getTransporter()
  if (!t) throw new Error('Email transporter not configured')

  try {
    const subject = `You've been invited to view/edit: ${sheetName}`
    const message = `Hello,\n\nYou have been invited to access the spreadsheet "${sheetName}".\n\nYou can access it here: ${shareLink}\n\nThanks,\nDocument Portal`
    
    let finalHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: 'Inter', 'Segoe UI', sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px 20px; color: #111827;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05); overflow: hidden;">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px 24px; text-align: center;">
            <div style="background-color: rgba(255,255,255,0.2); width: 64px; height: 64px; border-radius: 16px; margin: 0 auto 16px auto; display: flex; align-items: center; justify-content: center;">
              <svg style="width: 32px; height: 32px; color: #ffffff;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">Spreadsheet Shared with You</h1>
          </div>
          
          <!-- Content -->
          <div style="padding: 40px 32px;">
            <p style="font-size: 16px; color: #374151; margin-top: 0; line-height: 1.6;">Hello,</p>
            <p style="font-size: 16px; color: #374151; line-height: 1.6;">Someone has invited you to view or edit the following spreadsheet on our platform:</p>
            
            <!-- Document Info Box -->
            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 28px 0; display: flex; align-items: center; gap: 16px;">
              <div style="width: 40px; height: 40px; background-color: #ecfdf5; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <svg style="width: 24px; height: 24px; color: #10b981;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p style="margin: 0; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Document Name</p>
                <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: 700; color: #111827;">${sheetName}</p>
              </div>
            </div>
            
            <!-- CTA Button -->
            <div style="text-align: center; margin: 40px 0 20px 0;">
              <a href="${shareLink}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);">Open Spreadsheet</a>
            </div>
            
            <p style="font-size: 14px; color: #6b7280; text-align: center; margin: 0;">No account required to access this file.</p>
            
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
            
            <!-- Fallback Link -->
            <p style="color: #6b7280; font-size: 13px; margin: 0 0 8px 0;">If the button above doesn't work, copy and paste this link into your browser:</p>
            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; word-break: break-all;">
              <a href="${shareLink}" style="color: #10b981; font-size: 13px; text-decoration: none;">${shareLink}</a>
            </div>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="text-align: center; margin-top: 32px; padding: 0 20px;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">This is an automated invitation from your Document Portal.</p>
          <p style="color: #9ca3af; font-size: 12px; margin: 8px 0 0 0;">Please do not reply to this email.</p>
        </div>
      </body>
      </html>
    `

    const mailOptions: nodemailer.SendMailOptions = {
      from: `"Document Portal" <${process.env.SMTP_USER || 'no-reply@portal.local'}>`,
      to: toEmail,
      subject,
      text: message,
      html: finalHtml,
    }

    const info = await t.sendMail(mailOptions)
    console.log(`Share email sent to [${toEmail}]: ${nodemailer.getTestMessageUrl(info) || info.messageId}`)
    return true
  } catch (err) {
    console.error('Error sending share email:', err)
    throw err
  }
}
