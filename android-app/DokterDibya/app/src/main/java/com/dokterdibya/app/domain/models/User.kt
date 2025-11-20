package com.dokterdibya.app.domain.models

data class User(
    val id: String,
    val email: String,
    val fullName: String,
    val phoneNumber: String? = null,
    val whatsappNumber: String? = null,
    val birthDate: String? = null,
    val profilePicture: String? = null,
    val userType: String, // "patient" or "staff"
    val role: String? = null, // for staff users
    val emailVerified: Boolean = false,
    val profileCompleted: Boolean = false
)

data class AuthResponse(
    val success: Boolean,
    val message: String,
    val data: AuthData?
)

data class AuthData(
    val token: String,
    val user: User
)

data class LoginRequest(
    val email: String,
    val password: String
)

data class RegisterRequest(
    val email: String,
    val password: String,
    val fullName: String,
    val phoneNumber: String,
    val birthDate: String
)

data class GoogleAuthRequest(
    val idToken: String
)
