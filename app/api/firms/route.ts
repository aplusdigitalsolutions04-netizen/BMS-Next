import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import getPool from '@/lib/db'
import { dispatchNotification } from '@/lib/email'

export async function GET() {
  try {
    const firms = await query<Record<string, unknown>>(`
      SELECT f.*,
        md.code AS type_code, md.value AS type_value, md.groupCode AS type_groupCode,
        a.id AS addr_id, a.addressLine, a.city, a.state, a.pincode
      FROM firm f
      LEFT JOIN masterdata md ON f.firmTypeCode = md.code
      LEFT JOIN address a ON a.firmId = f.id
      WHERE f.isDeleted = 0
      ORDER BY f.createdOn DESC
      LIMIT 500
    `)

    // Group addresses per firm
    const firmMap = new Map<string, Record<string, unknown>>()
    for (const row of firms) {
      const id = row.id as string
      if (!firmMap.has(id)) {
        const type = row.type_code
          ? { code: row.type_code, value: row.type_value, groupCode: row.type_groupCode }
          : null
        firmMap.set(id, { ...row, type, addresses: [], addr_id: undefined, addressLine: undefined, city: undefined, state: undefined, pincode: undefined, type_code: undefined, type_value: undefined, type_groupCode: undefined })
      }
      if (row.addr_id) {
        const firm = firmMap.get(id)!
        ;(firm.addresses as unknown[]).push({
          id: row.addr_id,
          firmId: id,
          addressLine: row.addressLine,
          city: row.city,
          state: row.state,
          pincode: row.pincode,
        })
      }
    }

    return NextResponse.json(Array.from(firmMap.values()))
  } catch (e) {
    console.error('FIRMS ERROR:', e)
    return NextResponse.json({ error: 'Failed to fetch firms' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      firmCode, name, panNumber, gstNumber, cinNumber, gemSellerId, firmTypeCode,
      contactPerson, email, mobile, website, accountHolderName, accountNumber, ifscCode, bankName,
      address, city, state, pincode, uploadedBy,
    } = body

    const id = crypto.randomUUID()
    const conn = await getPool().getConnection()
    await conn.beginTransaction()
    try {
      await conn.execute(
        `INSERT INTO firm (id, firmCode, name, panNumber, gstNumber, cinNumber, gemSellerId, firmTypeCode, contactPerson, email, mobile, website, accountHolderName, accountNumber, ifscCode, bankName, isActive, isDeleted, createdOn)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NOW())`,
        [id, firmCode, name, panNumber, gstNumber, cinNumber, gemSellerId, firmTypeCode, contactPerson, email, mobile, website, accountHolderName, accountNumber, ifscCode, bankName]
      )
      const addrId = crypto.randomUUID()
      await conn.execute(
        `INSERT INTO address (id, firmId, addressLine, city, state, pincode) VALUES (?, ?, ?, ?, ?, ?)`,
        [addrId, id, address || '', city, state, pincode]
      )
      await conn.commit()
    } catch (e) {
      await conn.rollback()
      throw e
    } finally {
      conn.release()
    }

    const [firmRow] = await query<Record<string, unknown>>(
      `SELECT f.*, md.code AS type_code, md.value AS type_value FROM firm f LEFT JOIN masterdata md ON f.firmTypeCode = md.code WHERE f.id = ?`,
      [id]
    )
    const addrRows = await query<Record<string, unknown>>(`SELECT * FROM address WHERE firmId = ?`, [id])
    const firm = { ...firmRow, type: firmRow?.type_code ? { code: firmRow.type_code, value: firmRow.type_value } : null, addresses: addrRows }

    query(
      `INSERT INTO notification (id, title, message, type, isRead, createdOn) VALUES (?, ?, ?, ?, 0, NOW())`,
      [crypto.randomUUID(), 'New Firm Added', `Firm ${name} (${firmCode}) has been registered in the system.`, 'success']
    ).catch((err) => console.error('Notification insert failed:', err))
    dispatchNotification('Firm Added', `Firm '${name}' (${firmCode}) has been successfully added to the system.`, uploadedBy)
      .catch((err) => console.error('Email dispatch failed:', err))

    return NextResponse.json(firm, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create firm' }, { status: 500 })
  }
}
