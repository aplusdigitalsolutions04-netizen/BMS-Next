import { query } from '../lib/db';
async function run() {
  try {
    await query('DROP TABLE IF EXISTS advanced_sheet_cells');
    await query('DROP TABLE IF EXISTS advanced_sheet_tabs');
    await query('ALTER TABLE advanced_sheet DROP COLUMN data');
    console.log('Successfully dropped old schema');
  } catch (e: any) {
    console.log('Error or already dropped: ', e.message);
  }
  process.exit(0);
}
run();
