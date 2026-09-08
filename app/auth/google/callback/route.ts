import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, saveRefreshToken } from '@/lib/googleDrive'

// Visiting /api/google-drive/authorize sends the admin through Google's consent screen,
// which redirects back here with a code. We exchange it for a refresh token and store it in
// the DB (google_drive_auth) -- takes effect immediately, on any request, no restart needed.
export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code')
    if (!code) {
      return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 })
    }

    const tokens = await exchangeCodeForTokens(code)
    if (!tokens.refresh_token) {
      return NextResponse.json(
        {
          error:
            "Google did not return a refresh token. Revoke this app's access at https://myaccount.google.com/permissions and try again so Google issues a fresh one.",
        },
        { status: 500 }
      )
    }

    await saveRefreshToken(tokens.refresh_token)
    console.log('[GOOGLE_DRIVE_AUTH] Refresh token saved successfully.')

    return new NextResponse(
      "<html><body style='font-family:sans-serif;padding:2rem'>" +
        '<h2>Google Drive connected</h2>' +
        "<p>You're all set — uploads and downloads will use this account right away.</p>" +
        '</body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    )
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
