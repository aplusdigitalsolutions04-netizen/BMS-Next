import { NextResponse } from 'next/server'
import { migrateLocalFilesToDrive } from '@/lib/uploads'

// Backfills whatever's still sitting in the local uploads/ folder (from before Drive was
// connected) into Google Drive. Safe to re-run -- already-migrated files are skipped.
export async function POST() {
  try {
    const result = await migrateLocalFilesToDrive()
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
