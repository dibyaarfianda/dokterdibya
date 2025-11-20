# Dokter Dibya Android App - Implementation Guide

## Current Status

### ✅ Completed
1. **Project Structure** - All build files, manifests, resources
2. **Data Layer** - Models, API interfaces, Repositories
3. **DI Layer** - Hilt modules for networking
4. **Theme** - Colors, Typography, Material 3 theme
5. **Socket.IO** - Connected to VPS at 72.60.78.188
6. **No Firebase** - Removed all Firebase dependencies

### 📋 Configuration Changes Made

**VPS Connection:**
- Base URL: `http://72.60.78.188:3000/api/`
- Socket URL: `http://72.60.78.188:3000`
- Cleartext traffic enabled for HTTP

**Removed:**
- Firebase dependencies
- Google Services
- FCM (Firebase Cloud Messaging)
- Firebase Analytics & Crashlytics

**Kept:**
- Socket.IO for real-time features
- All core Android dependencies
- Retrofit for REST API
- Hilt for DI

---

## Quick Build Instructions

### Option 1: Use Android Studio (Recommended)

1. **Open Project**
   ```
   File → Open → /home/user/dokterdibya/android-app/DokterDibya
   ```

2. **Replace build.gradle**
   - Replace `app/build.gradle.kts` with `app/build-simplified.gradle.kts`
   - Replace `AndroidManifest.xml` with `AndroidManifest-simplified.xml`

3. **Sync Project**
   - Click "Sync Project with Gradle Files"
   - Wait for dependencies to download

4. **Build APK**
   ```
   Build → Build Bundle(s) / APK(s) → Build APK(s)
   ```

5. **APK Location**
   ```
   app/build/outputs/apk/debug/app-debug.apk
   ```

### Option 2: Command Line Build

```bash
cd /home/user/dokterdibya/android-app/DokterDibya

# Replace files
cp app/build-simplified.gradle.kts app/build.gradle.kts
cp app/src/main/AndroidManifest-simplified.xml app/src/main/AndroidManifest.xml

# Build
./gradlew assembleDebug

# APK output
ls -lh app/build/outputs/apk/debug/app-debug.apk
```

---

## Remaining Implementation

To have a fully functional app, you need to create these files:

### 1. ViewModels (Priority: HIGH)

Create in `app/src/main/java/com/dokterdibya/app/ui/*/`

**AuthViewModel.kt**
```kotlin
@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _loginState = MutableStateFlow<Result<User>>(Result.Loading)
    val loginState: StateFlow<Result<User>> = _loginState

    fun login(email: String, password: String) {
        viewModelScope.launch {
            authRepository.login(email, password).collect {
                _loginState.value = it
            }
        }
    }

    fun register(email: String, password: String, fullName: String,
                 phoneNumber: String, birthDate: String) {
        viewModelScope.launch {
            authRepository.register(email, password, fullName, phoneNumber, birthDate).collect {
                _loginState.value = it
            }
        }
    }
}
```

**DashboardViewModel.kt**
```kotlin
@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val appointmentRepository: AppointmentRepository,
    private val announcementRepository: AnnouncementRepository
) : ViewModel() {

    private val _appointments = MutableStateFlow<Result<List<Appointment>>>(Result.Loading)
    val appointments: StateFlow<Result<List<Appointment>>> = _appointments

    private val _announcements = MutableStateFlow<Result<List<Announcement>>>(Result.Loading)
    val announcements: StateFlow<Result<List<Announcement>>> = _announcements

    init {
        loadData()
    }

    fun loadData() {
        viewModelScope.launch {
            launch {
                appointmentRepository.getMyAppointments().collect {
                    _appointments.value = it
                }
            }
            launch {
                announcementRepository.getActiveAnnouncements().collect {
                    _announcements.value = it
                }
            }
        }
    }
}
```

### 2. UI Screens (Priority: HIGH)

Create in `app/src/main/java/com/dokterdibya/app/ui/patient/`

**LoginScreen.kt** - Basic login form with email, password fields
**DashboardScreen.kt** - Show appointments and announcements
**AppointmentsScreen.kt** - List of user's appointments
**AnnouncementsScreen.kt** - List of announcements
**ProfileScreen.kt** - User profile display

### 3. Navigation (Priority: HIGH)

**Navigation.kt**
```kotlin
sealed class Screen(val route: String) {
    object Login : Screen("login")
    object Dashboard : Screen("dashboard")
    object Appointments : Screen("appointments")
    object Announcements : Screen("announcements")
    object Profile : Screen("profile")
}

@Composable
fun AppNavigation(
    navController: NavHostController = rememberNavController(),
    startDestination: String
) {
    NavHost(navController = navController, startDestination = startDestination) {
        composable(Screen.Login.route) { LoginScreen(navController) }
        composable(Screen.Dashboard.route) { DashboardScreen(navController) }
        composable(Screen.Appointments.route) { AppointmentsScreen(navController) }
        composable(Screen.Announcements.route) { AnnouncementsScreen(navController) }
        composable(Screen.Profile.route) { ProfileScreen(navController) }
    }
}
```

### 4. MainActivity (Priority: HIGH)

**MainActivity.kt**
```kotlin
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private val preferencesManager: PreferencesManager by inject()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        installSplashScreen()

        setContent {
            DokterDibyaTheme {
                val authToken by preferencesManager.authToken.collectAsState(initial = null)
                val startDestination = if (authToken.isNullOrEmpty()) {
                    "login"
                } else {
                    "dashboard"
                }

                AppNavigation(startDestination = startDestination)
            }
        }
    }
}
```

