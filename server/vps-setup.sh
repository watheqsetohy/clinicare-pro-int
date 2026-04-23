#!/bin/bash
set -e

echo "=== Creating PostgreSQL user and database ==="
sudo -u postgres psql -c "CREATE USER clinicare WITH PASSWORD 'Cl1n1care2026' SUPERUSER;" 2>/dev/null || echo "User already exists"
sudo -u postgres psql -c "CREATE DATABASE clinicarepro_app OWNER clinicare;" 2>/dev/null || echo "Database already exists"

echo "=== Configuring remote access ==="
PG_HBA=$(find /etc/postgresql -name pg_hba.conf | head -1)
PG_CONF=$(find /etc/postgresql -name postgresql.conf | head -1)

# Allow remote connections
grep -q "0.0.0.0/0" "$PG_HBA" || echo "host all all 0.0.0.0/0 scram-sha-256" >> "$PG_HBA"

# Listen on all interfaces
sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" "$PG_CONF"
sed -i "s/listen_addresses = 'localhost'/listen_addresses = '*'/" "$PG_CONF"

# Restart PostgreSQL
systemctl restart postgresql

echo "=== Configuring firewall ==="
ufw allow 22/tcp
ufw allow 5432/tcp
ufw allow 3001/tcp
echo "y" | ufw enable 2>/dev/null || true

echo "=== Verifying ==="
sudo -u postgres psql -d clinicarepro_app -c "SELECT current_database(), current_user, version();"

echo "=== VPS_SETUP_COMPLETE ==="
