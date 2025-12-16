package com.dokterdibya.patient.data.service

import android.app.DownloadManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import androidx.core.app.NotificationCompat
import androidx.core.content.FileProvider
import com.dokterdibya.patient.DokterDibyaApp
import com.dokterdibya.patient.R
import com.dokterdibya.patient.data.model.AppVersion
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

sealed class UpdateState {
    object Idle : UpdateState()
    object Checking : UpdateState()
    data class Available(val version: AppVersion) : UpdateState()
    data class Downloading(val progress: Int) : UpdateState()
    data class ReadyToInstall(val file: File, val version: AppVersion) : UpdateState()
    data class Error(val message: String) : UpdateState()
}

@Singleton
class UpdateService @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val _updateState = MutableStateFlow<UpdateState>(UpdateState.Idle)
    val updateState: StateFlow<UpdateState> = _updateState

    private var downloadId: Long = -1
    private var pendingVersion: AppVersion? = null

    private val downloadManager by lazy {
        context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    }

    private val notificationManager by lazy {
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    }

    fun setUpdateAvailable(version: AppVersion) {
        _updateState.value = UpdateState.Available(version)
    }

    fun downloadUpdate(version: AppVersion) {
        pendingVersion = version
        _updateState.value = UpdateState.Downloading(0)

        // Delete old APK if exists
        val apkFile = getApkFile()
        if (apkFile.exists()) {
            apkFile.delete()
        }

        val request = DownloadManager.Request(Uri.parse(version.downloadUrl))
            .setTitle("Update dokterDIBYA")
            .setDescription("Mengunduh versi ${version.versionName}")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
            .setDestinationInExternalFilesDir(
                context,
                Environment.DIRECTORY_DOWNLOADS,
                "dokterdibya-update.apk"
            )
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(false)

        downloadId = downloadManager.enqueue(request)

        // Register receiver for download complete
        val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(downloadReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(downloadReceiver, filter)
        }
    }

    private val downloadReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            val id = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) ?: -1
            if (id == downloadId) {
                val query = DownloadManager.Query().setFilterById(downloadId)
                val cursor = downloadManager.query(query)

                if (cursor.moveToFirst()) {
                    val statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
                    val status = cursor.getInt(statusIndex)

                    when (status) {
                        DownloadManager.STATUS_SUCCESSFUL -> {
                            val apkFile = getApkFile()
                            pendingVersion?.let { version ->
                                _updateState.value = UpdateState.ReadyToInstall(apkFile, version)
                                showInstallNotification(version)
                            }
                        }
                        DownloadManager.STATUS_FAILED -> {
                            _updateState.value = UpdateState.Error("Download gagal")
                        }
                    }
                }
                cursor.close()

                try {
                    context.unregisterReceiver(this)
                } catch (e: Exception) {
                    // Already unregistered
                }
            }
        }
    }

    private fun showInstallNotification(version: AppVersion) {
        val installIntent = Intent(context, UpdateInstallReceiver::class.java)
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            0,
            installIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, DokterDibyaApp.NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Update Siap Diinstall")
            .setContentText("dokterDIBYA ${version.versionName} siap diinstall")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .addAction(
                R.drawable.ic_notification,
                "Install Sekarang",
                pendingIntent
            )
            .build()

        notificationManager.notify(UPDATE_NOTIFICATION_ID, notification)
    }

    fun installUpdate() {
        val state = _updateState.value
        if (state is UpdateState.ReadyToInstall) {
            installApk(state.file)
        }
    }

    fun installApk(file: File) {
        if (!file.exists()) {
            _updateState.value = UpdateState.Error("File APK tidak ditemukan")
            return
        }

        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file
        )

        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
        }

        context.startActivity(intent)
    }

    private fun getApkFile(): File {
        return File(
            context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
            "dokterdibya-update.apk"
        )
    }

    fun dismissUpdate() {
        _updateState.value = UpdateState.Idle
    }

    companion object {
        const val UPDATE_NOTIFICATION_ID = 1001
    }
}

class UpdateInstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        context?.let { ctx ->
            val apkFile = File(
                ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                "dokterdibya-update.apk"
            )

            if (apkFile.exists()) {
                val uri = FileProvider.getUriForFile(
                    ctx,
                    "${ctx.packageName}.fileprovider",
                    apkFile
                )

                val installIntent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
                }

                ctx.startActivity(installIntent)
            }
        }
    }
}