### 5. Missing XML Resources

**res/xml/data_extraction_rules.xml**
```xml
<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
        <include domain="sharedpref" path="."/>
    </cloud-backup>
</data-extraction-rules>
```

**res/xml/backup_rules.xml**
```xml
<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
    <include domain="sharedpref" path="."/>
</full-backup-content>
```

**res/drawable/ic_notification.xml**
```xml
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24"
    android:tint="?attr/colorControlNormal">
    <path
        android:fillColor="@android:color/white"
        android:pathData="M12,22c1.1,0 2,-0.9 2,-2h-4c0,1.1 0.89,2 2,2zM18,16v-5c0,-3.07 -1.64,-5.64 -4.5,-6.32V4c0,-0.83 -0.67,-1.5 -1.5,-1.5s-1.5,0.67 -1.5,1.5v0.68C7.63,5.36 6,7.92 6,11v5l-2,2v1h16v-1l-2,-2z"/>
</vector>
```

---

## Minimal Working APK

To create a minimal working APK that compiles:

1. **Copy the simplified build file:**
```bash
cp app/build-simplified.gradle.kts app/build.gradle.kts
cp app/src/main/AndroidManifest-simplified.xml app/src/main/AndroidManifest.xml
```

2. **Create minimal MainActivity:**
```kotlin
package com.dokterdibya.app.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dokterdibya.app.ui.theme.DokterDibyaTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            DokterDibyaTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    WelcomeScreen()
                }
            }
        }
    }
}

@Composable
fun WelcomeScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "Dokter Dibya",
            style = MaterialTheme.typography.displayLarge,
            color = MaterialTheme.colorScheme.primary
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Klinik Obstetri & Ginekologi",
            style = MaterialTheme.typography.bodyLarge
        )
        Spacer(modifier = Modifier.height(32.dp))
        Text(
            text = "App is ready to build!",
            style = MaterialTheme.typography.titleMedium
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Connected to: 72.60.78.188",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.secondary
        )
    }
}
```

3. **Create missing XML files:**
```bash
mkdir -p app/src/main/res/xml
mkdir -p app/src/main/res/drawable
```

4. **Build:**
```bash
./gradlew assembleDebug
```

---

## Testing on VPS

### 1. Ensure Backend is Running
```bash
ssh root@72.60.78.188
cd /path/to/backend
pm2 status
# If not running:
pm2 start server.js
```

### 2. Test API Endpoints
```bash
curl http://72.60.78.188:3000/api/health
curl http://72.60.78.188:3000/api/announcements/active
```

### 3. Test Socket.IO
```bash
# Install socket.io-client globally
npm install -g socket.io-client

# Test connection
node -e "const io = require('socket.io-client'); const socket = io('http://72.60.78.188:3000'); socket.on('connect', () => console.log('Connected!')); socket.on('disconnect', () => console.log('Disconnected'));"
```

---

## Common Build Issues & Solutions

### Issue 1: "Cannot resolve symbol 'R'"
**Solution:** Sync Gradle files and Rebuild project

### Issue 2: "Manifest merger failed"
**Solution:** Use the simplified manifest file

### Issue 3: "Duplicate class found"
**Solution:** Check for conflicting dependencies in build.gradle

### Issue 4: "Failed to resolve: com.google.firebase"
**Solution:** Make sure you're using build-simplified.gradle.kts

### Issue 5: "Cleartext HTTP traffic not permitted"
**Solution:** Add `android:usesCleartextTraffic="true"` to manifest (already done)

---

## APK Installation

### Install on Device
```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

### Install on Emulator
- Drag and drop APK file onto emulator window
- Or use: `adb -e install app/build/outputs/apk/debug/app-debug.apk`

---

## Next Steps After Building APK

1. **Test API Connection**
   - Verify app can reach 72.60.78.188:3000
   - Check network logs in Logcat

2. **Implement Remaining Screens**
   - Login/Register
   - Dashboard
   - Appointments
   - Announcements

3. **Add Socket.IO Events**
   - Real-time announcement updates
   - Appointment status changes

4. **Production Release**
   - Generate release keystore
   - Build signed APK
   - Test on multiple devices

---

## File Checklist

### Must Have (For Build)
- [x] build.gradle.kts
- [x] AndroidManifest.xml
- [x] DokterDibyaApp.kt
- [x] MainActivity.kt
- [x] Theme files (Color, Type, Theme)
- [x] strings.xml
- [x] colors.xml
- [x] Data models
- [x] API interfaces
- [x] Repositories
- [x] Hilt modules

### Should Have (For Functionality)
- [ ] ViewModels
- [ ] UI Screens (Login, Dashboard, etc.)
- [ ] Navigation
- [ ] Socket.IO integration
- [ ] Error handling
- [ ] Loading states

### Nice to Have (For Polish)
- [ ] Animations
- [ ] Custom icons
- [ ] Splash screen
- [ ] Offline mode
- [ ] Biometric auth

---

**Current Status:** Ready to build minimal APK
**Est. Build Time:** 2-5 minutes (first build)
**Est. APK Size:** ~15-25 MB (debug)
**Next Priority:** Implement ViewModels and UI screens

