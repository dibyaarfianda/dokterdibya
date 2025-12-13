# Build APK - Dokter Dibya Patient App

## Prerequisites

1. **Android Studio** - Download dari https://developer.android.com/studio
2. **Node.js** >= 18 - Download dari https://nodejs.org
3. **Java JDK 17** - Biasanya sudah include di Android Studio

---

## Langkah Build APK

### 1. Download Project

```bash
# Clone atau download folder mobile-app dari server
scp -r root@dokterdibya.com:/var/www/dokterdibya/mobile-app ./
```

### 2. Install Dependencies

```bash
cd mobile-app
npm install
```

### 3. Sync Capacitor

```bash
npx cap sync android
```

### 4. Buka di Android Studio

```bash
npx cap open android
```

### 5. Build APK

**Via Android Studio:**
1. Tunggu Gradle sync selesai
2. Menu: **Build → Build Bundle(s) / APK(s) → Build APK(s)**
3. Tunggu build selesai
4. Klik **"locate"** untuk melihat file APK

**Via Command Line:**
```bash
cd android
./gradlew assembleDebug
```

### 6. Lokasi APK

```
android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Build Release APK (Untuk Play Store)

### 1. Generate Keystore

```bash
keytool -genkey -v -keystore dokterdibya.keystore -alias dokterdibya -keyalg RSA -keysize 2048 -validity 10000
```

Isi informasi:
- Password: (buat password kuat)
- Nama: Dokter Dibya
- Organization: Dokter Dibya Clinic
- City: Surabaya
- Country: ID

### 2. Buat key.properties

Buat file `android/key.properties`:
```properties
storePassword=PASSWORD_ANDA
keyPassword=PASSWORD_ANDA
keyAlias=dokterdibya
storeFile=../dokterdibya.keystore
```

### 3. Update build.gradle

Edit `android/app/build.gradle`, tambahkan sebelum `android {`:

```gradle
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file('key.properties')
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

Dan di dalam `android {` tambahkan:

```gradle
signingConfigs {
    release {
        keyAlias keystoreProperties['keyAlias']
        keyPassword keystoreProperties['keyPassword']
        storeFile file(keystoreProperties['storeFile'])
        storePassword keystoreProperties['storePassword']
    }
}

buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled true
        proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
    }
}
```

### 4. Build Release

```bash
cd android
./gradlew assembleRelease
```

APK ada di: `android/app/build/outputs/apk/release/app-release.apk`

---

## Customize App

### Ganti App Icon

Gunakan https://appicon.co untuk generate icon, lalu replace:
- `android/app/src/main/res/mipmap-*/ic_launcher.png`

### Ganti Splash Screen

Replace file:
- `android/app/src/main/res/drawable-*/splash.png`

### Ganti App Name

Edit `android/app/src/main/res/values/strings.xml`:
```xml
<string name="app_name">Dokter Dibya</string>
```

---

## Troubleshooting

### Gradle Sync Error
```bash
cd android
./gradlew clean
./gradlew --refresh-dependencies
```

### Video Tidak Muncul
Pastikan file `logo_dd.mp4` ada di `www/` dan sudah di-sync:
```bash
npx cap sync android
```

### Build Error Java Version
Set JAVA_HOME ke JDK 17:
```bash
export JAVA_HOME=/path/to/jdk-17
```

---

## Quick Commands

```bash
# Sync setelah edit www/
npx cap sync android

# Build debug APK
cd android && ./gradlew assembleDebug

# Build release APK
cd android && ./gradlew assembleRelease

# Clean build
cd android && ./gradlew clean
```
