package com.dokterdibya.patient.ui.components

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.dokterdibya.patient.data.model.AppVersion
import com.dokterdibya.patient.ui.theme.*

@Composable
fun UpdateDialog(
    appVersion: AppVersion,
    currentVersionName: String,
    onDismiss: () -> Unit,
    onUpdate: () -> Unit
) {
    val context = LocalContext.current

    Dialog(
        onDismissRequest = { if (!appVersion.forceUpdate) onDismiss() },
        properties = DialogProperties(
            dismissOnBackPress = !appVersion.forceUpdate,
            dismissOnClickOutside = !appVersion.forceUpdate
        )
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(
                containerColor = CardDark
            )
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Icon
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .background(
                            Brush.linearGradient(
                                colors = listOf(Accent, Purple)
                            ),
                            shape = RoundedCornerShape(16.dp)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.SystemUpdate,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(32.dp)
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Title
                Text(
                    text = "Update Tersedia!",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimaryDark
                )

                Spacer(modifier = Modifier.height(8.dp))

                // Version info
                Text(
                    text = "Versi ${appVersion.versionName}",
                    fontSize = 14.sp,
                    color = Accent
                )

                Text(
                    text = "(Anda: v$currentVersionName)",
                    fontSize = 12.sp,
                    color = TextSecondaryDark
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Release notes
                if (!appVersion.releaseNotes.isNullOrEmpty()) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = BgDark
                        )
                    ) {
                        Text(
                            text = appVersion.releaseNotes,
                            fontSize = 13.sp,
                            color = TextSecondaryDark,
                            modifier = Modifier.padding(12.dp),
                            textAlign = TextAlign.Start
                        )
                    }

                    Spacer(modifier = Modifier.height(16.dp))
                }

                // Force update warning
                if (appVersion.forceUpdate) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = Danger.copy(alpha = 0.15f)
                        )
                    ) {
                        Text(
                            text = "Update ini wajib diinstall untuk melanjutkan",
                            fontSize = 12.sp,
                            color = Danger,
                            modifier = Modifier.padding(12.dp),
                            textAlign = TextAlign.Center
                        )
                    }

                    Spacer(modifier = Modifier.height(16.dp))
                }

                // Buttons
                Button(
                    onClick = {
                        // Open download URL in browser
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(appVersion.downloadUrl))
                        context.startActivity(intent)
                        onUpdate()
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Primary
                    )
                ) {
                    Text(
                        text = "Update Sekarang",
                        fontWeight = FontWeight.Medium
                    )
                }

                if (!appVersion.forceUpdate) {
                    Spacer(modifier = Modifier.height(8.dp))

                    TextButton(
                        onClick = onDismiss,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = "Nanti Saja",
                            color = TextSecondaryDark
                        )
                    }
                }
            }
        }
    }
}
