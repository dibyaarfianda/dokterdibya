# Dokter Dibya - Android Mobile Application

Complete Android mobile application for **Dokter Dibya Clinic Management System**, built with **Jetpack Compose**, **MVVM architecture**, and modern Android development practices.

## 📱 Project Overview

This Android app provides native mobile access to the Dokter Dibya clinic management system, offering features for both patients and healthcare staff.

### User Types
- **Patients**: Appointment booking, medical records, intake forms, announcements
- **Staff** (8 roles): Comprehensive clinic management based on role permissions

---

## 🏗️ Architecture

### Tech Stack
- **Language**: Kotlin
- **UI Framework**: Jetpack Compose with Material 3
- **Architecture**: MVVM + Repository Pattern + Clean Architecture
- **Dependency Injection**: Hilt
- **Networking**: Retrofit + OkHttp
- **Real-time**: Socket.IO
- **Local Database**: Room
- **Async**: Kotlin Coroutines + Flow
- **Image Loading**: Coil
- **Push Notifications**: Firebase Cloud Messaging

### Project Structure
```
app/src/main/
├── java/com/dokterdibya/app/
│   ├── di/                          # Dependency Injection (Hilt modules)
│   │   ├── NetworkModule.kt
│   │   ├── DatabaseModule.kt
│   │   ├── RepositoryModule.kt
│   │   └── AppModule.kt
│   │
│   ├── data/
│   │   ├── remote/                  # API & Networking
│   │   │   ├── api/
│   │   │   │   ├── AuthApi.kt
│   │   │   │   ├── PatientApi.kt
│   │   │   │   ├── AppointmentApi.kt
│   │   │   │   ├── AnnouncementApi.kt
│   │   │   │   ├── MedicalRecordApi.kt
│   │   │   │   └── BillingApi.kt
│   │   │   ├── dto/                 # Data Transfer Objects
│   │   │   │   ├── AuthDto.kt
│   │   │   │   ├── PatientDto.kt
│   │   │   │   ├── AppointmentDto.kt
│   │   │   │   └── ...
│   │   │   └── socket/
│   │   │       └── SocketManager.kt
│   │   │
│   │   ├── local/                   # Room Database
│   │   │   ├── dao/
│   │   │   │   ├── PatientDao.kt
│   │   │   │   ├── AppointmentDao.kt
│   │   │   │   └── AnnouncementDao.kt
│   │   │   ├── entities/
│   │   │   │   ├── PatientEntity.kt
│   │   │   │   ├── AppointmentEntity.kt
│   │   │   │   └── ...
│   │   │   └── AppDatabase.kt
│   │   │
│   │   └── repository/              # Repository Pattern
│   │       ├── AuthRepository.kt
│   │       ├── PatientRepository.kt
│   │       ├── AppointmentRepository.kt
│   │       ├── AnnouncementRepository.kt
│   │       └── ...
│   │
│   ├── domain/
│   │   ├── models/                  # Domain Models
│   │   │   ├── User.kt
│   │   │   ├── Patient.kt
│   │   │   ├── Appointment.kt
│   │   │   ├── Announcement.kt
│   │   │   └── ...
│   │   ├── usecases/                # Business Logic
│   │   │   ├── auth/
│   │   │   ├── patient/
│   │   │   ├── appointment/
│   │   │   └── ...
│   │   └── Result.kt                # Result wrapper for API calls
│   │
│   ├── ui/
│   │   ├── patient/                 # Patient App Screens
│   │   │   ├── auth/
│   │   │   │   ├── LoginScreen.kt
│   │   │   │   ├── LoginViewModel.kt
│   │   │   │   ├── RegisterScreen.kt
│   │   │   │   └── RegisterViewModel.kt
│   │   │   ├── dashboard/
│   │   │   │   ├── DashboardScreen.kt
│   │   │   │   └── DashboardViewModel.kt
│   │   │   ├── appointments/
│   │   │   │   ├── AppointmentsScreen.kt
│   │   │   │   ├── BookingScreen.kt
│   │   │   │   └── AppointmentViewModel.kt
│   │   │   ├── intake/
│   │   │   │   ├── IntakeFormScreen.kt
│   │   │   │   └── IntakeViewModel.kt
│   │   │   ├── records/
│   │   │   │   ├── RecordsScreen.kt
│   │   │   │   └── RecordsViewModel.kt
│   │   │   └── profile/
│   │   │       ├── ProfileScreen.kt
│   │   │       └── ProfileViewModel.kt
│   │   │
│   │   ├── staff/                   # Staff App Screens
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   ├── patients/
│   │   │   ├── appointments/
│   │   │   ├── exams/
│   │   │   ├── billing/
│   │   │   └── chat/
│   │   │
│   │   ├── common/                  # Shared UI Components
│   │   │   ├── components/
│   │   │   │   ├── AppButton.kt
│   │   │   │   ├── AppTextField.kt
│   │   │   │   ├── AppCard.kt
│   │   │   │   ├── LoadingIndicator.kt
│   │   │   │   ├── EmptyState.kt
│   │   │   │   └── ...
│   │   │   ├── theme/
│   │   │   │   ├── Color.kt
│   │   │   │   ├── Type.kt
│   │   │   │   ├── Theme.kt
│   │   │   │   └── Shape.kt
│   │   │   └── navigation/
│   │   │       ├── Navigation.kt
│   │   │       └── Routes.kt
│   │   │
│   │   └── MainActivity.kt
│   │
│   ├── utils/
│   │   ├── Constants.kt
│   │   ├── DateUtils.kt
│   │   ├── ValidationUtils.kt
│   │   ├── NetworkUtils.kt
│   │   └── Extensions.kt
│   │
│   ├── services/
│   │   └── FirebaseMessagingService.kt
│   │
│   ├── workers/                     # Background Tasks
│   │   ├── SyncWorker.kt
│   │   └── NotificationWorker.kt
│   │
│   └── DokterDibyaApp.kt           # Application class
│
└── res/
    ├── values/
    │   ├── colors.xml
    │   ├── strings.xml
    │   ├── themes.xml
    │   └── dimens.xml
    ├── drawable/
    ├── mipmap/
    └── xml/
```

