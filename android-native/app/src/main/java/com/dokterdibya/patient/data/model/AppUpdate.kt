package com.dokterdibya.patient.data.model

import com.google.gson.annotations.SerializedName

data class AppVersion(
    @SerializedName("version_code")
    val versionCode: Int,
    @SerializedName("version_name")
    val versionName: String,
    @SerializedName("download_url")
    val downloadUrl: String,
    @SerializedName("release_notes")
    val releaseNotes: String?,
    @SerializedName("force_update")
    val forceUpdate: Boolean = false,
    @SerializedName("min_version_code")
    val minVersionCode: Int = 1
)

data class AppVersionResponse(
    val success: Boolean,
    val version: AppVersion?
)
