package com.dokterdibya.pharm.data.repository

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Global auth state manager to handle token expiration events.
 * When token expires, this emits an event that triggers navigation to login.
 */
@Singleton
class AuthState @Inject constructor() {

    private val _tokenExpired = MutableSharedFlow<String>(extraBufferCapacity = 1)
    val tokenExpired: SharedFlow<String> = _tokenExpired.asSharedFlow()

    fun notifyTokenExpired(message: String = "Sesi Anda telah berakhir. Silakan login kembali.") {
        android.util.Log.d("AuthState", "Token expired notification: $message")
        _tokenExpired.tryEmit(message)
    }
}
