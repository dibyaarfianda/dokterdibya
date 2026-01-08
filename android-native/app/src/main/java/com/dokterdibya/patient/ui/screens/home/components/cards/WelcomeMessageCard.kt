package com.dokterdibya.patient.ui.screens.home.components.cards

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dokterdibya.patient.ui.theme.*

@Composable
fun WelcomeMessageCard() {
    var isExpanded by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { isExpanded = !isExpanded },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = WebCardBg),
        border = androidx.compose.foundation.BorderStroke(1.dp, WebCardBorder)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Favorite,
                        contentDescription = "Selamat Datang",
                        tint = WebAccent,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = "Tentang Portal Ini",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = WebAccent
                    )
                }
                Icon(
                    imageVector = if (isExpanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                    contentDescription = if (isExpanded) "Tutup" else "Buka",
                    tint = TextSecondaryDark
                )
            }

            if (isExpanded) {
                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Halaman ini adalah ruang khusus bagi Anda — tempat saya membantu Anda, memantau kehamilan atau kesehatan kandungan Anda secara berkala dan privat. Semua catatan dan informasi di sini bersifat rahasia.",
                    fontSize = 14.sp,
                    color = TextSecondaryDark,
                    lineHeight = 22.sp
                )

                Spacer(modifier = Modifier.height(12.dp))

                Text(
                    text = buildAnnotatedString {
                        append("Adanya ")
                        withStyle(SpanStyle(color = Color.White, fontWeight = FontWeight.SemiBold)) {
                            append("dokter")
                        }
                        withStyle(SpanStyle(color = Primary, fontWeight = FontWeight.SemiBold)) {
                            append("DIBYA")
                        }
                        append(" berawal dari keinginan ")
                        withStyle(SpanStyle(fontStyle = FontStyle.Italic)) {
                            append("sederhana")
                        }
                        append(" saya, yaitu agar setiap pasien bisa tetap terhubung dengan dokter pilihannya, tanpa batasan rumah sakit, tempat, atau waktu.")
                    },
                    fontSize = 14.sp,
                    color = TextSecondaryDark,
                    lineHeight = 22.sp
                )

                Spacer(modifier = Modifier.height(12.dp))

                Text(
                    text = "Terima kasih telah menjadi bagian dari \"modern therapy without boundary\" — pendampingan dan terapi berkelanjutan, di mana pun dan kapan pun Anda membutuhkannya.",
                    fontSize = 14.sp,
                    color = TextSecondaryDark,
                    lineHeight = 22.sp
                )

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Salam hangat,\ndokter Anda",
                    fontSize = 14.sp,
                    color = Accent,
                    fontWeight = FontWeight.Medium,
                    textAlign = TextAlign.End,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}
