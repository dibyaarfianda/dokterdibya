package com.dokterdibya.patient.ui.screens.home.components.cards

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChildCare
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FormatQuote
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.dokterdibya.patient.ui.theme.*
import com.dokterdibya.patient.viewmodel.BirthInfo

// Accent color for the card (purple/pink theme like web)
private val AccentPurple = Color(0xFFA855F7)
private val AccentPurpleLight = AccentPurple.copy(alpha = 0.3f)
private val DetailBoxBg = Color(0xFF1E1E28)

@Composable
fun BirthCongratulationsCard(birthInfo: BirthInfo) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 0.dp)
    ) {
        // Main content with corner accents
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .drawCornerAccents(AccentPurple)
                .padding(16.dp)
        ) {
            Column {
                // Header - Title with heart icon
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(bottom = 4.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Favorite,
                        contentDescription = null,
                        tint = AccentPurple,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Selamat atas Kelahiran Buah Hati!",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = AccentPurple
                    )
                }

                // Doctor attribution
                Text(
                    text = "Dari dr. Dibya Arfianda, SpOG, M.Ked.Klin.",
                    fontSize = 11.sp,
                    color = TextSecondaryDark,
                    modifier = Modifier.padding(bottom = 16.dp)
                )

                // Content - Photo on left, details on right
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Baby Photo
                    Box(
                        modifier = Modifier
                            .size(140.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .border(2.dp, AccentPurpleLight, RoundedCornerShape(12.dp))
                    ) {
                        if (birthInfo.babyPhotoUrl != null) {
                            AsyncImage(
                                model = birthInfo.babyPhotoUrl,
                                contentDescription = "Foto Bayi",
                                modifier = Modifier.fillMaxSize(),
                                contentScale = ContentScale.Crop
                            )
                        } else {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(AccentPurple.copy(alpha = 0.2f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.ChildCare,
                                    contentDescription = "Foto bayi",
                                    tint = AccentPurple,
                                    modifier = Modifier.size(48.dp)
                                )
                            }
                        }
                    }

                    // Baby Details - Name and subtitle
                    Column(modifier = Modifier.weight(1f)) {
                        if (birthInfo.babyName.isNotEmpty()) {
                            Text(
                                text = birthInfo.babyName,
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                                color = AccentPurple
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                        }

                        // 2x2 Grid for details
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            // Row 1: Date and Time
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                DetailBox(
                                    label = "TANGGAL LAHIR",
                                    value = birthInfo.birthDate,
                                    modifier = Modifier.weight(1f)
                                )
                                if (birthInfo.birthTime.isNotEmpty()) {
                                    DetailBox(
                                        label = "JAM",
                                        value = formatTime(birthInfo.birthTime),
                                        modifier = Modifier.weight(1f)
                                    )
                                }
                            }

                            // Row 2: Weight and Length
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                if (birthInfo.babyWeight.isNotEmpty()) {
                                    DetailBox(
                                        label = "BERAT BADAN",
                                        value = birthInfo.babyWeight,
                                        modifier = Modifier.weight(1f)
                                    )
                                }
                                if (birthInfo.babyLength.isNotEmpty()) {
                                    DetailBox(
                                        label = "PANJANG BADAN",
                                        value = birthInfo.babyLength,
                                        modifier = Modifier.weight(1f)
                                    )
                                }
                            }
                        }
                    }
                }

                // Doctor Message with left border accent
                if (!birthInfo.doctorMessage.isNullOrEmpty()) {
                    Spacer(modifier = Modifier.height(16.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                DetailBoxBg.copy(alpha = 0.9f),
                                RoundedCornerShape(8.dp)
                            )
                            .drawBehind {
                                // Left accent border
                                drawLine(
                                    color = AccentPurple,
                                    start = Offset(0f, 8.dp.toPx()),
                                    end = Offset(0f, size.height - 8.dp.toPx()),
                                    strokeWidth = 3.dp.toPx()
                                )
                            }
                            .padding(start = 16.dp, end = 12.dp, top = 12.dp, bottom = 12.dp)
                    ) {
                        Column {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Default.FormatQuote,
                                    contentDescription = null,
                                    tint = AccentPurple,
                                    modifier = Modifier.size(14.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "PESAN DARI DOKTER",
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = AccentPurple,
                                    letterSpacing = 0.5.sp
                                )
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = birthInfo.doctorMessage,
                                fontSize = 13.sp,
                                color = TextPrimaryDark,
                                lineHeight = 18.sp
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailBox(
    label: String,
    value: String,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .background(
                DetailBoxBg.copy(alpha = 0.9f),
                RoundedCornerShape(8.dp)
            )
            .border(
                1.dp,
                AccentPurpleLight,
                RoundedCornerShape(8.dp)
            )
            .padding(10.dp)
    ) {
        Column {
            Text(
                text = label,
                fontSize = 9.sp,
                color = TextSecondaryDark,
                fontWeight = FontWeight.Medium,
                letterSpacing = 0.3.sp
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = value,
                fontSize = 12.sp,
                color = TextPrimaryDark,
                fontWeight = FontWeight.SemiBold
            )
        }
    }
}

// Draw corner accent borders like the web design
private fun Modifier.drawCornerAccents(color: Color): Modifier = this.drawBehind {
    val cornerLength = 40.dp.toPx()
    val strokeWidth = 2.dp.toPx()

    // Top-left corner
    drawLine(
        color = color,
        start = Offset(0f, 0f),
        end = Offset(cornerLength, 0f),
        strokeWidth = strokeWidth
    )
    drawLine(
        color = color,
        start = Offset(0f, 0f),
        end = Offset(0f, cornerLength),
        strokeWidth = strokeWidth
    )

    // Top-right corner
    drawLine(
        color = color,
        start = Offset(size.width - cornerLength, 0f),
        end = Offset(size.width, 0f),
        strokeWidth = strokeWidth
    )
    drawLine(
        color = color,
        start = Offset(size.width, 0f),
        end = Offset(size.width, cornerLength),
        strokeWidth = strokeWidth
    )

    // Bottom-left corner
    drawLine(
        color = color,
        start = Offset(0f, size.height - cornerLength),
        end = Offset(0f, size.height),
        strokeWidth = strokeWidth
    )
    drawLine(
        color = color,
        start = Offset(0f, size.height),
        end = Offset(cornerLength, size.height),
        strokeWidth = strokeWidth
    )

    // Bottom-right corner
    drawLine(
        color = color,
        start = Offset(size.width, size.height - cornerLength),
        end = Offset(size.width, size.height),
        strokeWidth = strokeWidth
    )
    drawLine(
        color = color,
        start = Offset(size.width - cornerLength, size.height),
        end = Offset(size.width, size.height),
        strokeWidth = strokeWidth
    )
}

// Format time to show WIB
private fun formatTime(time: String): String {
    // Remove seconds if present (01:06:00 -> 01:06)
    val cleanTime = if (time.count { it == ':' } > 1) {
        time.substringBeforeLast(":")
    } else {
        time
    }
    return "$cleanTime WIB"
}
