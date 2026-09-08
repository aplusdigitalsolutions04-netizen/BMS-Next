import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { dispatchNotification } from '@/lib/email'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const {
      name, panNumber, gstNumber, cinNumber, gemSellerId, firmTypeCode,
      contactPerson, email, mobile, website, accountHolderName, accountNumber, ifscCode, bankName,
      address, city, state, pincode, uploadedBy,
    } = body

    await query(
      `UPDATE firm SET name=?, panNumber=?, gstNumber=?, cinNumber=?, gemSellerId=?, firmTypeCode=?, contactPerson=?, email=?, mobile=?, website=?, accountHolderName=?, accountNumber=?, ifscCode=?, bankName=? WHERE id=?`,
      [name, panNumber, gstNumber, cinNumber, gemSellerId, firmTypeCode, contactPerson, email, mobile, website, accountHolderName, accountNumber, ifscCode, bankName, id]
    )

    if (address || city || state || pincode) {
      const existing = await query<Record<string, unknown>>(`SELECT id FROM address WHERE firmId = ? LIMIT 1`, [id])
      if (existing.length > 0) {
        await query(
          `UPDATE address SET addressLine=?, city=?, state=?, pincode=? WHERE id=?`,
          [address || '', city, state, pincode, existing[0].id]
        )
      } else {
        const addrId = crypto.randomUUID()
        await query(
          `INSERT INTO address (id, firmId, addressLine, city, state, pincode) VALUES (?, ?, ?, ?, ?, ?)`,
          [addrId, id, address || '', city, state, pincode]
        )
      }
    }

    const [firmRow] = await query<Record<string, unknown>>(
      `SELECT f.*, md.code AS type_code, md.value AS type_value FROM firm f LEFT JOIN masterdata md ON f.firmTypeCode = md.code WHERE f.id = ?`,
      [id]
    )
    const addrRows = await query<Record<string, unknown>>(`SELECT * FROM address WHERE firmId = ?`, [id])
    const firm = { ...firmRow, type: firmRow?.type_code ? { code: firmRow.type_code, value: firmRow.type_value } : null, addresses: addrRows }

    query(
      `INSERT INTO notification (id, title, message, type, isRead, createdOn) VALUES (?, ?, ?, ?, 0, NOW())`,
      [crypto.randomUUID(), 'Firm Updated', `Details for firm ${name} were updated.`, 'info']
    ).catch(() => {})
    dispatchNotification('Firm Updated', `Details for firm '${name}' have been updated.`, uploadedBy)

    return NextResponse.json(firm)
  } catch {
    return NextResponse.json({ error: 'Failed to update firm' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const [firmRow] = await query<Record<string, unknown>>(`SELECT name FROM firm WHERE id = ?`, [id])
    await query(`UPDATE firm SET isDeleted = 1 WHERE id = ?`, [id])

    const firmName = firmRow?.name || ''
    query(
      `INSERT INTO notification (id, title, message, type, isRead, createdOn) VALUES (?, ?, ?, ?, 0, NOW())`,
      [crypto.randomUUID(), 'Firm Deleted', `Firm ${firmName} has been removed.`, 'error']
    ).catch(() => {})
    dispatchNotification('Firm Removed', `Firm '${firmName}' has been successfully removed.`, body.uploadedBy)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete firm' }, { status: 500 })
  }
}
