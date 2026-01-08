package com.dokterdibya.patient.ui.screens.home.components.sections

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.dokterdibya.patient.data.api.Article
import com.dokterdibya.patient.ui.theme.*

@Composable
fun RuangMembacaSection(
    articles: List<Article>,
    totalArticleCount: Int = 0,
    onArticleClick: (Article) -> Unit,
    onViewAll: () -> Unit
) {
    var isExpanded by remember { mutableStateOf(true) }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = WebCardBg),
        border = androidx.compose.foundation.BorderStroke(1.dp, WebCardBorder)
    ) {
        Column {
            // Header row (clickable to expand/collapse)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { isExpanded = !isExpanded }
                    .padding(20.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.MenuBook,
                        contentDescription = "Artikel",
                        tint = WebAccent,
                        modifier = Modifier.size(22.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        text = "Ruang Membaca",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = WebAccent
                    )
                }
                Icon(
                    imageVector = if (isExpanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                    contentDescription = if (isExpanded) "Tutup" else "Buka",
                    tint = WebAccent,
                    modifier = Modifier.size(24.dp)
                )
            }

            // Content (expandable)
            if (isExpanded) {
                Column(
                    modifier = Modifier.padding(start = 20.dp, end = 20.dp, bottom = 20.dp)
                ) {
                    // Description
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(bottom = 16.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Star,
                            contentDescription = "Populer",
                            tint = Warning,
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = buildAnnotatedString {
                                append("Artikel pilihan dari ")
                                withStyle(SpanStyle(color = WebAccent, fontWeight = FontWeight.SemiBold)) {
                                    append("dokter")
                                }
                                withStyle(SpanStyle(color = Primary, fontWeight = FontWeight.SemiBold)) {
                                    append("DIBYA")
                                }
                                append(" berdasarkan jurnal terkini")
                            },
                            fontSize = 12.sp,
                            color = TextSecondaryDark
                        )
                    }

                    // Article cards
                    articles.forEachIndexed { index, article ->
                        if (index > 0) {
                            Spacer(modifier = Modifier.height(12.dp))
                        }
                        ArticleCard(
                            article = article,
                            onClick = { onArticleClick(article) }
                        )
                    }

                    // View all button (filled cyan button with count - website style)
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(
                        onClick = onViewAll,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = WebAccent),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            text = if (totalArticleCount > 0) "Lihat Semua Artikel ($totalArticleCount)" else "Lihat Semua Artikel",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Icon(
                            imageVector = Icons.Default.ArrowForward,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun ArticleCard(
    article: Article,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = CardDark.copy(alpha = 0.6f)),
        border = androidx.compose.foundation.BorderStroke(1.dp, WebCardBorder.copy(alpha = 0.3f))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.Top
        ) {
            // Article image thumbnail
            Card(
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.size(width = 80.dp, height = 100.dp)
            ) {
                if (!article.imageUrl.isNullOrEmpty()) {
                    AsyncImage(
                        model = article.imageUrl,
                        contentDescription = article.title,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(WebAccent.copy(alpha = 0.2f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Article,
                            contentDescription = "Artikel",
                            tint = WebAccent,
                            modifier = Modifier.size(32.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            // Article info
            Column(modifier = Modifier.weight(1f)) {
                // Category badge and date
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(bottom = 6.dp)
                ) {
                    if (!article.category.isNullOrEmpty()) {
                        Surface(
                            shape = RoundedCornerShape(4.dp),
                            color = WebAccent
                        ) {
                            Text(
                                text = article.category.uppercase(),
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                    }
                    Text(
                        text = formatArticleDate(article.publishedAt ?: article.createdAt),
                        fontSize = 11.sp,
                        color = TextSecondaryDark
                    )
                }

                // Title
                Text(
                    text = article.title,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimaryDark,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )

                // Excerpt
                if (!article.excerpt.isNullOrEmpty()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = article.excerpt,
                        fontSize = 12.sp,
                        color = TextSecondaryDark,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        lineHeight = 16.sp
                    )
                }
            }
        }
    }
}

// Helper function to format article date
private fun formatArticleDate(dateString: String?): String {
    if (dateString.isNullOrEmpty()) return ""
    return try {
        val inputFormat = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale("id", "ID"))
        val outputFormat = java.text.SimpleDateFormat("MMM yyyy", java.util.Locale("id", "ID"))
        val date = inputFormat.parse(dateString.take(10))
        date?.let { outputFormat.format(it) } ?: dateString.take(10)
    } catch (e: Exception) {
        dateString.take(10)
    }
}
