#!/bin/bash
# Quick build script for Dibya Staff Android APK

echo "🔨 Building Dibya Staff Android APK..."

cd /var/www/dokterdibya/staff

# Sync web assets
echo "📦 Syncing web assets..."
npx cap sync android

# Build APK
echo "🏗️  Building APK..."
cd android
./gradlew assembleDebug

# Show output location
echo ""
echo "✅ Build complete!"
echo "📱 APK location: android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "Install with: adb install android/app/build/outputs/apk/debug/app-debug.apk"
