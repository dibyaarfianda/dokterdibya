#!/bin/bash

# ================================================
# Dokter Dibya Patient App - Setup Script
# ================================================

echo "🏥 Dokter Dibya Patient App - Setup"
echo "===================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js tidak ditemukan!"
    echo "   Download dari: https://nodejs.org"
    exit 1
fi
echo "✅ Node.js: $(node -v)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm tidak ditemukan!"
    exit 1
fi
echo "✅ npm: $(npm -v)"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ npm install gagal!"
    exit 1
fi
echo "✅ Dependencies installed"

# Sync Capacitor
echo ""
echo "🔄 Syncing Capacitor..."
npx cap sync android

if [ $? -ne 0 ]; then
    echo "❌ Capacitor sync gagal!"
    exit 1
fi
echo "✅ Capacitor synced"

# Done
echo ""
echo "===================================="
echo "✅ Setup selesai!"
echo ""
echo "Next steps:"
echo "  1. npx cap open android   (buka Android Studio)"
echo "  2. Build → Build APK(s)"
echo ""
echo "Atau build via command line:"
echo "  cd android && ./gradlew assembleDebug"
echo ""
