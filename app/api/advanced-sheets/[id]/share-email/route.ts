import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { sendShareEmail } from '@/lib/email';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { email } = body;

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const [sheet] = await query<{ name: string, shareToken: string, shareMode: string }>(
      `SELECT name, shareToken, shareMode FROM advanced_sheet WHERE id = ? AND isDeleted = 0`,
      [id]
    );

    if (!sheet) {
      return NextResponse.json({ error: 'Sheet not found' }, { status: 404 });
    }

    if (sheet.shareMode === 'NONE' || !sheet.shareToken) {
      return NextResponse.json({ error: 'Sharing is not enabled for this sheet' }, { status: 400 });
    }

    // Determine the base URL
    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const host = req.headers.get('host');
    const baseUrl = `${protocol}://${host}`;
    
    const shareLink = `${baseUrl}/share/sheet/${sheet.shareToken}`;

    await sendShareEmail(email, sheet.name, shareLink);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/advanced-sheets/[id]/share-email error:', error);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
