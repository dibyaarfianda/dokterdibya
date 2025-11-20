# Build APK - Quick Guide

## Ready to Build! ✅

The Android project is now configured and ready to build an APK.

---

## Configuration

**VPS Connection:**
- Server: `72.60.78.188:3000`
- Protocol: HTTP (cleartext enabled)
- Socket.IO: Enabled
- Firebase: Removed (not used)

**App Details:**
- Package: `com.dokterdibya.app`
- Min SDK: 24 (Android 7.0)
- Target SDK: 34 (Android 14)
- Version: 1.0.0

---

## Build Steps

### Method 1: Android Studio (Easiest)

1. **Open Android Studio**

2. **Open Project**
   ```
   File → Open → Select: /home/user/dokterdibya/android-app/DokterDibya
   ```

3. **Wait for Gradle Sync**
   - Android Studio will automatically sync
   - This may take 2-5 minutes on first run
   - Check "Build" tab for progress

4. **Build APK**
   ```
   Build → Build Bundle(s) / APK(s) → Build APK(s)
   ```
   OR press: **Ctrl+F9** (Linux/Windows) / **Cmd+F9** (Mac)

5. **Find Your APK**
   ```
   Location: app/build/outputs/apk/debug/app-debug.apk
   Size: ~15-25 MB
   ```

6. **Install on Device**
   - Connect device via USB
   - Click "Run" ▶️ button
   - Or use: `Run → Run 'app'`

---

### Method 2: Command Line (Advanced)

```bash
# Navigate to project
cd /home/user/dokterdibya/android-app/DokterDibya

# Make gradlew executable
chmod +x gradlew

# Build debug APK
./gradlew assembleDebug

# Output location
ls -lh app/build/outputs/apk/debug/app-debug.apk

# Install on connected device
adb install app/build/outputs/apk/debug/app-debug.apk
```

---

### Method 3: Build Release APK (For Production)

```bash
# Generate keystore (first time only)
keytool -genkey -v -keystore dokter-dibya.keystore \
  -alias dokter_dibya -keyalg RSA -keysize 2048 -validity 10000

# Build release APK
./gradlew assembleRelease

# Sign APK
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore dokter-dibya.keystore \
  app/build/outputs/apk/release/app-release-unsigned.apk dokter_dibya

# Align APK
zipalign -v 4 app/build/outputs/apk/release/app-release-unsigned.apk \
  app/build/outputs/apk/release/app-release.apk
```

---

## Troubleshooting

### Issue: "Gradle sync failed"
**Solution:**
```bash
# Clear Gradle cache
./gradlew clean
rm -rf .gradle build

# Sync again
./gradlew build
```

### Issue: "SDK not found"
**Solution:**
1. Open Android Studio
2. File → Settings → Appearance & Behavior → System Settings → Android SDK
3. Install SDK Platform 34
4. Install Build Tools 34.0.0

### Issue: "Cannot resolve symbol 'R'"
**Solution:**
```bash
# Rebuild project
./gradlew clean build
```

In Android Studio:
```
Build → Clean Project
Build → Rebuild Project
```

### Issue: "Duplicate class found"
**Solution:**
Check `app/build.gradle.kts` for conflicting dependencies.
The simplified version should already have this fixed.

### Issue: "Failed to connect to server"
**Solution:**
1. Check VPS is running:
   ```bash
   ssh root@72.60.78.188
   pm2 status
   ```

2. Test API:
   ```bash
   curl http://72.60.78.188:3000/api/health
   ```

3. Check firewall allows port 3000

---

## Testing the APK

### 1. Install on Android Device

**Via USB:**
```bash
# Enable USB debugging on device
# Connect device
adb devices
adb install app/build/outputs/apk/debug/app-debug.apk
```

**Via File Transfer:**
- Copy `app-debug.apk` to device
- Open file manager on device
- Tap APK file
- Install (allow installation from unknown sources if needed)

### 2. Test App Features

**Current Features (v1.0):**
- ✅ Splash screen
- ✅ Welcome screen
- ✅ Theme (Light/Dark)
- ✅ VPS connection ready
- ✅ Socket.IO configured
- ⏳ Login (UI ready, needs implementation)
- ⏳ Dashboard (basic version)

### 3. View Logs

```bash
# View all logs
adb logcat

# Filter Dokter Dibya logs
adb logcat | grep "DokterDibya"

# View Timber logs
adb logcat | grep "Timber"

# View network logs
adb logcat | grep "OkHttp"
```

---

## Project Structure

