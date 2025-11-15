# Dibya Klinik Staff - Android Build Guide

## Prerequisites
- Android Studio installed
- Java JDK 17 or higher
- Node.js and npm

## Build APK Instructions

### 1. Open Android Studio
```bash
cd /var/www/dokterdibya/staff
npx cap open android
```

### 2. Build APK via Android Studio
1. Click `Build` → `Build Bundle(s) / APK(s)` → `Build APK(s)`
2. Wait for Gradle build to complete
3. APK will be located at: `android/app/build/outputs/apk/debug/app-debug.apk`

### 3. Build APK via Command Line
```bash
cd /var/www/dokterdibya/staff/android
./gradlew assembleDebug
```
Output: `android/app/build/outputs/apk/debug/app-debug.apk`

### 4. Build Release APK (Signed)
First, create a keystore:
```bash
keytool -genkey -v -keystore dibya-staff.keystore -alias dibya-staff -keyalg RSA -keysize 2048 -validity 10000
```

Then build:
```bash
cd /var/www/dokterdibya/staff/android
./gradlew assembleRelease
```

### 5. Sync Web Changes
After modifying web files:
```bash
cd /var/www/dokterdibya/staff
npx cap sync android
```

## Install APK on Device
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

## Quick Build Script
```bash
#!/bin/bash
cd /var/www/dokterdibya/staff
npx cap sync android
cd android
./gradlew assembleDebug
echo "APK built: android/app/build/outputs/apk/debug/app-debug.apk"
```

## Configuration
- App ID: `com.dokterdibya.staff`
- App Name: Dibya Klinik Staff
- Web Content: Points to https://dokterdibya.com/staff/public/install.html

## Notes
- The app loads your live website, so updates happen automatically
- For offline functionality, configure Capacitor caching
- To use local files instead of remote URL, remove `server.url` from capacitor.config.json
