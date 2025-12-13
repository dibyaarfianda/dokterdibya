#!/bin/bash

# ================================================
# Dokter Dibya Patient App - Build APK Script
# ================================================

echo "🏥 Dokter Dibya Patient App - Build APK"
echo "========================================"
echo ""

# Parse arguments
BUILD_TYPE=${1:-debug}

# Sync first
echo "🔄 Syncing Capacitor..."
npx cap sync android
echo ""

# Build
echo "🔨 Building $BUILD_TYPE APK..."
cd android

if [ "$BUILD_TYPE" == "release" ]; then
    ./gradlew assembleRelease
    APK_PATH="app/build/outputs/apk/release/app-release.apk"
else
    ./gradlew assembleDebug
    APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
fi

cd ..

# Check result
if [ -f "android/$APK_PATH" ]; then
    echo ""
    echo "========================================"
    echo "✅ Build berhasil!"
    echo ""
    echo "📱 APK location:"
    echo "   android/$APK_PATH"
    echo ""

    # Show file size
    SIZE=$(du -h "android/$APK_PATH" | cut -f1)
    echo "📦 Size: $SIZE"
    echo ""

    # Copy to root for easy access
    cp "android/$APK_PATH" "./DokterDibya-$BUILD_TYPE.apk"
    echo "📋 Copied to: ./DokterDibya-$BUILD_TYPE.apk"
else
    echo ""
    echo "❌ Build gagal! Cek error di atas."
    exit 1
fi
