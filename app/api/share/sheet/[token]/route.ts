import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import crypto from 'crypto';

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const [sheet] = await query<Record<string, unknown>>(
      `SELECT id, name, createdBy, createdOn, updatedOn, shareMode FROM advanced_sheet WHERE shareToken = ? AND isDeleted = 0`,
      [token]
    );
    
    if (!sheet) {
      return NextResponse.json({ error: 'Sheet not found or link is invalid' }, { status: 404 });
    }

    if (sheet.shareMode === 'NONE' || !sheet.shareMode) {
      return NextResponse.json({ error: 'This sheet is no longer shared' }, { status: 403 });
    }

    const id = sheet.id as string;

    // Fetch vertically stored tabs
    const tabs = await query<Record<string, any>>(
      `SELECT sheet_index, tab_name, config FROM advanced_sheet_tabs WHERE workbook_id = ?`,
      [id]
    );

    // Fetch vertically stored cells
    const cells = await query<Record<string, any>>(
      `SELECT sheet_index, row_index, col_index, cell_data FROM advanced_sheet_cells WHERE workbook_id = ?`,
      [id]
    );

    // Group cells by sheet_index
    const cellsBySheet = cells.reduce((acc: any, cell: any) => {
      if (!acc[cell.sheet_index]) acc[cell.sheet_index] = [];
      acc[cell.sheet_index].push({
        r: cell.row_index,
        c: cell.col_index,
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
    return NextResponse.json(sheet);
  } catch (error) {
    console.error('GET /api/share/sheet/[token] error:', error);
    return NextResponse.json({ error: 'Failed to fetch shared sheet' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const [sheet] = await query<Record<string, unknown>>(
      `SELECT id, shareMode FROM advanced_sheet WHERE shareToken = ? AND isDeleted = 0`,
      [token]
    );

    if (!sheet || sheet.shareMode !== 'EDIT') {
      return NextResponse.json({ error: 'You do not have permission to edit this sheet' }, { status: 403 });
    }

    const id = sheet.id as string;
    const body = await req.json();

    if (Array.isArray(body.data) && body.data.length === 0) {
      // Same protection as /api/advanced-sheets/[id]: a genuinely empty payload almost
      // always means a transient/incomplete client state, not the user deleting every
      // sheet -- refuse it instead of wiping the whole shared workbook.
      return NextResponse.json({ success: true, skipped: 'empty-data-ignored' });
    }

    if (Array.isArray(body.data) && body.data.length > 0) {
      const [{ tabCount }] = await query<{ tabCount: number }>(
        `SELECT COUNT(DISTINCT sheet_index) AS tabCount FROM advanced_sheet_tabs WHERE workbook_id = ?`,
        [id]
      );
      if (tabCount > body.data.length) {
        console.error(`share/sheet save refused: workbook ${id} has ${tabCount} tabs, payload only has ${body.data.length}`);
        return NextResponse.json({ error: 'Save rejected: fewer sheets than currently saved -- refresh and try again' }, { status: 409 });
      }
    }

    if (body.data) {
      const tabsData: any[] = [];
      const cellsData: any[] = [];

      for (const sh of body.data) {
        const { celldata, name: tabName, index, ...rest } = sh;
        const sheetIndex = index || 'sheet_01';
        const finalTabName = tabName || 'Sheet1';
        
        tabsData.push([
          crypto.randomUUID(), 
          id,                  
          sheetIndex,
          finalTabName,
          JSON.stringify(rest) 
        ]);

        if (Array.isArray(celldata)) {
          for (const cell of celldata) {
            cellsData.push([
              crypto.randomUUID(), 
              id,                  
              sheetIndex,
              cell.r,
              cell.c,
              JSON.stringify(cell.v) 
            ]);
          }
        }
      }

      await withTransaction(async (exec) => {
        // Only touch the name if a real one was sent -- String(undefined) is the literal
        // text "undefined", which would silently overwrite the workbook's name.
        if (body.name != null && String(body.name).trim()) {
          await exec(
            `UPDATE advanced_sheet SET name = ? WHERE id = ?`,
            [String(body.name).trim(), id]
          );
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
    } else if (body.name) {
       await query(
        `UPDATE advanced_sheet SET name = ? WHERE id = ?`,
        [String(body.name).trim(), id]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT /api/share/sheet/[token] error:', error);
    return NextResponse.json({ error: 'Failed to update shared sheet' }, { status: 500 });
  }
}
