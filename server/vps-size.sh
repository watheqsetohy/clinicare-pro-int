#!/bin/bash
echo "=== DATABASE SIZE ON VPS ==="
sudo -u postgres psql -d clinicarepro_app -c "SELECT pg_size_pretty(pg_database_size('clinicarepro_app')) as total_db_size;"
echo ""
echo "=== TOP 10 LARGEST TABLES ==="
sudo -u postgres psql -d clinicarepro_app -c "
SELECT tablename, 
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size
FROM pg_tables 
WHERE schemaname='public' 
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC 
LIMIT 10;"
echo "=== DISK USAGE ==="
df -h /
