import { NextResponse } from 'next/server'
import { testDriveConnection } from '@/lib/googleDrive'

// Used by the "Google Drive" settings page to show whether uploads/downloads are currently
// working -- distinct from /api/google-drive/authorize (which actually connects an account).
export async function GET() {
  try {
    const result = await testDriveConnection()
    return NextResponse.json({ connected: true, ...result })
  } catch (error) {
    return NextResponse.json({ connected: false, error: (error as Error).message })
  }
}
