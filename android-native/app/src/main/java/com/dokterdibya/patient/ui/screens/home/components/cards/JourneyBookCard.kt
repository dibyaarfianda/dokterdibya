package com.dokterdibya.patient.ui.screens.home.components.cards

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.TouchApp
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.dokterdibya.patient.ui.theme.Primary

@Composable
fun JourneyBookCard(onClick: () -> Unit) {
    val GoldColor = Color(0xFFD4AF37)
    val GoldBorder = Color(0x4DD4AF37)  // Gold with 30% opacity

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent),
        border = androidx.compose.foundation.BorderStroke(1.dp, GoldBorder)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.linearGradient(
                        colors = listOf(
                            Color(0xFF1a1a2e),
                            Color(0xFF16213e),
                            Color(0xFF0f3460)
                        )
                    )
                )
        ) {
            // Gold corner accents (top-left)
            Box(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .size(40.dp)
            ) {
                Box(modifier = Modifier.fillMaxWidth().height(2.dp).background(GoldColor))
                Box(modifier = Modifier.fillMaxHeight().width(2.dp).background(GoldColor))
            }
            // Gold corner accents (top-right)
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(40.dp)
            ) {
                Box(modifier = Modifier.fillMaxWidth().height(2.dp).background(GoldColor))
                Box(modifier = Modifier.align(Alignment.TopEnd).fillMaxHeight().width(2.dp).background(GoldColor))
            }
            // Gold corner accents (bottom-left)
            Box(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .size(40.dp)
            ) {
                Box(modifier = Modifier.align(Alignment.BottomStart).fillMaxWidth().height(2.dp).background(GoldColor))
                Box(modifier = Modifier.fillMaxHeight().width(2.dp).background(GoldColor))
            }
            // Gold corner accents (bottom-right)
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(40.dp)
            ) {
                Box(modifier = Modifier.align(Alignment.BottomEnd).fillMaxWidth().height(2.dp).background(GoldColor))
                Box(modifier = Modifier.align(Alignment.BottomEnd).fillMaxHeight().width(2.dp).background(GoldColor))
            }

            // Content
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(25.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(20.dp)
            ) {
                // Book thumbnail with gold border
                Card(
                    shape = RoundedCornerShape(8.dp),
                    border = androidx.compose.foundation.BorderStroke(2.dp, GoldBorder),
                    elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
                ) {
                    AsyncImage(
                        model = "https://dokterdibya.com/images/dokter-dibya-book/thumb-book.jpeg",
                        contentDescription = "Book Cover",
                        modifier = Modifier
                            .width(100.dp)
                            .height(140.dp),
                        contentScale = ContentScale.Crop
                    )
                }

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Perjalanan menjadi Ibu",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Normal,
                        color = Color(0xFFF5F5F5),
                        fontStyle = FontStyle.Italic,
                        letterSpacing = 1.sp
                    )
                    Spacer(modifier = Modifier.height(5.dp))
                    Text(
                        text = buildAnnotatedString {
                            append("by ")
                            withStyle(SpanStyle(color = Color.White, fontWeight = FontWeight.SemiBold)) {
                                append("dokter")
                            }
                            withStyle(SpanStyle(color = Primary, fontWeight = FontWeight.SemiBold)) {
                                append("DIBYA")
                            }
                        },
                        fontSize = 11.sp,
                        fontStyle = FontStyle.Italic,
                        color = Color(0xFFCCCCCC)
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.TouchApp,
                            contentDescription = "Buka",
                            tint = GoldColor,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = buildAnnotatedString {
                                withStyle(SpanStyle(color = GoldColor, fontWeight = FontWeight.Bold)) {
                                    append("Klik untuk membuka")
                                }
                                append(" buku interaktif perjalanan kehamilan Anda")
                            },
                            fontSize = 13.sp,
                            color = Color(0xFFE0E0E0),
                            lineHeight = 18.sp
                        )
                    }
                }
            }
        }
    }
}
