#!/bin/bash
# Create and announce latest updates to patients
# Usage: ./announce-updates.sh

set -e

echo "🎉 Mengupdate Announcement dengan semua update terbaru..."

# Read SQL from file
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SQL_FILE="$SCRIPT_DIR/insert-update-announcement.sql"

if [ ! -f "$SQL_FILE" ]; then
    echo "❌ Error: SQL file tidak ditemukan di $SQL_FILE"
    exit 1
fi

# Execute SQL
echo "📝 Update announcement di database..."
mysql -u root dibyaklinik < "$SQL_FILE"

echo ""
echo "✅ Announcement berhasil diupdate!"
echo ""
echo "📢 Update yang ditampilkan ke pasien:"
echo "   - Judul: 🎉 Pembaruan Portal Pasien - Maret 2026"
echo "   - 9 poin update (Badge Dokumen, Album USG, Performa)"
echo "   - Prioritas: URGENT"
echo "   - Status: ACTIVE"
echo ""
echo "📱 Patients akan melihat pengumuman terbaru saat membuka portal"
echo ""
