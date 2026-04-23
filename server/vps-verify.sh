#!/bin/bash
echo "=== VPS Database Verification ==="
sudo -u postgres psql -d clinicarepro_app -c "
SELECT 'users' as table_name, count(*) FROM users
UNION ALL SELECT 'rxnconso', count(*) FROM rxnconso
UNION ALL SELECT 'sct2_descriptions', count(*) FROM sct2_descriptions
UNION ALL SELECT 'drug_indications', count(*) FROM drug_indications
UNION ALL SELECT 'drug_contraindications', count(*) FROM drug_contraindications
UNION ALL SELECT 'drug_interactions', count(*) FROM drug_interactions
UNION ALL SELECT 'drug_adverse', count(*) FROM drug_adverse
UNION ALL SELECT 'drug_pk', count(*) FROM drug_pk
UNION ALL SELECT 'drug_dosing', count(*) FROM drug_dosing
UNION ALL SELECT 'drug_pgx', count(*) FROM drug_pgx
ORDER BY 1;
"
echo "=== VERIFY_DONE ==="