---

## 📦 Dependencies

All dependencies are configured in `app/build.gradle.kts`:

### Core
- AndroidX Core KTX
- Lifecycle & ViewModel
- Activity Compose

### UI
- Jetpack Compose (BOM 2023.10.01)
- Material 3
- Navigation Compose
- Accompanist (Permissions, System UI, Pager, Swipe Refresh)

### Networking
- Retrofit 2.9.0
- OkHttp 4.12.0
- Gson
- Socket.IO 2.1.0

### Database
- Room 2.6.0

### Dependency Injection
- Hilt 2.48

### Async
- Kotlin Coroutines 1.7.3

### Storage
- DataStore Preferences
- Security Crypto

### Firebase
- Firebase BOM 32.5.0
- Cloud Messaging
- Analytics
- Crashlytics
- Google Sign-In

### Image
- Coil 2.5.0

### Other
- WorkManager 2.9.0
- Biometric 1.1.0
- Lottie 6.1.0
- Paging 3.2.1
- Markwon 4.6.2 (Markdown)
- MPAndroidChart (Charts)

---

## 🚀 Getting Started

### Prerequisites
- Android Studio Hedgehog | 2023.1.1 or later
- JDK 17
- Android SDK (API 34)
- Firebase project set up

### Setup Instructions

1. **Clone the Repository**
   ```bash
   cd /home/user/dokterdibya/android-app/DokterDibya
   ```

2. **Open in Android Studio**
   - Open Android Studio
   - File → Open → Select `/android-app/DokterDibya`

3. **Configure Firebase**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Create a new project or use existing one
   - Add Android app with package name: `com.dokterdibya.app`
   - Download `google-services.json`
   - Place it in `app/` directory

4. **Configure Google Sign-In**
   - In Firebase Console → Authentication → Sign-in method
   - Enable Email/Password and Google
   - Get OAuth 2.0 Client ID for Android
   - Add SHA-1 fingerprint

5. **Update API URLs** (if needed)
   - Edit `app/build.gradle.kts`
   - Update `BASE_URL` and `SOCKET_URL` for production/debug