```
DokterDibya/
├── app/
│   ├── build.gradle.kts           ✅ (Using simplified version)
│   ├── proguard-rules.pro         ✅
│   └── src/
│       └── main/
│           ├── AndroidManifest.xml        ✅ (Simplified)
│           ├── java/com/dokterdibya/app/
│           │   ├── DokterDibyaApp.kt     ✅
│           │   ├── data/
│           │   │   ├── local/
│           │   │   │   └── PreferencesManager.kt  ✅
│           │   │   ├── remote/
│           │   │   │   ├── api/ApiService.kt      ✅
│           │   │   │   └── socket/SocketManager.kt ✅
│           │   │   └── repository/
│           │   │       ├── AuthRepository.kt          ✅
│           │   │       ├── AppointmentRepository.kt   ✅
│           │   │       └── AnnouncementRepository.kt  ✅
│           │   ├── di/
│           │   │   └── NetworkModule.kt   ✅
│           │   ├── domain/
│           │   │   ├── Result.kt          ✅
│           │   │   └── models/
│           │   │       ├── User.kt              ✅
│           │   │       ├── Appointment.kt       ✅
│           │   │       └── Announcement.kt      ✅
│           │   ├── ui/
│           │   │   ├── MainActivity.kt    ✅
│           │   │   └── theme/
│           │   │       ├── Color.kt       ✅
│           │   │       ├── Type.kt        ✅
│           │   │       └── Theme.kt       ✅
│           │   └── utils/
│           │       └── Constants.kt       ✅
│           └── res/
│               ├── values/
│               │   ├── colors.xml         ✅
│               │   ├── strings.xml        ✅
│               │   ├── themes.xml         ✅
│               │   └── dimens.xml         ✅
│               ├── xml/
│               │   ├── data_extraction_rules.xml  ✅
│               │   └── backup_rules.xml          ✅
│               └── drawable/
│                   └── ic_notification.xml       ✅
├── build.gradle.kts              ✅
├── settings.gradle.kts           ✅
└── gradle.properties             ✅
```

---

## Dependencies Status

**Core (All Installed):**
- ✅ Kotlin 1.9.20
- ✅ Jetpack Compose
- ✅ Material 3
- ✅ Hilt (Dependency Injection)
- ✅ Retrofit (REST API)
- ✅ OkHttp (HTTP Client)
- ✅ Socket.IO (Real-time)
- ✅ Coroutines (Async)
- ✅ DataStore (Preferences)
- ✅ Coil (Image Loading)
- ✅ Timber (Logging)

**Removed:**
- ❌ Firebase (not needed)
- ❌ Google Services
- ❌ Room (can be added later)

---

## Next Steps

### Immediate (To Make App Functional)

1. **Implement ViewModels:**
   - AuthViewModel (Login/Register logic)
   - DashboardViewModel (Load data)
   - AppointmentViewModel (Booking logic)

2. **Create UI Screens:**
   - LoginScreen (Email/Password form)
   - RegisterScreen (Full registration)
   - DashboardScreen (Show appointments & announcements)
   - AppointmentsScreen (List view)
   - AnnouncementsScreen (List view)

3. **Add Navigation:**
   - NavHost setup
   - Screen routes
   - Navigation logic

4. **Test API Connection:**
   - Verify VPS is reachable
   - Test login endpoint
   - Test data loading

### Future Enhancements

- Profile editing
- Appointment booking calendar
- Patient intake forms
- Medical records viewing
- Real-time Socket.IO notifications
- Offline mode with Room
- Biometric authentication
- Dark theme toggle

---

## Deployment Checklist

### For Testing
- [x] Project structure complete
- [x] Dependencies configured
- [x] VPS connection configured
- [x] Manifest correct
- [x] Resources defined
- [ ] ViewModels implemented
- [ ] UI screens completed
- [ ] Navigation working
- [ ] API tested

### For Production
- [ ] Remove debug logs
- [ ] Enable ProGuard
- [ ] Generate release keystore
- [ ] Sign APK
- [ ] Test on multiple devices
- [ ] Update version code/name
- [ ] Create privacy policy
- [ ] Prepare Play Store listing

---

## Support

### Documentation
- **ANDROID_APP_SPECIFICATION.md** - Complete technical specs
- **FIGMA_DESIGN_SPECIFICATION.md** - UI/UX design system
- **IMPLEMENTATION_GUIDE.md** - Detailed implementation guide
- **README.md** - Project overview

### VPS Connection
```
Server: 72.60.78.188
Port: 3000
Protocol: HTTP
Socket.IO: ws://72.60.78.188:3000
```

### Issues
If you encounter issues:
1. Check logs: `adb logcat`
2. Verify VPS is running
3. Test API manually: `curl http://72.60.78.188:3000/api/health`
4. Clean and rebuild: `./gradlew clean build`

---

**Status:** ✅ Ready to Build
**Build Time:** ~2-5 minutes (first build)
**APK Size:** ~15-25 MB (debug)
**Min Android:** 7.0 (API 24)
**Target Android:** 14 (API 34)

---

**Last Updated:** 2025-11-20
**Version:** 1.0.0
**Build:** Debug
