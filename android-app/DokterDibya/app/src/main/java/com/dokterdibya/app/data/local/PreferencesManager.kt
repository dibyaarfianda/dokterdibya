package com.dokterdibya.app.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.dokterdibya.app.utils.Constants
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(
    name = Constants.PREFERENCES_NAME
)

@Singleton
class PreferencesManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val dataStore = context.dataStore

    companion object {
        val KEY_AUTH_TOKEN = stringPreferencesKey(Constants.KEY_AUTH_TOKEN)
        val KEY_USER_ID = stringPreferencesKey(Constants.KEY_USER_ID)
        val KEY_USER_TYPE = stringPreferencesKey(Constants.KEY_USER_TYPE)
        val KEY_USER_EMAIL = stringPreferencesKey(Constants.KEY_USER_EMAIL)
        val KEY_BIOMETRIC_ENABLED = booleanPreferencesKey(Constants.KEY_BIOMETRIC_ENABLED)
        val KEY_THEME_MODE = stringPreferencesKey(Constants.KEY_THEME_MODE)
    }

    // Auth Token
    val authToken: Flow<String?> = dataStore.data.map { it[KEY_AUTH_TOKEN] }

    suspend fun saveAuthToken(token: String) {
        dataStore.edit { it[KEY_AUTH_TOKEN] = token }
    }

    suspend fun clearAuthToken() {
        dataStore.edit { it.remove(KEY_AUTH_TOKEN) }
    }

    // User ID
    val userId: Flow<String?> = dataStore.data.map { it[KEY_USER_ID] }

    suspend fun saveUserId(userId: String) {
        dataStore.edit { it[KEY_USER_ID] = userId }
    }

    // User Type
    val userType: Flow<String?> = dataStore.data.map { it[KEY_USER_TYPE] }

    suspend fun saveUserType(userType: String) {
        dataStore.edit { it[KEY_USER_TYPE] = userType }
    }

    // User Email
    val userEmail: Flow<String?> = dataStore.data.map { it[KEY_USER_EMAIL] }

    suspend fun saveUserEmail(email: String) {
        dataStore.edit { it[KEY_USER_EMAIL] = email }
    }

    // Biometric
    val biometricEnabled: Flow<Boolean> = dataStore.data.map { it[KEY_BIOMETRIC_ENABLED] ?: false }

    suspend fun setBiometricEnabled(enabled: Boolean) {
        dataStore.edit { it[KEY_BIOMETRIC_ENABLED] = enabled }
    }

    // Theme
    val themeMode: Flow<String?> = dataStore.data.map { it[KEY_THEME_MODE] }

    suspend fun setThemeMode(mode: String) {
        dataStore.edit { it[KEY_THEME_MODE] = mode }
    }

    // Clear all
    suspend fun clearAll() {
        dataStore.edit { it.clear() }
    }

    // Save user session
    suspend fun saveUserSession(token: String, userId: String, userType: String, email: String) {
        dataStore.edit { prefs ->
            prefs[KEY_AUTH_TOKEN] = token
            prefs[KEY_USER_ID] = userId
            prefs[KEY_USER_TYPE] = userType
            prefs[KEY_USER_EMAIL] = email
        }
    }
}
