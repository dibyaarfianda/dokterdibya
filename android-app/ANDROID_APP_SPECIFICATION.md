# Dokter Dibya - Android Mobile Application Specification

## Overview
Complete Android mobile application for **Dokter Dibya Clinic Management System**, an obstetrics and gynecology practice management platform. The app replicates all web functionality with native Android features.

## Target Users
1. **Patients** - Appointment booking, medical records, intake forms
2. **Staff** (8 roles) - Clinic management, patient care, billing

---

## Application Architecture

### Technical Stack
- **Language**: Kotlin
- **Architecture**: MVVM + Repository Pattern
- **UI Framework**: Jetpack Compose
- **Networking**: Retrofit + OkHttp
- **Real-time**: Socket.IO Android Client
- **Local Storage**: Room Database
- **Dependency Injection**: Hilt
- **Async**: Kotlin Coroutines + Flow
- **Image Loading**: Coil
- **Push Notifications**: Firebase Cloud Messaging
- **Authentication**: JWT + Google Sign-In

### Project Structure
```
com.dokterdibya.app/
├── di/                          # Dependency Injection
│   ├── NetworkModule.kt
│   ├── DatabaseModule.kt
│   └── RepositoryModule.kt
├── data/
│   ├── remote/
│   │   ├── api/
│   │   │   ├── AuthApi.kt
│   │   │   ├── PatientApi.kt
│   │   │   ├── AppointmentApi.kt
│   │   │   ├── AnnouncementApi.kt
│   │   │   ├── MedicalRecordApi.kt
│   │   │   └── BillingApi.kt
│   │   ├── socket/
│   │   │   └── SocketManager.kt
│   │   └── dto/                # Data Transfer Objects
│   ├── local/
│   │   ├── dao/
│   │   │   ├── PatientDao.kt
│   │   │   ├── AppointmentDao.kt
│   │   │   └── AnnouncementDao.kt
│   │   ├── entities/
│   │   └── AppDatabase.kt
│   └── repository/
│       ├── AuthRepository.kt
│       ├── PatientRepository.kt
│       ├── AppointmentRepository.kt
│       └── ...
├── domain/
│   ├── models/                 # Domain models
│   ├── usecases/               # Business logic
│   └── Result.kt               # Result wrapper
├── ui/
│   ├── patient/
│   │   ├── auth/
│   │   │   ├── LoginScreen.kt
│   │   │   ├── RegisterScreen.kt
│   │   │   └── LoginViewModel.kt
│   │   ├── dashboard/
│   │   │   ├── DashboardScreen.kt
│   │   │   └── DashboardViewModel.kt
│   │   ├── appointments/
│   │   ├── intake/
│   │   ├── records/
│   │   └── profile/
│   ├── staff/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── patients/
│   │   ├── appointments/
│   │   ├── exams/
│   │   ├── billing/
│   │   └── chat/
│   ├── common/
│   │   ├── components/         # Reusable UI components
│   │   └── theme/
│   └── MainActivity.kt
├── utils/
│   ├── Constants.kt
│   ├── DateUtils.kt
│   ├── ValidationUtils.kt
│   └── Extensions.kt
└── workers/                    # Background tasks
    ├── SyncWorker.kt
    └── NotificationWorker.kt
```

---

## API Configuration

### Base URLs
```kotlin
object ApiConfig {
    const val BASE_URL_PROD = "https://dokterdibya.com/api"
    const val BASE_URL_DEV = "http://localhost:3000/api"
    const val SOCKET_URL_PROD = "https://dokterdibya.com"
    const val SOCKET_URL_DEV = "http://localhost:3000"
}
```

### Authentication
```kotlin
// Add JWT token to all requests
@Headers("Authorization: Bearer {token}")

// Token storage
- Store in DataStore (encrypted)
- Auto-refresh on 401
- Clear on logout
```

---

## Feature Specifications

### 1. PATIENT APP FEATURES

#### 1.1 Authentication & Onboarding

**Screens:**
- Splash Screen
- Welcome/Intro Screen
- Login Screen
- Register Screen
- Email Verification Screen
- Forgot Password Screen
- Complete Profile Screen

**API Endpoints:**
```kotlin
POST   /patients/register
POST   /patients/login
POST   /patients/auth/google
POST   /patients/verify-email
POST   /patients/resend-verification
POST   /patients/forgot-password
GET    /patients/profile
PUT    /patients/profile
POST   /patients/complete-profile
POST   /patients/set-password
POST   /patients/change-password
```

