#!/bin/bash
sudo -u postgres psql -d clinicarepro_app -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"
echo "---TABLE COUNT---"
sudo -u postgres psql -d clinicarepro_app -t -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';"
echo "=== CHECK_DONE ==="
