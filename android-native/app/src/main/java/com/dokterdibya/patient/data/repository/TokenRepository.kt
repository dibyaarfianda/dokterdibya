package com.dokterdibya.patient.data.repository

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "auth_prefs")

@Singleton
class TokenRepository @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private val TOKEN_KEY = stringPreferencesKey("jwt_token")
        private val USER_EMAIL_KEY = stringPreferencesKey("user_email")
        private val USER_NAME_KEY = stringPreferencesKey("user_name")
        private val REGISTRATION_CODE_KEY = stringPreferencesKey("registration_code")
    }

    // Cached token for synchronous access (used by AuthInterceptor)
    @Volatile
    private var cachedToken: String? = null

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    init {
        // Initialize cached token from DataStore
        scope.launch {
            context.dataStore.data.collect { preferences ->
                cachedToken = preferences[TOKEN_KEY]
            }
        }
    }

    /**
     * Get cached token synchronously (for use in OkHttp Interceptor)
     * This avoids runBlocking which can cause ANR
     */
    fun getCachedToken(): String? = cachedToken

    fun getToken(): Flow<String?> {
        return context.dataStore.data.map { preferences ->
            preferences[TOKEN_KEY]
        }
    }

    suspend fun saveToken(token: String) {
        cachedToken = token // Update cache immediately
        context.dataStore.edit { preferences ->
            preferences[TOKEN_KEY] = token
        }
    }

    suspend fun saveUserInfo(name: String, email: String) {
        context.dataStore.edit { preferences ->
            preferences[USER_NAME_KEY] = name
            preferences[USER_EMAIL_KEY] = email
        }
    }

    fun getUserName(): Flow<String?> {
        return context.dataStore.data.map { preferences ->
            preferences[USER_NAME_KEY]
        }
    }

    fun getUserEmail(): Flow<String?> {
        return context.dataStore.data.map { preferences ->
            preferences[USER_EMAIL_KEY]
        }
    }

    suspend fun clearAll() {
        cachedToken = null // Clear cache immediately
        context.dataStore.edit { preferences ->
            preferences.clear()
        }
    }

    fun isLoggedIn(): Flow<Boolean> {
        return context.dataStore.data.map { preferences ->
            preferences[TOKEN_KEY] != null
        }
    }

    // ==================== Registration Code ====================

    suspend fun saveRegistrationCode(code: String) {
        context.dataStore.edit { preferences ->
            preferences[REGISTRATION_CODE_KEY] = code
        }
    }

    fun getRegistrationCode(): Flow<String?> {
        return context.dataStore.data.map { preferences ->
            preferences[REGISTRATION_CODE_KEY]
        }
    }

    suspend fun clearRegistrationCode() {
        context.dataStore.edit { preferences ->
            preferences.remove(REGISTRATION_CODE_KEY)
        }
    }

    fun hasRegistrationCode(): Flow<Boolean> {
        return context.dataStore.data.map { preferences ->
            preferences[REGISTRATION_CODE_KEY] != null
        }
    }
}
