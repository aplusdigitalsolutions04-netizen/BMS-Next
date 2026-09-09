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

    const requestedFirmCode = typeof body.firmCode === 'string' ? body.firmCode.trim() : ''
    if (requestedFirmCode) {
      const conflict = await query<{ id: string }>(
        `SELECT id FROM firm WHERE firmCode = ? AND id != ? AND isDeleted = 0`,
        [requestedFirmCode, id]
      )
      if (conflict.length > 0) {
        return NextResponse.json({ error: 'This firm code is already in use by another firm' }, { status: 409 })
      }
      await query(`UPDATE firm SET firmCode = ? WHERE id = ?`, [requestedFirmCode, id])
    }

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
  } catch (e) {
    const err = e as { code?: string; sqlMessage?: string; message?: string }
    console.error('[PUT /api/firms/[id]] failed:', err.code, err.sqlMessage || err.message)
    if (err.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ error: 'This firm code is already in use by another firm' }, { status: 409 })
    }
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
  } catch (e) {
    console.error("API error:", e)
    return NextResponse.json({ error: 'Failed to delete firm' }, { status: 500 })
  }
}