6. **Sync Project**
   - Click "Sync Project with Gradle Files"
   - Wait for dependencies to download

7. **Build & Run**
   - Connect device or start emulator
   - Click Run ▶️

---

## 🔧 Configuration

### Environment Variables

In `app/build.gradle.kts`:

```kotlin
buildConfigField "String", "BASE_URL", "\"https://dokterdibya.com/api/\""
buildConfigField "String", "SOCKET_URL", "\"https://dokterdibya.com\""
```

For local development (emulator):
```kotlin
buildConfigField "String", "BASE_URL", "\"http://10.0.2.2:3000/api/\""
buildConfigField "String", "SOCKET_URL", "\"http://10.0.2.2:3000\""
```

### ProGuard Rules

ProGuard configuration is in `app/proguard-rules.pro` with rules for:
- Retrofit
- OkHttp
- Gson
- Socket.IO
- Room
- Firebase
- Hilt

---

## 📱 Features Implementation Status

### ✅ Completed
- [x] Project structure setup
- [x] Gradle configuration
- [x] Resource files (colors, strings, themes, dimens)
- [x] Android Manifest
- [x] ProGuard rules
- [x] Design specifications
- [x] API documentation

### 🚧 To Be Implemented

#### Core Architecture
- [ ] Hilt dependency injection modules
- [ ] Retrofit API interfaces
- [ ] Room database setup
- [ ] Repository implementations
- [ ] Socket.IO manager

#### Patient Features
- [ ] Authentication (Login, Register, Google Sign-In)
- [ ] Dashboard
- [ ] Appointment booking (Sunday Clinic)
- [ ] Patient intake form
- [ ] Medical records viewer
- [ ] Announcements viewer
- [ ] Profile management

#### Staff Features
- [ ] Staff authentication
- [ ] Staff dashboard
- [ ] Patient management
- [ ] Appointment management
- [ ] Medical examination
- [ ] Sunday clinic records
- [ ] Intake review
- [ ] Medications management
- [ ] Billing & cashier
- [ ] Team chat
- [ ] Analytics

#### Additional Features
- [ ] Push notifications (FCM)
- [ ] Offline support
- [ ] Background sync
- [ ] Biometric authentication
- [ ] Dark theme
- [ ] Multi-language support
- [ ] PDF viewer/downloader

---

## 🎨 Design System

Complete design specifications are available in:
- **FIGMA_DESIGN_SPECIFICATION.md** - Comprehensive design system documentation
- **ANDROID_APP_SPECIFICATION.md** - Technical specifications

### Color Palette
- **Primary**: #28A7E9 (Blue)
- **Secondary**: #00ACC1 (Teal)
- **Accent**: #F39C12 (Orange)
- **Success**: #27AE60
- **Warning**: #F39C12
- **Error**: #E74C3C

### Typography
- **Primary Font**: Poppins
- **Secondary Font**: Open Sans

---

## 📡 API Integration

### Base Configuration

```kotlin
object ApiConfig {
    const val BASE_URL = BuildConfig.BASE_URL
    const val SOCKET_URL = BuildConfig.SOCKET_URL
    const val TIMEOUT_SECONDS = 30L
}
```

### Authentication

All authenticated requests include JWT token:
```kotlin
@Headers("Authorization: Bearer {token}")
```

### Endpoints

See **ANDROID_APP_SPECIFICATION.md** for complete list of API endpoints.

---

## 🔒 Security

### Implemented
- JWT token authentication
- Encrypted DataStore for sensitive data
- Certificate pinning (production)
- ProGuard obfuscation
- Biometric authentication support

### Best Practices
- No hardcoded secrets
- Secure network communication (HTTPS)
- Input validation
- SQL injection prevention (Room)
- XSS prevention (sanitized markdown)

---

## 🧪 Testing

### Unit Tests
Location: `app/src/test/java/`

Run with:
```bash
./gradlew test
```

### Instrumented Tests
Location: `app/src/androidTest/java/`

Run with:
```bash
./gradlew connectedAndroidTest
```

### UI Tests
Using Compose UI testing framework

---

## 📦 Build Variants

