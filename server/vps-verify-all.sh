#!/bin/bash
echo "=== DATA VERIFICATION BY CATEGORY ==="
sudo -u postgres psql -d clinicarepro_app <<'SQL'
SELECT '── RxNorm ──' as category, '' as table_name, '' as row_count
UNION ALL SELECT '', 'rxnorm_concept', count(*)::text FROM rxnorm_concept
UNION ALL SELECT '', 'rxnorm_relationship', count(*)::text FROM rxnorm_relationship
UNION ALL SELECT '', 'rxnorm_attribute', count(*)::text FROM rxnorm_attribute
UNION ALL SELECT '', 'rxnorm_indication', count(*)::text FROM rxnorm_indication
UNION ALL SELECT '', 'rxnorm_snomed_map', count(*)::text FROM rxnorm_snomed_map
UNION ALL SELECT '── UMLS ──', '', ''
UNION ALL SELECT '', 'umls_definition', count(*)::text FROM umls_definition
UNION ALL SELECT '', 'umls_semantic_type', count(*)::text FROM umls_semantic_type
UNION ALL SELECT '── SNOMED CT ──', '', ''
UNION ALL SELECT '', 'snomed_concept', count(*)::text FROM snomed_concept
UNION ALL SELECT '', 'snomed_description', count(*)::text FROM snomed_description
UNION ALL SELECT '', 'snomed_relationship', count(*)::text FROM snomed_relationship
UNION ALL SELECT '── MED-RT ──', '', ''
UNION ALL SELECT '', 'medrt_concept', count(*)::text FROM medrt_concept
UNION ALL SELECT '', 'medrt_indication', count(*)::text FROM medrt_indication
UNION ALL SELECT '', 'medrt_rxnorm_map', count(*)::text FROM medrt_rxnorm_map
UNION ALL SELECT '── PGx ──', '', ''
UNION ALL SELECT '', 'cdss_drug_gene_interaction', count(*)::text FROM cdss_drug_gene_interaction
UNION ALL SELECT '── CDSS Clinical ──', '', ''
UNION ALL SELECT '', 'cdss_drug_dosing', count(*)::text FROM cdss_drug_dosing
UNION ALL SELECT '', 'cdss_drug_interaction', count(*)::text FROM cdss_drug_interaction
UNION ALL SELECT '', 'cdss_drug_adverse_effect', count(*)::text FROM cdss_drug_adverse_effect
UNION ALL SELECT '', 'cdss_drug_contraindication', count(*)::text FROM cdss_drug_contraindication
UNION ALL SELECT '', 'cdss_drug_pk', count(*)::text FROM cdss_drug_pk
UNION ALL SELECT '── Users/Roles/Corporate ──', '', ''
UNION ALL SELECT '', 'users', count(*)::text FROM users
UNION ALL SELECT '', 'roles', count(*)::text FROM roles
UNION ALL SELECT '', 'arh_role_hierarchy', count(*)::text FROM arh_role_hierarchy
UNION ALL SELECT '', 'arh_role_reporting_lines', count(*)::text FROM arh_role_reporting_lines;
SQL
echo "=== ALL_VERIFIED ==="
