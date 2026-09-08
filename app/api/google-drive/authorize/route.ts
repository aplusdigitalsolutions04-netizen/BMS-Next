import { NextResponse } from 'next/server'
import { getAuthUrl } from '@/lib/googleDrive'

// One-time admin setup step: visit this URL directly in a browser to connect the Google
// account that will hold every uploaded file. It's a plain navigation (redirects to
// Google's consent screen), so it can't carry the app's normal Authorization header the way
// fetch/axios calls do -- it's exempted from the Bearer-token middleware entirely (see
// middleware.ts's PUBLIC_API_ROUTES) rather than gated by a shared secret.
export async function GET() {
  try {
    return NextResponse.redirect(await getAuthUrl())
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
