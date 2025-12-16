package com.dokterdibya.patient.data.repository

import android.content.Context
import android.content.pm.PackageManager
import com.dokterdibya.patient.data.api.ApiService
import com.dokterdibya.patient.data.model.AppVersion
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class UpdateRepository @Inject constructor(
    private val apiService: ApiService,
    @ApplicationContext private val context: Context
) {
    fun getCurrentVersionCode(): Int {
        return try {
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                packageInfo.longVersionCode.toInt()
            } else {
                @Suppress("DEPRECATION")
                packageInfo.versionCode
            }
        } catch (e: PackageManager.NameNotFoundException) {
            1
        }
    }

    fun getCurrentVersionName(): String {
        return try {
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            packageInfo.versionName ?: "1.0.0"
        } catch (e: PackageManager.NameNotFoundException) {
            "1.0.0"
        }
    }

    suspend fun checkForUpdate(): Result<AppVersion?> {
        return try {
            val response = apiService.checkAppVersion()
            if (response.isSuccessful && response.body()?.version != null) {
                val latestVersion = response.body()!!.version!!
                val currentVersionCode = getCurrentVersionCode()

                // Check if update is available
                if (latestVersion.versionCode > currentVersionCode) {
                    Result.success(latestVersion)
                } else {
                    Result.success(null) // No update needed
                }
            } else {
                Result.success(null)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun isUpdateRequired(appVersion: AppVersion): Boolean {
        val currentVersionCode = getCurrentVersionCode()
        return appVersion.forceUpdate || currentVersionCode < appVersion.minVersionCode
    }
}
