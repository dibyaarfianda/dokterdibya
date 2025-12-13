# Dokter Dibya Patient Portal - Mobile App

Aplikasi mobile untuk patient portal dokterDIBYA menggunakan Capacitor.

## Fitur

- Login/Register pasien
- Dashboard pasien
- Booking janji temu
- Riwayat kunjungan
- Pengumuman klinik
- Formulir intake pasien
- Push notifications

## Tech Stack

- **Framework**: Capacitor 6.x
- **Web**: Load dari https://dokterdibya.com (live URL)
- **Offline**: Fallback page saat tidak ada internet
- **Native Features**: Push notifications, Camera, Local notifications

## Struktur Project

```
mobile-app/
├── package.json          # Dependencies
├── capacitor.config.ts   # Capacitor configuration
├── www/                  # Web assets (offline fallback)
│   └── index.html        # Offline page
├── android/              # Android project (auto-generated)
│   └── app/
│       └── src/main/
│           ├── res/      # Resources (icons, splash)
│           └── AndroidManifest.xml
└── README.md
```

## Build Instructions

### Prerequisites

1. **Node.js** >= 18.x
2. **Android Studio** dengan:
   - Android SDK 34
   - Android Build Tools
   - Android Emulator (optional)

### Cara Build APK

#### Option A: Build di komputer lokal

1. **Clone/download folder ini ke komputer lokal**

2. **Install dependencies**
   ```bash
   cd mobile-app
   npm install
   ```

3. **Sync Capacitor**
   ```bash
   npx cap sync android
   ```

4. **Buka di Android Studio**
   ```bash
   npx cap open android
   ```

5. **Build APK**
   - Di Android Studio: Build → Build Bundle(s) / APK(s) → Build APK(s)
   - Atau via command line:
     ```bash
     cd android
     ./gradlew assembleDebug    # Debug APK
     ./gradlew assembleRelease  # Release APK (butuh signing)
     ```

6. **Lokasi APK**
   - Debug: `android/app/build/outputs/apk/debug/app-debug.apk`
   - Release: `android/app/build/outputs/apk/release/app-release.apk`

#### Option B: GitHub Actions (CI/CD)

Buat file `.github/workflows/build-android.yml`:

```yaml
name: Build Android APK

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Install dependencies
        run: npm install

      - name: Sync Capacitor
        run: npx cap sync android

      - name: Build APK
        run: |
          cd android
          chmod +x gradlew
          ./gradlew assembleDebug

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: app-debug
          path: android/app/build/outputs/apk/debug/app-debug.apk
```

### Signing Release APK (untuk Play Store)

1. **Generate keystore**
   ```bash
   keytool -genkey -v -keystore dokterdibya.keystore -alias dokterdibya -keyalg RSA -keysize 2048 -validity 10000
   ```

2. **Buat file `android/key.properties`**
   ```properties
   storePassword=YOUR_STORE_PASSWORD
   keyPassword=YOUR_KEY_PASSWORD
   keyAlias=dokterdibya
   storeFile=../dokterdibya.keystore
   ```

3. **Update `android/app/build.gradle`**
   Tambahkan signing config untuk release build.

## Customization

### App Icon

Ganti file di:
- `android/app/src/main/res/mipmap-*/ic_launcher.png`

Ukuran yang dibutuhkan:
- mdpi: 48x48
- hdpi: 72x72
- xhdpi: 96x96
- xxhdpi: 144x144
- xxxhdpi: 192x192

### Splash Screen

Ganti file di:
- `android/app/src/main/res/drawable-*/splash.png`

### App Name

Edit `android/app/src/main/res/values/strings.xml`:
```xml
<string name="app_name">Dokter Dibya</string>
```

### Colors

Edit `android/app/src/main/res/values/colors.xml`:
```xml
<color name="colorPrimary">#0066FF</color>
<color name="colorPrimaryDark">#0052CC</color>
```

## Troubleshooting

### WebView tidak load

1. Pastikan `server.url` di `capacitor.config.ts` benar
2. Cek apakah `cleartext` perlu di-enable untuk HTTP (non-HTTPS)

### Push Notifications tidak bekerja

1. Setup Firebase Cloud Messaging
2. Tambahkan `google-services.json` ke `android/app/`
3. Update `AndroidManifest.xml` dengan permissions

### Build Error

```bash
# Clean dan rebuild
cd android
./gradlew clean
./gradlew assembleDebug
```

## Support

Hubungi tim IT dokterDIBYA untuk bantuan teknis.
