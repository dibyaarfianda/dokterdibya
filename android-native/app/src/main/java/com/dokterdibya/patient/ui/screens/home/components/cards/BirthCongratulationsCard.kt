package com.dokterdibya.patient.ui.screens.home.components.cards

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChildCare
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.dokterdibya.patient.ui.theme.*
import com.dokterdibya.patient.viewmodel.BirthInfo

@Composable
fun BirthCongratulationsCard(birthInfo: BirthInfo) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.linearGradient(
                        colors = listOf(
                            Purple.copy(alpha = 0.15f),
                            Fertility.copy(alpha = 0.15f)
                        )
                    )
                )
                .padding(20.dp)
        ) {
            Column {
                // Header
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Favorite,
                        contentDescription = null,
                        tint = Purple,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Selamat atas Kelahiran Buah Hati!",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Purple
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Baby Photo
                    if (birthInfo.babyPhotoUrl != null) {
                        AsyncImage(
                            model = birthInfo.babyPhotoUrl,
                            contentDescription = "Foto Bayi",
                            modifier = Modifier
                                .size(100.dp)
                                .clip(RoundedCornerShape(12.dp)),
                            contentScale = ContentScale.Crop
                        )
                    } else {
                        Box(
                            modifier = Modifier
                                .size(100.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(Purple.copy(alpha = 0.2f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.ChildCare,
                                contentDescription = "Foto bayi",
                                tint = Purple,
                                modifier = Modifier.size(48.dp)
                            )
                        }
                    }

                    // Baby Details
                    Column(modifier = Modifier.weight(1f)) {
                        if (birthInfo.babyName.isNotEmpty()) {
                            Text(
                                text = birthInfo.babyName,
                                fontSize = 20.sp,
                                fontWeight = FontWeight.Bold,
                                color = Purple
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                        }

                        BirthDetailRow(label = "Tanggal", value = birthInfo.birthDate)
                        if (birthInfo.birthTime.isNotEmpty()) {
                            BirthDetailRow(label = "Jam", value = birthInfo.birthTime)
                        }
                        if (birthInfo.babyWeight.isNotEmpty()) {
                            BirthDetailRow(label = "Berat", value = birthInfo.babyWeight)
                        }
                        if (birthInfo.babyLength.isNotEmpty()) {
                            BirthDetailRow(label = "Panjang", value = birthInfo.babyLength)
                        }
                    }
                }

                // Doctor Message
                if (!birthInfo.doctorMessage.isNullOrEmpty()) {
                    Spacer(modifier = Modifier.height(16.dp))
                    Card(
                        shape = RoundedCornerShape(10.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = CardDark.copy(alpha = 0.5f)
                        )
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text(
                                text = "Pesan dari Dokter",
                                fontSize = 11.sp,
                                color = Purple,
                                fontWeight = FontWeight.Medium
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = birthInfo.doctorMessage,
                                fontSize = 13.sp,
                                color = TextPrimaryDark,
                                fontStyle = FontStyle.Italic
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun BirthDetailRow(label: String, value: String) {
    Row(modifier = Modifier.padding(vertical = 2.dp)) {
        Text(
            text = "$label: ",
            fontSize = 12.sp,
            color = TextSecondaryDark
        )
        Text(
            text = value,
            fontSize = 12.sp,
            color = TextPrimaryDark,
            fontWeight = FontWeight.Medium
        )
    }
}
