package com.dokterdibya.patient.data.service

import android.content.Context
import android.util.Log
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.dokterdibya.patient.data.api.ApiService
import com.dokterdibya.patient.data.dataStore
import com.google.firebase.messaging.FirebaseMessaging
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FCMTokenManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiService: ApiService
) {
    companion object {
        private const val TAG = "FCMTokenManager"
        private val FCM_TOKEN_KEY = stringPreferencesKey("fcm_token")
        private val FCM_TOKEN_SENT_KEY = stringPreferencesKey("fcm_token_sent")
    }

    /**
     * Get current FCM token and register it with the backend
     */
    suspend fun registerToken() {
        try {
            val token = FirebaseMessaging.getInstance().token.await()
            Log.d(TAG, "FCM Token: $token")

            // Save token locally
            saveToken(token)

            // Always send token to server on app startup to ensure it's registered
            // This ensures token is re-sent even if there was a previous registration failure
            sendTokenToServer(token)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get FCM token", e)
        }
    }

    /**
     * Send FCM token to backend server
     */
    suspend fun sendTokenToServer(token: String) {
        try {
            Log.d(TAG, "Sending FCM token to server...")
            val response = apiService.registerFcmToken(mapOf("fcm_token" to token))

            if (response.isSuccessful) {
                Log.d(TAG, "FCM token registered successfully")
                // Mark token as sent
                context.dataStore.edit { prefs ->
                    prefs[FCM_TOKEN_SENT_KEY] = token
                }
            } else {
                Log.e(TAG, "Failed to register FCM token: ${response.code()}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error sending FCM token to server", e)
        }
    }

    /**
     * Clear FCM token (on logout)
     */
    suspend fun clearToken() {
        try {
            // Unregister from server
            val token = getSavedToken()
            if (token != null) {
                apiService.unregisterFcmToken(mapOf("fcm_token" to token))
            }

            // Clear local storage
            context.dataStore.edit { prefs ->
                prefs.remove(FCM_TOKEN_KEY)
                prefs.remove(FCM_TOKEN_SENT_KEY)
            }

            // Delete FCM token
            FirebaseMessaging.getInstance().deleteToken().await()
            Log.d(TAG, "FCM token cleared")
        } catch (e: Exception) {
            Log.e(TAG, "Error clearing FCM token", e)
        }
    }

    private suspend fun getSavedToken(): String? {
        return context.dataStore.data.first()[FCM_TOKEN_KEY]
    }

    private suspend fun saveToken(token: String) {
        context.dataStore.edit { prefs ->
            prefs[FCM_TOKEN_KEY] = token
        }
    }
}
