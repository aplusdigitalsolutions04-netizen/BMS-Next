import { NextRequest, NextResponse } from 'next/server'
import { query, withTransaction } from '@/lib/db'

import crypto from 'crypto';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const [sheet] = await query<Record<string, unknown>>(
      `SELECT id, name, createdBy, createdOn, updatedOn, shareToken, shareMode FROM advanced_sheet WHERE id = ? AND isDeleted = 0`,
      [id]
    )
    if (!sheet) {
      return NextResponse.json({ error: 'Sheet not found' }, { status: 404 })
    }

    // Fetch vertically stored tabs
    const tabs = await query<Record<string, any>>(
      `SELECT sheet_index, tab_name, config FROM advanced_sheet_tabs WHERE workbook_id = ?`,
      [id]
    )

    // Fetch vertically stored cells
    const cells = await query<Record<string, any>>(
      `SELECT sheet_index, row_index, col_index, cell_data FROM advanced_sheet_cells WHERE workbook_id = ?`,
      [id]
    )

    // Group cells by sheet_index
    const cellsBySheet = cells.reduce((acc: any, cell: any) => {
      if (!acc[cell.sheet_index]) acc[cell.sheet_index] = [];
      acc[cell.sheet_index].push({
        r: cell.row_index,
        c: cell.col_index,
        // Since we insert objects directly into mysql2, the driver stringifies them into the JSON column.
        // On read, it returns a string, so we must parse it to get the object back.
        v: typeof cell.cell_data === 'string' ? JSON.parse(cell.cell_data) : cell.cell_data
      });
      return acc;
    }, {});

    // Reconstruct the full data array
    const data = tabs.map((tab) => {
      const config = typeof tab.config === 'string' ? JSON.parse(tab.config) : tab.config;
      return {
        ...config,
        index: tab.sheet_index,
        name: tab.tab_name,
        celldata: cellsBySheet[tab.sheet_index] || []
      };
    });

    sheet.data = data;
    return NextResponse.json(sheet)
  } catch (error) {
    console.error('GET /api/advanced-sheets/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch advanced sheet' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()

    if (Array.isArray(body.data) && body.data.length === 0) {
      // A genuinely empty payload here almost always means a transient/incomplete client
      // state (e.g. FortuneSheet firing onChange mid-transition) rather than the user
      // actually deleting every sheet -- saving it would wipe the whole workbook's tabs
      // and cells with no way back. Treat it as a no-op instead of destructive data loss.
      return NextResponse.json({ success: true, skipped: 'empty-data-ignored' })
    }

    if (Array.isArray(body.data) && body.data.length > 0) {
      // Guard against a save silently wiping tabs that existed a moment ago: if the
      // workbook currently has more tabs than this payload is about to write, refuse the
      // save rather than risk losing whole sheets to a client-side glitch (e.g. FortuneSheet
      // briefly reporting only the active tab instead of the full multi-tab state).
      const [{ tabCount }] = await query<{ tabCount: number }>(
        `SELECT COUNT(DISTINCT sheet_index) AS tabCount FROM advanced_sheet_tabs WHERE workbook_id = ?`,
        [id]
      )
      if (tabCount > body.data.length) {
        console.error(`advanced-sheets save refused: workbook ${id} has ${tabCount} tabs, payload only has ${body.data.length}`)
        return NextResponse.json({ error: 'Save rejected: fewer sheets than currently saved -- refresh and try again' }, { status: 409 })
      }
    }

    if (body.data) {
      const tabsData: any[] = [];
      const cellsData: any[] = [];

      for (const sheet of body.data) {
        const { celldata, name: tabName, index, ...rest } = sheet;
        const sheetIndex = index || 'sheet_01';
        const finalTabName = tabName || 'Sheet1';
        
        tabsData.push([
          crypto.randomUUID(), // id
          id,                  // workbook_id
          sheetIndex,
          finalTabName,
          JSON.stringify(rest) // config
        ]);

        if (Array.isArray(celldata)) {
          for (const cell of celldata) {
            cellsData.push([
              crypto.randomUUID(), // id
              id,                  // workbook_id
              sheetIndex,
              cell.r,
              cell.c,
              JSON.stringify(cell.v) // Fix double stringification: we pass JSON.stringify(object). 
            ]);
          }
        }
      }

      await withTransaction(async (exec) => {
        // Only touch the name if a real one was sent -- String(undefined) is the literal
        // text "undefined", which would silently overwrite the workbook's name whenever a
        // caller saves without one.
        if (body.name != null && String(body.name).trim()) {
          await exec(
            `UPDATE advanced_sheet SET name = ? WHERE id = ?`,
            [String(body.name).trim(), id]
          )
        }

        await exec(`DELETE FROM advanced_sheet_tabs WHERE workbook_id = ?`, [id]);
        await exec(`DELETE FROM advanced_sheet_cells WHERE workbook_id = ?`, [id]);

        if (tabsData.length > 0) {
          const placeholders = tabsData.map(() => '(?, ?, ?, ?, ?)').join(',');
          await exec(
            `INSERT INTO advanced_sheet_tabs (id, workbook_id, sheet_index, tab_name, config) VALUES ${placeholders}`,
            tabsData.flat()
          );
        }

        const chunkSize = 500;
        for (let i = 0; i < cellsData.length; i += chunkSize) {
          const chunk = cellsData.slice(i, i + chunkSize);
          const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(',');
          await exec(
            `INSERT INTO advanced_sheet_cells (id, workbook_id, sheet_index, row_index, col_index, cell_data) VALUES ${placeholders}`,
            chunk.flat()
          );
        }
      });
    } else if (body.shareMode !== undefined) {
      const mode = body.shareMode;
      // Check if we need to generate a token
      const [sheet] = await query<{ shareToken: string | null }>(`SELECT shareToken FROM advanced_sheet WHERE id = ?`, [id]);
      let token = sheet?.shareToken;
      if (!token && (mode === 'VIEW' || mode === 'EDIT')) {
        token = crypto.randomUUID();
      }
      await query(
        `UPDATE advanced_sheet SET shareMode = ?, shareToken = ? WHERE id = ?`,
        [mode, token, id]
      );
      return NextResponse.json({ success: true, shareToken: token });
    } else if (body.name) {
       await query(
        `UPDATE advanced_sheet SET name = ? WHERE id = ?`,
        [String(body.name).trim(), id]
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('PUT /api/advanced-sheets/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update advanced sheet' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await query(`UPDATE advanced_sheet SET isDeleted = 1 WHERE id = ?`, [id])
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/advanced-sheets/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete advanced sheet' }, { status: 500 })
  }
}