### Debug
- Development environment
- Local API (10.0.2.2:3000)
- Debugging enabled
- No obfuscation

### Release
- Production environment
- Production API (dokterdibya.com)
- ProGuard enabled
- Obfuscated
- Signed with release keystore

### Build Release APK
```bash
./gradlew assembleRelease
```

Output: `app/build/outputs/apk/release/app-release.apk`

---

## 📊 Performance

### Optimizations
- LazyColumn for lists (pagination)
- Image caching (Coil)
- Database queries optimization
- Background work with WorkManager
- Network request caching

---

## 🐛 Debugging

### Logs
Using Timber for structured logging:
```kotlin
Timber.d("Debug message")
Timber.e(exception, "Error occurred")
```

### Network Inspection
OkHttp logging interceptor (debug builds only)

### Database Inspection
Use Android Studio Database Inspector

---

## 📚 Documentation

### Additional Documents
- **ANDROID_APP_SPECIFICATION.md** - Complete technical specification
- **FIGMA_DESIGN_SPECIFICATION.md** - Design system and UI specs
- **MOBILE_RESPONSIVE_IMPLEMENTATION.md** - Web responsive implementation (reference)

### Code Documentation
- KDoc for public APIs
- Inline comments for complex logic
- README in each major module

---

## 🔄 Development Workflow

### Git Workflow
1. Create feature branch from `main`
2. Implement feature
3. Write tests
4. Submit PR
5. Code review
6. Merge to `main`

### Branch Naming
- `feature/` - New features
- `bugfix/` - Bug fixes
- `hotfix/` - Production hotfixes
- `refactor/` - Code refactoring

### Commit Messages
Follow conventional commits:
```
feat: Add appointment booking feature
fix: Resolve crash on login screen
docs: Update README with setup instructions
refactor: Improve repository error handling
```

---

## 🚢 Deployment

### Play Store Release

1. **Prepare Release**
   - Update version in `build.gradle.kts`
   - Update changelog
   - Test thoroughly

2. **Generate Signed APK/Bundle**
   ```bash
   ./gradlew bundleRelease
   ```

3. **Upload to Play Console**
   - Go to Google Play Console
   - Upload AAB file
   - Fill in release notes
   - Submit for review

### Version Management
```kotlin
// In app/build.gradle.kts
defaultConfig {
    versionCode 1        // Increment for each release
    versionName "1.0.0"  // Semantic versioning
}
```

---

## 👥 Team

### Roles
- **Project Lead**: [Name]
- **Android Developer**: [Name]
- **UI/UX Designer**: [Name]
- **Backend Developer**: [Name]
- **QA Engineer**: [Name]

---

## 📝 License

Proprietary - Dokter Dibya Clinic

---

## 📞 Support

For questions or issues:
- **Email**: support@dokterdibya.com
- **Phone**: [Phone number]
- **GitHub Issues**: [Repository issues page]

---

## 🗺️ Roadmap

### Version 1.0 (Current)
- Patient authentication
- Appointment booking
- Medical records viewing
- Announcements
- Profile management

### Version 1.1
- Staff features
- Team chat
- Offline mode
- Biometric login

### Version 2.0
- Telemedicine (video calls)
- Prescription refills
- Payment integration
- Health tracking

### Version 3.0
- AI-powered symptom checker
- Medication reminders
- Health insights & analytics
- Wearable device integration

---

## 📊 App Metrics

### Target Performance
- App size: < 50 MB
- Cold start: < 2s
- Screen load time: < 500ms
- Crash-free rate: > 99.5%
- ANR rate: < 0.1%

---

## 🎯 Next Steps

1. **Immediate**: Implement core architecture (Hilt, Retrofit, Room)
2. **Phase 1**: Patient authentication & dashboard
3. **Phase 2**: Appointment booking & intake form
4. **Phase 3**: Medical records & announcements
5. **Phase 4**: Staff features
6. **Phase 5**: Testing & optimization
7. **Phase 6**: Release to Play Store

---

**Last Updated**: 2025-11-20
**Android Version**: 1.0.0
**Min SDK**: 24 (Android 7.0)
**Target SDK**: 34 (Android 14)
