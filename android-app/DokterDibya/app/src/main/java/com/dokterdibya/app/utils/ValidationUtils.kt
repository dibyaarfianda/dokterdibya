package com.dokterdibya.app.utils

import android.util.Patterns
import com.dokterdibya.app.utils.Constants.MIN_PASSWORD_LENGTH

object ValidationUtils {

    fun validateEmail(email: String): ValidationResult {
        return when {
            email.isBlank() -> ValidationResult.Invalid("Email wajib diisi")
            !Patterns.EMAIL_ADDRESS.matcher(email).matches() -> ValidationResult.Invalid("Format email tidak valid")
            else -> ValidationResult.Valid
        }
    }

    fun validatePassword(password: String): ValidationResult {
        return when {
            password.isBlank() -> ValidationResult.Invalid("Kata sandi wajib diisi")
            password.length < MIN_PASSWORD_LENGTH -> ValidationResult.Invalid("Kata sandi minimal $MIN_PASSWORD_LENGTH karakter")
            else -> ValidationResult.Valid
        }
    }

    fun validateConfirmPassword(password: String, confirmPassword: String): ValidationResult {
        return when {
            confirmPassword.isBlank() -> ValidationResult.Invalid("Konfirmasi kata sandi wajib diisi")
            password != confirmPassword -> ValidationResult.Invalid("Kata sandi tidak cocok")
            else -> ValidationResult.Valid
        }
    }

    fun validateName(name: String): ValidationResult {
        return when {
            name.isBlank() -> ValidationResult.Invalid("Nama wajib diisi")
            name.length < 3 -> ValidationResult.Invalid("Nama minimal 3 karakter")
            else -> ValidationResult.Valid
        }
    }

    fun validatePhone(phone: String): ValidationResult {
        return when {
            phone.isBlank() -> ValidationResult.Invalid("Nomor telepon wajib diisi")
            !phone.matches(Regex("^[0-9]{10,13}$")) -> ValidationResult.Invalid("Format nomor telepon tidak valid")
            else -> ValidationResult.Valid
        }
    }

    fun validateRequired(value: String, fieldName: String): ValidationResult {
        return when {
            value.isBlank() -> ValidationResult.Invalid("$fieldName wajib diisi")
            else -> ValidationResult.Valid
        }
    }
}

sealed class ValidationResult {
    object Valid : ValidationResult()
    data class Invalid(val message: String) : ValidationResult()

    val isValid: Boolean
        get() = this is Valid

    val errorMessage: String?
        get() = (this as? Invalid)?.message
}
