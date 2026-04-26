/**
 * Pharma REST API — Sprint 5
 *
 * Endpoints:
 *   GET  /api/pharma/search?q=&atc=&status=&limit=&offset=
 *   GET  /api/pharma/brand/:brandId
 *   GET  /api/pharma/brand/:brandId/ingredients
 *   GET  /api/pharma/brand/:brandId/adrs
 *   GET  /api/pharma/brand/:brandId/indications
 *   POST /api/pharma/ddi-check          { ddinterIds: string[] }
 *   GET  /api/pharma/ingredient/:irId
 *   GET  /api/pharma/stats
 */

import { Router, Request, Response } from 'express';
import { pool } from '../db.js';

const router = Router();

// ════════════════════════════════════════════════════════════════════════════
// 1. BRAND SEARCH — fuzzy trigram + ATC + formulary filter
// ════════════════════════════════════════════════════════════════════════════

router.get('/search', async (req: Request, res: Response) => {
  try {
    const q       = (req.query.q as string || '').trim();
    const atc     = (req.query.atc as string || '').trim();
    const status  = (req.query.status as string || '').trim();
    const limit   = Math.min(parseInt(req.query.limit as string) || 25, 100);
    const offset  = parseInt(req.query.offset as string) || 0;

    // Allow empty search to return complete directory
    // if (!q && !atc && !status) {
    //   return res.status(400).json({ error: 'At least one of q, atc, or status is required.' });
    // }

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (q) {
      // Always use ILIKE for filtering so partial words match properly
      conditions.push(`(name_en ILIKE $${idx} OR name_ar ILIKE $${idx})`);
      params.push(`%${q}%`);
      idx++;
    }
    if (atc) {
      conditions.push(`atc_code ILIKE $${idx}`);
      params.push(`${atc}%`);
      idx++;
    }
    if (status) {
      conditions.push(`formulary_status = $${idx}`);
      params.push(status);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderBy = `ORDER BY name_en ASC`;

    params.push(limit, offset);
    const limitPlaceholder = `$${idx}`;
    const offsetPlaceholder = `$${idx + 1}`;

    const { rows } = await pool.query(`
      SELECT brand_id, name_en, name_ar, formulary_status, company,
             his_coded, scd_id, scd_name, scdf_id, scdf_name,
             atc_code, product_type, scd_legal_status,
             concentration, conc_unit, volume, volume_unit,
             image_id, vezeeta_image_url
      FROM pharma.mv_brand_search
      ${where}
      ${orderBy}
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `, params);

    // Total count for pagination
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM pharma.mv_brand_search ${where}
    `, params.slice(0, params.length - 2));

    res.json({
      results: rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset,
    });
  } catch (error) {
    console.error('[Pharma API] Search error:', error);
    res.status(500).json({ error: 'Search failed.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 2. BRAND DETAIL — full resolved knowledge card
// ════════════════════════════════════════════════════════════════════════════

router.get('/brand/:brandId', async (req: Request, res: Response) => {
  try {
    const { brandId } = req.params;

    // Resolved view (clinical inheritance applied)
    const { rows } = await pool.query(`
      SELECT * FROM pharma.v_brand_resolved WHERE brand_id = $1
    `, [brandId]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Brand not found.' });
    }

    // Also get the clinical MV data (has ingredients JSON)
    const clinical = await pool.query(`
      SELECT ingredients, ingredient_count,
             scdf_light_protection, light_protection_level,
             lasa, lasa_code, lasa_level,
             refrigerated, lower_temp, upper_temp,
             psp, market_shortage
      FROM pharma.mv_brand_clinical
      WHERE brand_id = $1
    `, [brandId]);

    res.json({
      ...rows[0],
      ...(clinical.rows[0] || {}),
    });
  } catch (error) {
    console.error('[Pharma API] Brand detail error:', error);
    res.status(500).json({ error: 'Failed to fetch brand details.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
// 3. BRAND INGREDIENTS — full ingredient list with clinical rules
// ════════════════════════════════════════════════════════════════════════════

router.get('/lasa/:lasaCode', async (req: Request, res: Response) => {
  try {
    const { lasaCode } = req.params;
    const { rows } = await pool.query(`
      SELECT brand_id, name_en, name_ar, lasa, lasa_level, scd_name
      FROM pharma.v_brand_resolved
      WHERE lasa_code = $1
      ORDER BY name_en ASC
    `, [lasaCode]);
    
    res.json(rows);
  } catch (error) {
    console.error('[Pharma API] LASA lookup error:', error);
    res.status(500).json({ error: 'Failed to fetch LASA group.' });
  }
});

router.get('/brand/:brandId/ingredients', async (req: Request, res: Response) => {
  try {
    const { brandId } = req.params;

    const { rows } = await pool.query(`
      SELECT
        si.scdf_in_id,
        si.rank,
        si.api,
        si.api_roa_ref,
        si.ingredient_route_id,
        ir.api_roa,
        cr.legal_status,
        cr.hazardous,
        cr.concern_level,
        cr.cytotoxic,
        cr.renal_adj,
        cr.hepatic_adj,
        cr.obesity_adj,
        cr.pregnancy_alarm,
        cr.pregnancy_note,
        cr.older_adult_flag,
        cr.approval_status
      FROM pharma.brand b
      JOIN pharma.scd s ON s.scd_id = b.scd_id
      JOIN pharma.scdf_ingredient si ON si.scdf_id = s.scdf_id
      LEFT JOIN pharma.ingredient_route ir ON ir.id = si.ingredient_route_id
      LEFT JOIN pharma.ir_clinical_rule cr
        ON cr.ingredient_route_id = si.ingredient_route_id
        AND cr.is_active = TRUE AND cr.approval_status = 'Approved'
      WHERE b.brand_id = $1
      ORDER BY si.rank ASC NULLS LAST
    `, [brandId]);

    res.json({ brandId, ingredients: rows });
  } catch (error) {
    console.error('[Pharma API] Ingredients error:', error);
    res.status(500).json({ error: 'Failed to fetch ingredients.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 4. BRAND ADRs — adverse reactions through ingredient → SIDER
// ════════════════════════════════════════════════════════════════════════════

router.get('/brand/:brandId/adrs', async (req: Request, res: Response) => {
  try {
    const { brandId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const { rows } = await pool.query(`
      SELECT DISTINCT ON (a.side_effect_name)
        a.adr_id,
        a.side_effect_name,
        a.frequency_label,
        a.freq_lower,
        a.freq_upper,
        a.umls_cui,
        si.api AS source_ingredient
      FROM pharma.brand b
      JOIN pharma.scd s ON s.scd_id = b.scd_id
      JOIN pharma.scdf_ingredient si ON si.scdf_id = s.scdf_id
      JOIN pharma.ir_external_map em
        ON em.ingredient_route_id = si.ingredient_route_id
        AND em.source ILIKE 'sider'
      JOIN pharma.adr a ON a.stitch_cid = em.external_id
      WHERE b.brand_id = $1
      ORDER BY a.side_effect_name, a.frequency_label DESC NULLS LAST
      LIMIT $2
    `, [brandId, limit]);

    res.json({ brandId, adrs: rows, count: rows.length });
  } catch (error) {
    console.error('[Pharma API] ADR error:', error);
    res.status(500).json({ error: 'Failed to fetch ADRs.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 5. BRAND INDICATIONS — labelled indications through ingredient → DrugBank
// ════════════════════════════════════════════════════════════════════════════

router.get('/brand/:brandId/indications', async (req: Request, res: Response) => {
  try {
    const { brandId } = req.params;

    const { rows } = await pool.query(`
      SELECT DISTINCT ON (ind.indication_id)
        ind.indication_id,
        ind.drug_name,
        ind.indication_type,
        ind.indication_text,
        ind.approval_level,
        ind.age_group,
        ind.patient_chars,
        ind.dose_form,
        si.api AS source_ingredient
      FROM pharma.brand b
      JOIN pharma.scd s ON s.scd_id = b.scd_id
      JOIN pharma.scdf_ingredient si ON si.scdf_id = s.scdf_id
      JOIN pharma.ir_external_map em
        ON em.ingredient_route_id = si.ingredient_route_id
        AND em.source ILIKE 'drugbank'
      JOIN pharma.indication ind ON ind.drugbank_id = em.external_id
      WHERE b.brand_id = $1
      ORDER BY ind.indication_id
    `, [brandId]);

    res.json({ brandId, indications: rows, count: rows.length });
  } catch (error) {
    console.error('[Pharma API] Indications error:', error);
    res.status(500).json({ error: 'Failed to fetch indications.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 6. DDI CHECKER — multi-drug pairwise interaction scan
// ════════════════════════════════════════════════════════════════════════════

router.post('/ddi-check', async (req: Request, res: Response) => {
  try {
    const { ddinterIds } = req.body;
    if (!Array.isArray(ddinterIds) || ddinterIds.length < 2) {
      return res.status(400).json({
        error: 'Provide at least 2 DDInter IDs in ddinterIds array.',
      });
    }

    if (ddinterIds.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 drugs per check.' });
    }

    // Query all pairwise interactions from the symmetric MV
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (ddi_id)
        ddi_id,
        my_ddinter_id,
        my_drug,
        other_ddinter_id,
        other_drug,
        severity,
        mode,
        interaction_text,
        management_text
      FROM pharma.mv_ddi_symmetric
      WHERE my_ddinter_id = ANY($1)
        AND other_ddinter_id = ANY($1)
        AND my_ddinter_id < other_ddinter_id
      ORDER BY ddi_id
    `, [ddinterIds]);

    // Group by severity for summary
    const summary = {
      Major: 0,
      Moderate: 0,
      Minor: 0,
      Unknown: 0,
      total: rows.length,
    };
    for (const r of rows) {
      const sev = r.severity as keyof typeof summary;
      if (sev in summary) (summary[sev] as number)++;
      else summary.Unknown++;
    }

    res.json({
      drugCount: ddinterIds.length,
      interactionCount: rows.length,
      summary,
      interactions: rows,
    });
  } catch (error) {
    console.error('[Pharma API] DDI check error:', error);
    res.status(500).json({ error: 'DDI check failed.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 7. DDI CHECK BY BRAND IDs — resolve brand → ingredient → DDInter ID
// ════════════════════════════════════════════════════════════════════════════

router.post('/ddi-check-brands', async (req: Request, res: Response) => {
  try {
    const { brandIds } = req.body;
    if (!Array.isArray(brandIds) || brandIds.length < 2) {
      return res.status(400).json({
        error: 'Provide at least 2 brand IDs in brandIds array.',
      });
    }

    // Resolve brand → ingredient → DDInter mapping
    const mappingResult = await pool.query(`
      SELECT DISTINCT
        b.brand_id,
        b.name_en AS brand_name,
        em.external_id AS ddinter_id,
        si.api
      FROM pharma.brand b
      JOIN pharma.scd s ON s.scd_id = b.scd_id
      JOIN pharma.scdf_ingredient si ON si.scdf_id = s.scdf_id
      JOIN pharma.ir_external_map em
        ON em.ingredient_route_id = si.ingredient_route_id
        AND em.source ILIKE 'ddinter'
      WHERE b.brand_id = ANY($1)
    `, [brandIds]);

    const ddinterIds = [...new Set(mappingResult.rows.map(r => r.ddinter_id))];

    if (ddinterIds.length < 2) {
      return res.json({
        drugCount: brandIds.length,
        mappedIngredients: mappingResult.rows.length,
        interactionCount: 0,
        summary: { Major: 0, Moderate: 0, Minor: 0, Unknown: 0, total: 0 },
        brandMapping: mappingResult.rows,
        interactions: [],
      });
    }

    // Run DDI check
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (ddi_id)
        ddi_id,
        my_ddinter_id,
        my_drug,
        other_ddinter_id,
        other_drug,
        severity,
        mode,
        interaction_text,
        management_text
      FROM pharma.mv_ddi_symmetric
      WHERE my_ddinter_id = ANY($1)
        AND other_ddinter_id = ANY($1)
        AND my_ddinter_id < other_ddinter_id
      ORDER BY ddi_id
    `, [ddinterIds]);

    const summary = { Major: 0, Moderate: 0, Minor: 0, Unknown: 0, total: rows.length };
    for (const r of rows) {
      const sev = r.severity as keyof typeof summary;
      if (sev in summary) (summary[sev] as number)++;
      else summary.Unknown++;
    }

    res.json({
      drugCount: brandIds.length,
      mappedIngredients: mappingResult.rows.length,
      interactionCount: rows.length,
      summary,
      brandMapping: mappingResult.rows,
      interactions: rows,
    });
  } catch (error) {
    console.error('[Pharma API] DDI brand check error:', error);
    res.status(500).json({ error: 'DDI brand check failed.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 8. INGREDIENT DETAIL
// ════════════════════════════════════════════════════════════════════════════

router.get('/ingredient/:irId', async (req: Request, res: Response) => {
  try {
    const irId = parseInt(req.params.irId);

    // Core identity
    const ir = await pool.query(`
      SELECT * FROM pharma.ingredient_route WHERE id = $1
    `, [irId]);
    if (!ir.rows.length) return res.status(404).json({ error: 'Ingredient-route not found.' });

    // Clinical rule
    const rule = await pool.query(`
      SELECT * FROM pharma.ir_clinical_rule
      WHERE ingredient_route_id = $1 AND is_active = TRUE AND approval_status = 'Approved'
    `, [irId]);

    // External mappings
    const maps = await pool.query(`
      SELECT * FROM pharma.ir_external_map WHERE ingredient_route_id = $1
    `, [irId]);

    // Brands containing this ingredient
    const brands = await pool.query(`
      SELECT DISTINCT b.brand_id, b.name_en, b.formulary_status
      FROM pharma.scdf_ingredient si
      JOIN pharma.scd s ON s.scdf_id = si.scdf_id
      JOIN pharma.brand b ON b.scd_id = s.scd_id
      WHERE si.ingredient_route_id = $1
      LIMIT 50
    `, [irId]);

    res.json({
      identity: ir.rows[0],
      clinicalRule: rule.rows[0] || null,
      externalMappings: maps.rows,
      brands: brands.rows,
    });
  } catch (error) {
    console.error('[Pharma API] Ingredient error:', error);
    res.status(500).json({ error: 'Failed to fetch ingredient.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 9. STATS — database overview
// ════════════════════════════════════════════════════════════════════════════

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const tables = [
      { key: 'ingredients', q: 'SELECT COUNT(*) FROM pharma.ingredient_route' },
      { key: 'brands', q: 'SELECT COUNT(*) FROM pharma.brand' },
      { key: 'scdf', q: 'SELECT COUNT(*) FROM pharma.scdf' },
      { key: 'scd', q: 'SELECT COUNT(*) FROM pharma.scd' },
      { key: 'ddi', q: 'SELECT COUNT(*) FROM pharma.ddi' },
      { key: 'adr', q: 'SELECT COUNT(*) FROM pharma.adr' },
      { key: 'indications', q: 'SELECT COUNT(*) FROM pharma.indication' },
      { key: 'atc_codes', q: 'SELECT COUNT(*) FROM pharma.atc' },
    ];

    const stats: Record<string, number> = {};
    for (const t of tables) {
      const r = await pool.query(t.q);
      stats[t.key] = parseInt(r.rows[0].count);
    }

    // Severity distribution
    const sevDist = await pool.query(`
      SELECT severity, COUNT(*)::int AS count
      FROM pharma.ddi GROUP BY severity ORDER BY count DESC
    `);

    // Formulary distribution
    const formDist = await pool.query(`
      SELECT formulary_status, COUNT(*)::int AS count
      FROM pharma.brand GROUP BY formulary_status ORDER BY count DESC
    `);

    // Last MV refresh
    const lastRefresh = await pool.query(`
      SELECT view_name, status, duration_ms, completed_at
      FROM pharma.mv_refresh_log ORDER BY id DESC LIMIT 5
    `);

    res.json({
      counts: stats,
      severityDistribution: sevDist.rows,
      formularyDistribution: formDist.rows,
      lastRefreshes: lastRefresh.rows,
    });
  } catch (error) {
    console.error('[Pharma API] Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 10. MV REFRESH — on-demand materialized view refresh
// ════════════════════════════════════════════════════════════════════════════

router.post('/refresh-views', async (req: Request, res: Response) => {
  try {
    const views = ['mv_ddi_symmetric', 'mv_brand_search', 'mv_brand_clinical'];
    const triggeredBy = (req as any).user?.loginId || 'api';

    const results: { view: string; status: string; ms: number }[] = [];
    for (const v of views) {
      const start = Date.now();
      await pool.query(`SELECT pharma.refresh_mv($1, $2)`, [v, triggeredBy]);
      results.push({ view: v, status: 'refreshed', ms: Date.now() - start });
    }

    res.json({ refreshed: results });
  } catch (error) {
    console.error('[Pharma API] Refresh error:', error);
    res.status(500).json({ error: 'View refresh failed.' });
  }
});

export default router;
