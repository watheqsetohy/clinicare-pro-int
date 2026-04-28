/**
 * live-sync.ts
 *
 * Connects to the live/HIS database and syncs packaging hierarchy
 * into pharma.brand_packaging (source = 'live').
 *
 * Configuration via env vars:
 *   LIVE_DB_HOST, LIVE_DB_PORT, LIVE_DB_NAME, LIVE_DB_USER, LIVE_DB_PASS
 *   LIVE_DB_BRAND_TABLE  — the table in the live DB that has packaging fields (default: 'medications')
 *   LIVE_DB_BRAND_ID_COL — column name for brand ID match (default: 'brand_id')
 *
 * The live DB query is configurable. Adjust LIVE_PACKAGING_QUERY below
 * to match your HIS schema if needed.
 */
import pg from 'pg';
import { pool as localPool } from '../db.js';

const { Pool } = pg;

// ─── Live DB connection ───────────────────────────────────────────────────────
function getLivePool(): pg.Pool | null {
  const host = process.env.LIVE_DB_HOST;
  if (!host) {
    console.warn('⚠️  LIVE_DB_HOST not set — live sync unavailable.');
    return null;
  }
  return new Pool({
    host,
    port: parseInt(process.env.LIVE_DB_PORT || '5432'),
    database: process.env.LIVE_DB_NAME,
    user:     process.env.LIVE_DB_USER,
    password: process.env.LIVE_DB_PASS,
    ssl:      process.env.LIVE_DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis:       30000,
  });
}

// ─── Live DB query — adapt to your HIS schema ─────────────────────────────────
const LIVE_PACKAGING_QUERY = process.env.LIVE_PACKAGING_QUERY || `
  SELECT
    brand_id,
    major_unit,
    major_unit_qty,
    mid_unit,
    mid_unit_qty,
    minor_unit,
    minor_unit_qty
  FROM ${process.env.LIVE_DB_BRAND_TABLE || 'medications'}
  WHERE brand_id IS NOT NULL
`;

// ─── Test connectivity ─────────────────────────────────────────────────────────
export async function testLiveConnection(): Promise<{ connected: boolean; error?: string }> {
  const livePool = getLivePool();
  if (!livePool) return { connected: false, error: 'LIVE_DB_HOST not configured' };
  try {
    await livePool.query('SELECT 1');
    await livePool.end();
    return { connected: true };
  } catch (e: any) {
    return { connected: false, error: e.message };
  }
}

// ─── Main sync function ────────────────────────────────────────────────────────
export async function syncPackagingFromLive(triggeredBy = 'api'): Promise<{
  synced: number;
  error?: string;
  logId: number;
}> {
  // Create audit log entry
  const logRes = await localPool.query(`
    INSERT INTO pharma.live_sync_log (sync_type, triggered_by, status)
    VALUES ('packaging', $1, 'running')
    RETURNING id
  `, [triggeredBy]);
  const logId: number = logRes.rows[0].id;

  const livePool = getLivePool();
  if (!livePool) {
    await localPool.query(`
      UPDATE pharma.live_sync_log
      SET status = 'error', error_msg = $1, completed_at = NOW()
      WHERE id = $2
    `, ['LIVE_DB_HOST not configured', logId]);
    return { synced: 0, error: 'LIVE_DB_HOST not configured', logId };
  }

  try {
    const { rows } = await livePool.query(LIVE_PACKAGING_QUERY);
    await livePool.end();

    if (!rows.length) {
      await localPool.query(`
        UPDATE pharma.live_sync_log
        SET status = 'done', records_synced = 0, completed_at = NOW()
        WHERE id = $1
      `, [logId]);
      return { synced: 0, logId };
    }

    // Bulk upsert into brand_packaging (source = 'live')
    const ids        = rows.map(r => r.brand_id);
    const majorUnit  = rows.map(r => r.major_unit   ?? null);
    const majorQty   = rows.map(r => r.major_unit_qty != null ? String(r.major_unit_qty) : null);
    const midUnit    = rows.map(r => r.mid_unit      ?? null);
    const midQty     = rows.map(r => r.mid_unit_qty  != null ? String(r.mid_unit_qty)   : null);
    const minorUnit  = rows.map(r => r.minor_unit    ?? null);
    const minorQty   = rows.map(r => r.minor_unit_qty != null ? String(r.minor_unit_qty) : null);

    const result = await localPool.query(`
      INSERT INTO pharma.brand_packaging
        (brand_id, source, major_unit, major_unit_qty, mid_unit, mid_unit_qty, minor_unit, minor_unit_qty, synced_at)
      SELECT v.brand_id, 'live', v.major_unit, v.major_unit_qty::numeric,
             v.mid_unit, v.mid_unit_qty::numeric,
             v.minor_unit, v.minor_unit_qty::numeric,
             NOW()
      FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[])
        AS v(brand_id, major_unit, major_unit_qty, mid_unit, mid_unit_qty, minor_unit, minor_unit_qty)
      WHERE EXISTS (SELECT 1 FROM pharma.brand b WHERE b.brand_id = v.brand_id)
      ON CONFLICT (brand_id, source) DO UPDATE SET
        major_unit     = EXCLUDED.major_unit,
        major_unit_qty = EXCLUDED.major_unit_qty,
        mid_unit       = EXCLUDED.mid_unit,
        mid_unit_qty   = EXCLUDED.mid_unit_qty,
        minor_unit     = EXCLUDED.minor_unit,
        minor_unit_qty = EXCLUDED.minor_unit_qty,
        synced_at      = NOW(),
        updated_at     = NOW()
    `, [ids, majorUnit, majorQty, midUnit, midQty, minorUnit, minorQty]);

    const synced = result.rowCount || 0;

    await localPool.query(`
      UPDATE pharma.live_sync_log
      SET status = 'done', records_synced = $1, completed_at = NOW()
      WHERE id = $2
    `, [synced, logId]);

    return { synced, logId };
  } catch (e: any) {
    await localPool.query(`
      UPDATE pharma.live_sync_log
      SET status = 'error', error_msg = $1, completed_at = NOW()
      WHERE id = $2
    `, [e.message, logId]);
    await livePool.end().catch(() => {});
    return { synced: 0, error: e.message, logId };
  }
}