**Features:**
- Email/password authentication
- Google Sign-In integration
- 6-digit email verification code
- Password strength validation
- Biometric login (fingerprint/face)
- Remember me functionality
- Auto-login with saved credentials

#### 1.2 Patient Dashboard

**Components:**
- Welcome header with profile picture
- Upcoming appointments card
- Recent announcements (3 max)
- Quick actions (Book Appointment, View Records, Intake Form)
- Medical record summary
- Unread notifications badge

**Real-time Features:**
- New announcements appear instantly (Socket.IO)
- Appointment status updates
- FCM push notifications

#### 1.3 Appointment Booking (Sunday Clinic)

**Flow:**
1. Select date (upcoming Sundays only)
2. Choose session (Morning/Afternoon/Evening)
3. Pick time slot (10 slots per session, 15 min each)
4. Add notes (optional)
5. Confirm booking
6. Receive confirmation

**API Endpoints:**
```kotlin
GET    /sunday-appointments/sundays
GET    /sunday-appointments/available
POST   /sunday-appointments/book
GET    /sunday-appointments/my-appointments
PATCH  /sunday-appointments/:id/cancel
```

**UI Elements:**
- Calendar view (only Sundays enabled)
- Session chips (Morning/Afternoon/Evening)
- Time slot grid (show available/booked)
- Booking confirmation dialog
- WhatsApp reminder toggle

**Appointment List:**
- Filter: Upcoming, Past, Cancelled
- Status badges: Scheduled, Confirmed, Completed, Cancelled
- Swipe to cancel (with confirmation)
- Pull to refresh

#### 1.4 Patient Intake Form

**Sections:**
1. **Personal Information**
   - Full name, birth date, NIK
   - Phone, WhatsApp
   - Emergency contact

2. **Medical History**
   - Pregnancy status (routing logic)
   - Reproductive health questions
   - Gynecological issues
   - Previous surgeries
   - Allergies
   - Current medications

3. **Current Symptoms**
   - Chief complaint
   - Duration
   - Severity scale
   - Associated symptoms

4. **Digital Signature**
   - Canvas for signature
   - Clear/redo functionality
   - Required before submission

5. **Photo/Document Upload**
   - Camera capture
   - Gallery selection
   - Multiple file support
   - Preview before upload

**Smart Routing:**
```kotlin
fun determineCategory(data: IntakeData): String {
    return when {
        data.isPregnant -> "Obstetrics"
        data.hasReproductiveIssues -> "Gynecology (Reproductive)"
        data.hasGynecologicalIssues -> "Gynecology (Special)"
        else -> "Admin Follow-up"
    }
}
```

**API Endpoints:**
```kotlin
POST   /patient-intake/submit
GET    /patient-intake/status/:submissionId
```

**Features:**
- Form validation
- Auto-save draft (local storage)
- Progress indicator
- Offline support (queue submission)
- High-risk flagging
- Submission tracking with quick ID

#### 1.5 Medical Records

**Tabs:**
- Visit History
- Medical Exams (Anamnesa, Physical, USG, Lab)
- Prescriptions
- Billing/Invoices

**Visit History:**
- Timeline view
- Date, examiner, services
- Expand for details
- Download PDF invoice

**Medical Exams:**
- Filter by type (Anamnesa, Physical, USG, Lab)
- Detailed exam results
- Images (USG scans)
- Lab values with reference ranges

**Prescriptions:**
- Medication name, dosage
- Instructions
- Duration

**Billing:**
- Invoice list
- Payment status (Paid, Unpaid, Partial)
- Download invoice PDF
- Payment history

**API Endpoints:**
```kotlin
GET    /visits?patient_id={id}
GET    /medical-exams?patient_id={id}
GET    /billings/patient/:id
GET    /visit-invoices/:id/print
```

#### 1.6 Announcements

**View:**
- Card layout with images
- Priority badge (Urgent, Important, Normal)
- Color-coded left border
- Markdown rendering
- Expand to read full content

