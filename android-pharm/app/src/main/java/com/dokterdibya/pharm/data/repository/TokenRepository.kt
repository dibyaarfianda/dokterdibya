package com.dokterdibya.pharm.data.repository

import android.content.Context
import androidx.datastore.core.DataStore
import android.util.Base64
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "pharm_auth_prefs")

@Singleton
class TokenRepository @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private val TOKEN_KEY = stringPreferencesKey("jwt_token")
        private val USER_NAME_KEY = stringPreferencesKey("user_name")
        private val USER_EMAIL_KEY = stringPreferencesKey("user_email")
        private val USER_ROLE_KEY = stringPreferencesKey("user_role")
    }

    fun getToken(): Flow<String?> {
        return context.dataStore.data.map { preferences ->
            preferences[TOKEN_KEY]
        }
    }

    suspend fun saveToken(token: String) {
        android.util.Log.d("TokenRepository", "saveToken called: ${token.take(20)}...")
        context.dataStore.edit { preferences ->
            preferences[TOKEN_KEY] = token
            android.util.Log.d("TokenRepository", "Token saved to DataStore")
        }
    }

    suspend fun saveUserInfo(name: String, email: String, role: String) {
        context.dataStore.edit { preferences ->
            preferences[USER_NAME_KEY] = name
            preferences[USER_EMAIL_KEY] = email
            preferences[USER_ROLE_KEY] = role
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

    fun getUserRole(): Flow<String?> {
        return context.dataStore.data.map { preferences ->
            preferences[USER_ROLE_KEY]
        }
    }

    suspend fun clearAll() {
        context.dataStore.edit { preferences ->
            preferences.clear()
        }
    }

    fun isLoggedIn(): Flow<Boolean> {
        return context.dataStore.data.map { preferences ->
            val token = preferences[TOKEN_KEY]
            if (token != null && isTokenExpired(token)) {
                android.util.Log.d("TokenRepository", "Token expired, clearing...")
                context.dataStore.edit { it.clear() }
                false
            } else {
                token != null
            }
        }
    }

    /**
     * Decode JWT and check if exp claim is in the past.
     * Returns true if token is expired or cannot be parsed.
     */
    private fun isTokenExpired(token: String): Boolean {
        return try {
            val parts = token.split(".")
            if (parts.size != 3) return true
            val payload = String(Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP))
            val json = JSONObject(payload)
            val exp = json.getLong("exp")
            val nowSec = System.currentTimeMillis() / 1000
            exp < nowSec
        } catch (e: Exception) {
            android.util.Log.e("TokenRepository", "Failed to parse JWT exp: ${e.message}")
            true // treat unparseable tokens as expired
        }
    }
}
