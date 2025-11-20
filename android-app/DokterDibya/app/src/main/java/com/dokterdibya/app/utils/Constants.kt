package com.dokterdibya.app.utils

object Constants {
    // API Configuration
    const val BASE_URL = "https://dokterdibya.com/api/"
    const val BASE_URL_DEBUG = "http://10.0.2.2:3000/api/"
    const val SOCKET_URL = "https://dokterdibya.com"
    const val SOCKET_URL_DEBUG = "http://10.0.2.2:3000"

    // Network
    const val CONNECT_TIMEOUT = 30L
    const val READ_TIMEOUT = 30L
    const val WRITE_TIMEOUT = 30L

    // Database
    const val DATABASE_NAME = "dokter_dibya_db"
    const val DATABASE_VERSION = 1

    // DataStore
    const val PREFERENCES_NAME = "dokter_dibya_preferences"
    const val KEY_AUTH_TOKEN = "auth_token"
    const val KEY_USER_ID = "user_id"
    const val KEY_USER_TYPE = "user_type"
    const val KEY_USER_EMAIL = "user_email"
    const val KEY_BIOMETRIC_ENABLED = "biometric_enabled"
    const val KEY_THEME_MODE = "theme_mode"
    const val KEY_LANGUAGE = "language"

    // User Types
    const val USER_TYPE_PATIENT = "patient"
    const val USER_TYPE_STAFF = "staff"

    // Session
    const val SESSION_TIMEOUT_MINUTES = 30L

    // Pagination
    const val PAGE_SIZE = 20
    const val INITIAL_LOAD_SIZE = 40

    // Cache
    const val CACHE_EXPIRY_MINUTES = 5L

    // Appointment Sessions
    const val SESSION_MORNING = 1
    const val SESSION_AFTERNOON = 2
    const val SESSION_EVENING = 3

    // Appointment Status
    const val STATUS_SCHEDULED = "scheduled"
    const val STATUS_CONFIRMED = "confirmed"
    const val STATUS_COMPLETED = "completed"
    const val STATUS_CANCELLED = "cancelled"
    const val STATUS_NO_SHOW = "no_show"

    // Priority
    const val PRIORITY_NORMAL = "normal"
    const val PRIORITY_IMPORTANT = "important"
    const val PRIORITY_URGENT = "urgent"

    // Payment Status
    const val PAYMENT_UNPAID = "unpaid"
    const val PAYMENT_PARTIAL = "partial"
    const val PAYMENT_PAID = "paid"

    // File Upload
    const val MAX_FILE_SIZE_MB = 10
    const val MAX_IMAGE_SIZE_MB = 5

    // Validation
    const val MIN_PASSWORD_LENGTH = 6
    const val MAX_PASSWORD_LENGTH = 50
    const val VERIFICATION_CODE_LENGTH = 6

    // Date Formats
    const val DATE_FORMAT_API = "yyyy-MM-dd"
    const val TIME_FORMAT_API = "HH:mm:ss"
    const val DATETIME_FORMAT_API = "yyyy-MM-dd HH:mm:ss"
    const val DATE_FORMAT_DISPLAY = "dd MMM yyyy"
    const val TIME_FORMAT_DISPLAY = "HH:mm"
    const val DATETIME_FORMAT_DISPLAY = "dd MMM yyyy, HH:mm"

    // Intent Extras
    const val EXTRA_PATIENT_ID = "patient_id"
    const val EXTRA_APPOINTMENT_ID = "appointment_id"
    const val EXTRA_ANNOUNCEMENT_ID = "announcement_id"

    // Request Codes
    const val REQUEST_CODE_CAMERA = 1001
    const val REQUEST_CODE_GALLERY = 1002
    const val REQUEST_CODE_DOCUMENT = 1003

    // Work Manager
    const val WORK_SYNC = "sync_work"
    const val WORK_NOTIFICATION = "notification_work"

    // Socket Events
    const val SOCKET_EVENT_ANNOUNCEMENT_NEW = "announcement:new"
    const val SOCKET_EVENT_APPOINTMENT_UPDATE = "appointment:status_changed"
    const val SOCKET_EVENT_MESSAGE_NEW = "message:new"
    const val SOCKET_EVENT_USER_TYPING = "user:typing"
    const val SOCKET_EVENT_USERS_ONLINE = "users:online"
}
