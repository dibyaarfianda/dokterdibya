package com.dokterdibya.patient.utils

import kotlinx.coroutines.flow.MutableStateFlow
import timber.log.Timber

/**
 * Extension functions to reduce code duplication in ViewModels when handling Results.
 * Provides consistent error handling and state updates across the app.
 */

/**
 * Handle Result with standard loading/success/error pattern.
 * Automatically logs errors via Timber.
 *
 * Usage:
 * ```
 * repository.getData().handleResult(
 *     onSuccess = { data -> _uiState.value = _uiState.value.copy(data = data, isLoading = false) },
 *     onError = { error -> _uiState.value = _uiState.value.copy(error = error, isLoading = false) }
 * )
 * ```
 */
inline fun <T> Result<T>.handleResult(
    onSuccess: (T) -> Unit,
    onError: (String) -> Unit
) {
    this.onSuccess { data ->
        onSuccess(data)
    }.onFailure { exception ->
        val errorMessage = exception.message ?: "Terjadi kesalahan"
        Timber.e(exception, "API Error: $errorMessage")
        onError(errorMessage)
    }
}

/**
 * Handle Result with a generic UI state that has isLoading, error, and data fields.
 * Reduces boilerplate for common ViewModel patterns.
 *
 * @param stateFlow The MutableStateFlow to update
 * @param copyState Lambda to copy state with new values
 */
inline fun <T, S> Result<T>.handleWithState(
    stateFlow: MutableStateFlow<S>,
    crossinline copyState: S.(isLoading: Boolean, data: T?, error: String?) -> S
) {
    this.onSuccess { data ->
        stateFlow.value = stateFlow.value.copyState(false, data, null)
    }.onFailure { exception ->
        val errorMessage = exception.message ?: "Terjadi kesalahan"
        Timber.e(exception, "API Error: $errorMessage")
        stateFlow.value = stateFlow.value.copyState(false, null, errorMessage)
    }
}

/**
 * Execute a suspending block and convert to Result, with automatic error logging.
 */
suspend inline fun <T> safeApiCall(
    tag: String = "API",
    crossinline block: suspend () -> T
): Result<T> {
    return try {
        Result.success(block())
    } catch (e: Exception) {
        Timber.e(e, "$tag call failed: ${e.message}")
        Result.failure(e)
    }
}

/**
 * Map error message to user-friendly Indonesian text.
 */
fun String?.toUserFriendlyError(): String {
    return when {
        this == null -> "Terjadi kesalahan"
        this.contains("timeout", ignoreCase = true) -> "Koneksi timeout, coba lagi"
        this.contains("unable to resolve host", ignoreCase = true) -> "Tidak ada koneksi internet"
        this.contains("connection", ignoreCase = true) -> "Gagal terhubung ke server"
        this.contains("401") -> "Sesi berakhir, silakan login ulang"
        this.contains("403") -> "Akses ditolak"
        this.contains("404") -> "Data tidak ditemukan"
        this.contains("500") -> "Server sedang bermasalah"
        else -> this
    }
}
