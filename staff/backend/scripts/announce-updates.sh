#!/bin/bash
# Create and announce latest updates to patients
# Usage: ./announce-updates.sh

set -e

echo "🎉 Membuat Announcement tentang 5 Update Terakhir..."

# Read SQL from file
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SQL_FILE="$SCRIPT_DIR/insert-update-announcement.sql"

if [ ! -f "$SQL_FILE" ]; then
    echo "❌ Error: SQL file tidak ditemukan di $SQL_FILE"
    exit 1
fi

# Execute SQL
echo "📝 Insert announcement ke database..."
mysql -u root dibyaklinik < "$SQL_FILE"

echo ""
echo "✅ Announcement berhasil dibuat!"
echo ""
echo "📢 Informasi yang ditampilkan ke pasien:"
echo "   - Judul: 🎉 Pembaruan Portal Pasien - Perbaikan Album USG & Performa"
echo "   - Prioritas: HIGH"
echo "   - Status: ACTIVE"
echo ""
echo "📱 Patients akan melihat notifikasi saat membuka portal mereka"
echo ""
echo "💡 Tip: Patients perlu reload (F5) untuk update cache terbaru"
echo ""
