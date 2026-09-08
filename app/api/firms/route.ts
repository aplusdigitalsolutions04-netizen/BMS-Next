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

// The client suggests a firmCode (generated from whatever firm list it happens to have
// loaded, which can be stale by up to the 30s poll interval), but firmCode is UNIQUE in the
// DB -- trusting a possibly-stale client value caused silent duplicate-key failures whenever
// two firms were created close together (two users, or the same user's list lagging behind
// a firm someone else just added). The server now always computes it fresh from the DB
// itself right before inserting, with a short retry loop as a last line of defense against
// the (much smaller) race between two concurrent requests both reading the same max code.
async function nextFirmCode(): Promise<string> {
  // Let MySQL find the single highest code (indexed sort + LIMIT 1) instead of pulling every
  // matching row across the network and reducing in JS -- this runs on every firm creation
  // (and again on every retry attempt below), so it should stay cheap as the firm table grows.
  const rows = await query<{ firmCode: string }>(
    `SELECT firmCode FROM firm WHERE firmCode REGEXP '^FRM-[0-9]+$'
     ORDER BY CAST(SUBSTRING(firmCode, 5) AS UNSIGNED) DESC LIMIT 1`
  )
  const maxNum = rows.length ? parseInt(rows[0].firmCode.slice(4), 10) : 0
  return `FRM-${String(maxNum + 1).padStart(3, '0')}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      name, panNumber, gstNumber, cinNumber, gemSellerId, firmTypeCode,
      contactPerson, email, mobile, website, accountHolderName, accountNumber, ifscCode, bankName,
      address, city, state, pincode, uploadedBy,
    } = body

    let id = ''
    let firmCode = ''
    const MAX_ATTEMPTS = 5
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      firmCode = await nextFirmCode()
      id = crypto.randomUUID()
      const conn = await getPool().getConnection()
      try {
        await conn.beginTransaction()
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
        break // success
      } catch (e) {
        await conn.rollback()
        const code = (e as { code?: string }).code
        if (code === 'ER_DUP_ENTRY' && attempt < MAX_ATTEMPTS) {
          continue // another request took this firmCode between our SELECT and INSERT -- retry with a fresh one
        }
        throw e
      } finally {
        conn.release()
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
      [crypto.randomUUID(), 'New Firm Added', `Firm ${name} (${firmCode}) has been registered in the system.`, 'success']
    ).catch((err) => console.error('Notification insert failed:', err))
    dispatchNotification('Firm Added', `Firm '${name}' (${firmCode}) has been successfully added to the system.`, uploadedBy)
      .catch((err) => console.error('Email dispatch failed:', err))

    return NextResponse.json(firm, { status: 201 })
  } catch (e) {
    // Was previously a bare `catch {}` -- swallowed the real reason entirely, which is
    // exactly why "firm create isn't working" on the live site had no trace in the logs
    // to diagnose from. Now it's recorded, and a duplicate/foreign-key error tells the
    // caller something more useful than a blanket 500.
    const err = e as { code?: string; sqlMessage?: string; message?: string }
    console.error('[POST /api/firms] failed:', err.code, err.sqlMessage || err.message)
    if (err.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ error: 'A firm with this code already exists -- please try again' }, { status: 409 })
    }
    if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
      return NextResponse.json({ error: 'Selected firm type is invalid or no longer exists' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to create firm' }, { status: 500 })
  }
}
