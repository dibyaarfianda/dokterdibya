package com.dokterdibya.patient.data.api

import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

/**
 * Sealed class hierarchy for network exceptions
 * Allows for differentiated error handling in the UI layer
 */
sealed class NetworkException(
    message: String,
    cause: Throwable? = null
) : Exception(message, cause) {

    /**
     * No internet connection
     */
    class NoConnection(
        message: String = "Tidak ada koneksi internet. Periksa koneksi Anda.",
        cause: Throwable? = null
    ) : NetworkException(message, cause)

    /**
     * Request timed out
     */
    class Timeout(
        message: String = "Koneksi timeout. Coba lagi.",
        cause: Throwable? = null
    ) : NetworkException(message, cause)

    /**
     * Server returned an error (5xx)
     */
    class ServerError(
        val code: Int,
        message: String = "Terjadi kesalahan pada server. Coba lagi nanti.",
        cause: Throwable? = null
    ) : NetworkException(message, cause)

    /**
     * Unauthorized - token expired or invalid (401)
     */
    class Unauthorized(
        message: String = "Sesi Anda telah berakhir. Silakan login kembali.",
        cause: Throwable? = null
    ) : NetworkException(message, cause)

    /**
     * Forbidden - access denied (403)
     */
    class Forbidden(
        message: String = "Akses ditolak.",
        cause: Throwable? = null
    ) : NetworkException(message, cause)

    /**
     * Resource not found (404)
     */
    class NotFound(
        message: String = "Data tidak ditemukan.",
        cause: Throwable? = null
    ) : NetworkException(message, cause)

    /**
     * Validation error (422)
     */
    class ValidationError(
        val errors: List<String>,
        message: String = "Data tidak valid."
    ) : NetworkException(message)

    /**
     * Unknown network error
     */
    class Unknown(
        message: String = "Terjadi kesalahan. Coba lagi.",
        cause: Throwable? = null
    ) : NetworkException(message, cause)

    companion object {
        /**
         * Convert a throwable to appropriate NetworkException
         */
        fun from(throwable: Throwable): NetworkException {
            return when (throwable) {
                is NetworkException -> throwable
                is SocketTimeoutException -> Timeout(cause = throwable)
                is UnknownHostException -> NoConnection(cause = throwable)
                is IOException -> {
                    // Check for common connection errors
                    val message = throwable.message?.lowercase() ?: ""
                    when {
                        message.contains("timeout") -> Timeout(cause = throwable)
                        message.contains("connection") -> NoConnection(cause = throwable)
                        else -> Unknown(cause = throwable)
                    }
                }
                else -> Unknown(
                    message = throwable.message ?: "Terjadi kesalahan",
                    cause = throwable
                )
            }
        }

        /**
         * Convert HTTP response code to appropriate NetworkException
         */
        fun fromHttpCode(code: Int, errorBody: String? = null): NetworkException {
            return when (code) {
                401 -> Unauthorized()
                403 -> Forbidden()
                404 -> NotFound()
                422 -> {
                    // Try to parse validation errors
                    val errors = parseValidationErrors(errorBody)
                    ValidationError(errors, errors.firstOrNull() ?: "Data tidak valid")
                }
                in 500..599 -> ServerError(code)
                else -> Unknown(message = "Error: $code")
            }
        }

        private fun parseValidationErrors(errorBody: String?): List<String> {
            if (errorBody.isNullOrEmpty()) return emptyList()
            return try {
                val json = org.json.JSONObject(errorBody)
                val errors = mutableListOf<String>()

                // Try "errors" array
                json.optJSONArray("errors")?.let { arr ->
                    for (i in 0 until arr.length()) {
                        errors.add(arr.getString(i))
                    }
                }

                // Try "message" field
                if (errors.isEmpty()) {
                    json.optString("message", null)?.let { errors.add(it) }
                }

                errors
            } catch (e: Exception) {
                emptyList()
            }
        }
    }
}

/**
 * Extension to check if an exception indicates user needs to re-login
 */
fun Throwable.requiresReLogin(): Boolean {
    return this is NetworkException.Unauthorized
}

/**
 * Extension to check if an exception is retryable
 */
fun Throwable.isRetryable(): Boolean {
    return when (this) {
        is NetworkException.Timeout,
        is NetworkException.NoConnection,
        is NetworkException.ServerError -> true
        else -> false
    }
}