**Priority Colors:**
- Urgent: Red (#e74c3c)
- Important: Orange (#f39c12)
- Normal: Blue (#28a7e9)

**Real-time:**
- Socket.IO listener for new announcements
- Push notification for urgent announcements
- In-app notification banner

**API Endpoints:**
```kotlin
GET    /announcements/active
```

#### 1.7 Profile & Settings

**Profile Sections:**
- Profile picture upload
- Personal info (name, email, phone, birth date)
- Password management
- Email verification status
- Linked accounts (Google)

**Settings:**
- Notification preferences
- Language (Indonesian/English)
- Theme (Light/Dark/System)
- Biometric login toggle
- Clear cache
- Logout

**API Endpoints:**
```kotlin
GET    /patients/profile
PUT    /patients/profile
POST   /patients/change-password
POST   /patients/update-birthdate
```

---

### 2. STAFF APP FEATURES

#### 2.1 Staff Authentication

**Screens:**
- Staff Login Screen (email/password only, no Google)
- Forgot Password
- Change Password
- Profile Settings

**API Endpoints:**
```kotlin
POST   /auth/login
GET    /auth/me
PUT    /auth/profile
POST   /auth/change-password
POST   /auth/forgot-password
POST   /auth/reset-password
```

**Role-based Access:**
```kotlin
enum class StaffRole {
    SUPERADMIN,     // Full access
    ADMIN,          // Most features
    DOCTOR,         // Clinical features
    NURSE,          // Limited clinical
    RECEPTIONIST,   // Appointments + registration
    PHARMACIST,     // Medications
    CASHIER,        // Billing
    VIEWER          // Read-only
}
```

#### 2.2 Staff Dashboard

**Widgets:**
- Today's appointments count
- Pending intake reviews
- Unpaid bills count
- Online staff members
- Quick actions (role-based)

**Quick Actions by Role:**
- **Doctor**: New Exam, View Patients, Intake Review
- **Receptionist**: Book Appointment, Register Patient
- **Pharmacist**: Check Inventory, Low Stock Alert
- **Cashier**: Pending Payments, Create Invoice

**API Endpoints:**
```kotlin
GET    /dashboard-stats
```

#### 2.3 Patient Management

**Features:**
- Search (name, phone, MR ID)
- Filter (active, inactive)
- Sort (recent, name)
- Patient list (paginated)
- Patient details
- Create/Edit patient
- View medical history
- Delete patient (cascade warning)

**Patient Details Tabs:**
- Personal Info
- Visit History
- Appointments
- Medical Exams
- Billing
- Intake Submissions

**API Endpoints:**
```kotlin
GET    /patients?search={query}&page={n}&limit={m}
POST   /patients
GET    /patients/:id
PUT    /patients/:id
DELETE /patients/:id
PATCH  /patients/:id/status
```

#### 2.4 Appointment Management

**Views:**
- Calendar view (month/week/day)
- List view (filtered)
- Appointment details

**Create Appointment:**
1. Select patient (search)
2. Choose date/time
3. Select type (Consultation, Control, etc.)
4. Set location (Clinic, Hospital)
5. Add notes
6. Set WhatsApp reminder

**Manage Appointment:**
- Mark as Confirmed
- Mark as Completed
- Mark as No-Show
- Cancel (with reason)
- Reschedule

**API Endpoints:**
```kotlin
GET    /appointments?date={date}&status={status}
POST   /appointments
GET    /appointments/:id
PUT    /appointments/:id
DELETE /appointments/:id
GET    /appointment-archive
```

#### 2.5 Medical Examination (Doctors/Nurses)

**Exam Types:**
1. **Anamnesa** (Patient History)
   - Chief complaint
   - History of present illness
   - Past medical history
   - Family history
   - Social history

2. **Physical Examination**
   - Vital signs (BP, pulse, temp, weight, height)
   - General appearance
   - System examination

3. **USG (Ultrasound)**
   - Image upload
   - Findings
   - Interpretation
   - Gestational age (if pregnant)

4. **Lab Results**
   - Test name
   - Result value
   - Reference range
   - Interpretation

**API Endpoints:**
```kotlin
GET    /medical-exams?patient_id={id}&type={type}
POST   /medical-exams
GET    /medical-exams/:id
PUT    /medical-exams/:id
DELETE /medical-exams/:id
GET    /medical-exams/patient/:id/latest/:type
```

**Features:**
- Voice-to-text for notes
- Image capture for USG
- Auto-save drafts
- Template selection
- Previous exam reference

#### 2.6 Sunday Clinic Records

**Flow:**
1. Create MR (auto-generate MR ID: mr0001, mr0002...)
2. Link to appointment
3. Fill sections:
   - Identitas (Identity)
   - Anamnesa
   - Pemeriksaan Fisik (Physical)
   - USG
   - Lab
   - Resep (Prescription)
   - Billing

4. Finalize record
5. Print/export

**API Endpoints:**
```kotlin
POST   /sunday-clinic/create
GET    /sunday-clinic/:mrId
PUT    /sunday-clinic/:mrId/:section
```

**Real-time Collaboration:**
- Socket.IO for live updates
- Show who's editing which section
- Prevent concurrent edits
- Activity indicators

#### 2.7 Patient Intake Review

**List View:**
- Pending submissions
- High-risk flag (red indicator)
- Submission date
- Patient name
- Quick ID
- Category

**Review Screen:**
- Full submission details
- High-risk factors highlighted
- Review notes field
- Actions:
  - Approve → Integrate into patient record
  - Reject → Send notification
  - Archive

**API Endpoints:**
```kotlin
GET    /patient-intake/submissions?status={status}
GET    /patient-intake/submissions/:id
PATCH  /patient-intake/submissions/:id/status
POST   /patient-intake/integrate/:id
```

#### 2.8 Medications Management (Pharmacist)

**Features:**
- Medication list (search, filter)
- Add/Edit medication
- Stock tracking
- Low stock alerts
- Category management
- Price management

**API Endpoints:**
```kotlin
GET    /obat?search={query}&category={cat}
POST   /obat
PUT    /obat/:id
DELETE /obat/:id
```

**Fields:**
- Nama Obat (Medicine name)
- Kategori (Category)
- Stok (Stock quantity)
- Satuan (Unit: tablet, botol, ampul)
- Harga (Price)
- Keterangan (Notes)
- Status (Active/Inactive)

#### 2.9 Procedures Management (Admin)

**Features:**
- Procedure/service list
- Add/Edit procedure
- Category management
- Price management
- Duration tracking

**API Endpoints:**
```kotlin
GET    /tindakan
POST   /tindakan
PUT    /tindakan/:id
DELETE /tindakan/:id
```

**Fields:**
- Nama Tindakan (Procedure name)
- Kategori (Category)
- Harga (Price)
- Durasi (Duration in minutes)
- Keterangan (Notes)

#### 2.10 Billing & Cashier

**Create Invoice:**
1. Select patient
2. Link to visit/submission
3. Add billing items:
   - Services (from procedures)
   - Medications
   - Consultations
   - Lab tests
4. Apply discount
5. Calculate tax
6. Generate invoice number (INV-YYYYMMDD-XXXX)

**Process Payment:**
- Select payment method
- Enter amount paid
- Auto-calculate change
- Generate receipt
- Print/email invoice

**Invoice List:**
- Filter: Unpaid, Partial, Paid, Cancelled
- Search by patient/invoice number
- Date range filter
- Total revenue display

**API Endpoints:**
```kotlin
GET    /billings?status={status}&patient_id={id}
POST   /billings
GET    /billings/:id
PUT    /billings/:id
DELETE /billings/:id
POST   /billings/:id/payment
```

#### 2.11 Real-time Team Chat

**Features:**
- Staff-only messaging
- Online status indicators
- Message history
- Typing indicators
- Unread count badges
- Push notifications for messages

**API Endpoints:**
```kotlin
GET    /chat/messages?limit={n}&offset={m}
POST   /chat/send
```

**Socket.IO Events:**
```kotlin
socket.on("message:new") { data ->
    // Display new message
}
socket.on("user:typing") { data ->
    // Show typing indicator
}
socket.on("users:online") { data ->
    // Update online status
}
```

#### 2.12 Announcements Management

**Create/Edit Announcement:**
- Title (required)
- Message (required)
- Image URL (optional)
- Content Type: Plain Text / Markdown
- Priority: Normal / Important / Urgent
- Status: Active / Inactive
- Live preview (markdown rendering)

**Announcement List:**
- Filter by priority, status
- Edit/Delete
- Real-time preview

**API Endpoints:**
```kotlin
GET    /announcements
POST   /announcements
GET    /announcements/:id
PUT    /announcements/:id
DELETE /announcements/:id
```

**Socket.IO Broadcast:**
```kotlin
socket.emit("announcement:new", announcementData)
```

#### 2.13 Analytics & Reports (Admin/Superadmin)

**Charts:**
- Revenue trend (line chart)
- Appointments by status (pie chart)
- Patient growth (bar chart)
- Top procedures (horizontal bar)
- Payment methods breakdown

**Reports:**
- Daily/Weekly/Monthly summaries
- Export to PDF/Excel
- Date range selection
- Filter by category

**API Endpoints:**
```kotlin
GET    /analytics/revenue?start={date}&end={date}
GET    /analytics/patients
GET    /analytics/appointments
GET    /analytics/export?format={pdf|excel}
```

#### 2.14 Practice Schedules

**Features:**
- Day-wise schedule
- Time slots
- Location
- Active/Inactive toggle

**API Endpoints:**
```kotlin
GET    /practice-schedules
POST   /practice-schedules
PUT    /practice-schedules/:id
DELETE /practice-schedules/:id
```

#### 2.15 System Settings (Superadmin)

**Sections:**
- Email Settings (SMTP config)
- Role Management
- User Management
- System Logs
- Notification Settings
- Backup/Restore

**API Endpoints:**
```kotlin
GET    /email-settings
PUT    /email-settings
GET    /roles
POST   /roles
PUT    /roles/:id
DELETE /roles/:id
GET    /logs
```

---

## Real-time Features (Socket.IO)

### Patient App Events
```kotlin
// Listen for new announcements
socket.on("announcement:new") { data ->
    showAnnouncementNotification(data)
}

// Listen for appointment updates
socket.on("appointment:status_changed") { data ->
    refreshAppointments()
}
```

### Staff App Events
```kotlin
// User presence
socket.emit("user:register", userData)
socket.on("users:list", usersList)

// Medical record collaboration
socket.emit("patient:select", patientId)
socket.on("anamnesa:updated", data)
socket.on("physical:updated", data)
socket.on("usg:updated", data)

// Team chat
socket.emit("message:send", messageData)
socket.on("message:new", newMessage)
socket.on("user:typing", typingUser)

// Announcements
socket.on("announcement:new", announcement)

// Notifications
socket.on("notification:new", notification)
```

---

## Push Notifications (Firebase Cloud Messaging)

### Notification Types

**Patient:**
- Appointment reminder (1 hour before)
- Appointment status changed
- New announcement (urgent only)
- Intake form status update
- New billing/invoice

**Staff:**
- New appointment booked
- New intake submission
- High-risk intake flagged
- Payment received
- Team chat message
- New announcement
- Low stock alert (pharmacist)

### Implementation
```kotlin
class FirebaseMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        // Handle notification
        val type = message.data["type"]
        when (type) {
            "appointment" -> showAppointmentNotification()
            "announcement" -> showAnnouncementNotification()
            "chat" -> showChatNotification()
            "billing" -> showBillingNotification()
        }
    }
}
```

---

## Offline Support

### Cached Data
- User profile
- Recent appointments (last 30 days)
- Recent announcements (last 10)
- Medical record summary
- Intake form drafts

### Sync Strategy
```kotlin
class SyncWorker : CoroutineWorker() {
    override suspend fun doWork(): Result {
        // Sync when online
        syncPendingIntakeForms()
        syncAppointments()
        syncAnnouncements()
        return Result.success()
    }
}
```

### Queue for Offline Actions
- Appointment bookings
- Intake form submissions
- Profile updates
- Message sends

---

## Security Features

### 1. JWT Authentication
```kotlin
@Headers("Authorization: Bearer {token}")
```

### 2. Encrypted Storage
```kotlin
// DataStore with encryption
val encryptedDataStore = EncryptedDataStore(context)
```

### 3. Biometric Authentication
```kotlin
val biometricPrompt = BiometricPrompt(
    activity,
    executor,
    object : BiometricPrompt.AuthenticationCallback() {
        override fun onAuthenticationSucceeded(result: AuthenticationResult) {
            // Auto-login
        }
    }
)
```

### 4. Certificate Pinning
```kotlin
val okHttpClient = OkHttpClient.Builder()
    .certificatePinner(
        CertificatePinner.Builder()
            .add("dokterdibya.com", "sha256/...")
            .build()
    )
    .build()
```

### 5. ProGuard/R8 Obfuscation
```gradle
buildTypes {
    release {
        minifyEnabled true
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt')
    }
}
```

---

## Performance Optimizations

### 1. Pagination
```kotlin
@Query("SELECT * FROM patients LIMIT :limit OFFSET :offset")
suspend fun getPatients(limit: Int, offset: Int): List<Patient>
```

### 2. Image Optimization
```kotlin
Coil.load(imageUrl) {
    crossfade(true)
    transformations(CircleCropTransformation())
    placeholder(R.drawable.placeholder)
    error(R.drawable.error)
    size(300, 300) // Resize
}
```

### 3. Lazy Loading
```kotlin
LazyColumn {
    items(patients, key = { it.id }) { patient ->
        PatientItem(patient)
    }
}
```

### 4. Caching
```kotlin
@GET("announcements/active")
suspend fun getActiveAnnouncements(): Response<List<Announcement>>

// Cache for 5 minutes
val cacheControl = CacheControl.Builder()
    .maxAge(5, TimeUnit.MINUTES)
    .build()
```

---

## Testing Strategy

### 1. Unit Tests
- ViewModels
- Repositories
- Use Cases
- Utils

### 2. Integration Tests
- API calls with MockWebServer
- Database operations
- ViewModel + Repository

### 3. UI Tests
- Compose UI testing
- Navigation flows
- User interactions

### 4. End-to-End Tests
- Login → Dashboard → Book Appointment
- Intake form submission
- Medical record viewing

---

## Build Configuration

### build.gradle (app)
```gradle
android {
    compileSdk 34
    defaultConfig {
        applicationId "com.dokterdibya.app"
        minSdk 24
        targetSdk 34
        versionCode 1
        versionName "1.0.0"
    }

    buildFeatures {
        compose true
    }

    composeOptions {
        kotlinCompilerExtensionVersion "1.5.3"
    }
}

dependencies {
    // Jetpack Compose
    implementation "androidx.compose.ui:ui:1.5.4"
    implementation "androidx.compose.material3:material3:1.1.2"
    implementation "androidx.compose.ui:ui-tooling-preview:1.5.4"

    // Networking
    implementation "com.squareup.retrofit2:retrofit:2.9.0"
    implementation "com.squareup.retrofit2:converter-gson:2.9.0"
    implementation "com.squareup.okhttp3:logging-interceptor:4.11.0"

    // Socket.IO
    implementation "io.socket:socket.io-client:2.1.0"

    // Room
    implementation "androidx.room:room-runtime:2.6.0"
    kapt "androidx.room:room-compiler:2.6.0"
    implementation "androidx.room:room-ktx:2.6.0"

    // Hilt
    implementation "com.google.dagger:hilt-android:2.48"
    kapt "com.google.dagger:hilt-compiler:2.48"

    // Coroutines
    implementation "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3"

    // Image Loading
    implementation "io.coil-kt:coil-compose:2.5.0"

    // Firebase
    implementation platform("com.google.firebase:firebase-bom:32.5.0")
    implementation "com.google.firebase:firebase-messaging"
    implementation "com.google.android.gms:play-services-auth:20.7.0"

    // DataStore
    implementation "androidx.datastore:datastore-preferences:1.0.0"

    // WorkManager
    implementation "androidx.work:work-runtime-ktx:2.9.0"

    // Navigation
    implementation "androidx.navigation:navigation-compose:2.7.5"

    // Accompanist
    implementation "com.google.accompanist:accompanist-permissions:0.32.0"
    implementation "com.google.accompanist:accompanist-systemuicontroller:0.32.0"
}
```

---

## Deployment Checklist

- [ ] Configure production API URLs
- [ ] Set up Firebase project
- [ ] Generate release keystore
- [ ] Enable ProGuard/R8
- [ ] Test on multiple devices (phones, tablets)
- [ ] Test offline functionality
- [ ] Test push notifications
- [ ] Prepare Play Store listing
- [ ] Create app screenshots
- [ ] Write privacy policy
- [ ] Set up crash reporting (Firebase Crashlytics)
- [ ] Configure analytics (Firebase Analytics)
- [ ] Implement app update prompts

---

## Next Steps

1. Create Figma designs
2. Set up Android project
3. Implement authentication
4. Build patient features
5. Build staff features
6. Integrate real-time features
7. Add offline support
8. Testing
9. Deployment

---

**Document Version:** 1.0
**Last Updated:** 2025-11-20
**Author:** Claude Code
