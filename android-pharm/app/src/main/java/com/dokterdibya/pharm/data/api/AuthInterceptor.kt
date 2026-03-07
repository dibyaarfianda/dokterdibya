package com.dokterdibya.pharm.data.api

import android.util.Base64
import com.dokterdibya.pharm.data.repository.AuthState
import com.dokterdibya.pharm.data.repository.TokenRepository
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthInterceptor @Inject constructor(
    private val tokenRepository: TokenRepository,
    private val authState: AuthState
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        val path = originalRequest.url.encodedPath

        android.util.Log.d("AuthInterceptor", "Intercepting: $path")

        // Skip auth header for login endpoint
        if (path.contains("auth/login")) {
            android.util.Log.d("AuthInterceptor", "Skipping auth for login endpoint")
            return chain.proceed(originalRequest)
        }

        // Wait for token with timeout (up to 5 seconds for first request after login)
        val token = runBlocking {
            var attempts = 0
            var result: String? = null
            while (attempts < 50 && result == null) {
                result = tokenRepository.getToken().first()
                if (result == null) {
                    if (attempts == 0) {
                        android.util.Log.d("AuthInterceptor", "Token not found, waiting...")
                    }
                    kotlinx.coroutines.delay(100)
                    attempts++
                }
            }
            if (result != null && attempts > 0) {
                android.util.Log.d("AuthInterceptor", "Token found after ${attempts * 100}ms wait")
            }
            result
        }

        // Check if token is expired before sending request
        if (token != null && isTokenExpired(token)) {
            android.util.Log.e("AuthInterceptor", "Token expired! Clearing and triggering re-login.")
            runBlocking { tokenRepository.clearAll() }
            authState.notifyTokenExpired("Sesi Anda telah berakhir. Silakan login kembali.")
            // Proceed without token — will get 401
            return chain.proceed(originalRequest)
        }

        val response = if (token != null) {
            android.util.Log.d("AuthInterceptor", "Adding token to request: ${token.take(20)}...")
            val newRequest = originalRequest.newBuilder()
                .addHeader("Authorization", "Bearer $token")
                .addHeader("Cache-Control", "no-cache")
                .build()
            chain.proceed(newRequest)
        } else {
            android.util.Log.e("AuthInterceptor", "Token is null after 5s! Path: $path")
            chain.proceed(originalRequest)
        }

        // Check for 401 Unauthorized - token expired or invalid
        if (response.code == 401) {
            android.util.Log.e("AuthInterceptor", "Got 401 Unauthorized! Triggering logout.")

            // Clear token and notify app to navigate to login
            runBlocking {
                tokenRepository.clearAll()
            }
            authState.notifyTokenExpired("Sesi Anda telah berakhir. Silakan login kembali.")
        }

        return response
    }

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
            false // if we can't parse, let the server decide
        }
    }
}
