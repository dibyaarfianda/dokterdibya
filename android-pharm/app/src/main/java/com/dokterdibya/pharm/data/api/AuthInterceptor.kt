package com.dokterdibya.pharm.data.api

import com.dokterdibya.pharm.data.repository.TokenRepository
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthInterceptor @Inject constructor(
    private val tokenRepository: TokenRepository
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()

        // Skip auth header for login endpoint
        if (originalRequest.url.encodedPath.contains("auth/login")) {
            return chain.proceed(originalRequest)
        }

        val token = runBlocking {
            tokenRepository.getToken().first()
        }

        return if (token != null) {
            val newRequest = originalRequest.newBuilder()
                .addHeader("Authorization", "Bearer $token")
                .addHeader("Cache-Control", "no-cache")
                .build()
            chain.proceed(newRequest)
        } else {
            chain.proceed(originalRequest)
        }
    }
}
