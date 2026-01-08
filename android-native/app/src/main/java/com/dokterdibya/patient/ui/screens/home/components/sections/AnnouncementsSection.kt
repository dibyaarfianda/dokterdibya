package com.dokterdibya.patient.ui.screens.home.components.sections

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.dokterdibya.patient.data.api.Announcement
import com.dokterdibya.patient.ui.screens.home.components.common.MarkdownText
import com.dokterdibya.patient.ui.theme.*

@Composable
fun AnnouncementsSection(
    announcements: List<Announcement>,
    onLike: (Int) -> Unit
) {
    var isExpanded by remember { mutableStateOf(true) }
    var showAllAnnouncements by remember { mutableStateOf(false) }

    // Get priority announcement and most recent non-priority
    val priorityAnnouncement = announcements.find { it.priority == "important" || it.priority == "urgent" }
    val recentAnnouncements = announcements.filter { it.id != priorityAnnouncement?.id }

    // Initial 2: priority (if exists) + most recent
    val initialAnnouncements = buildList {
        priorityAnnouncement?.let { add(it) }
        recentAnnouncements.firstOrNull()?.let { add(it) }
    }.take(2)

    val displayedAnnouncements = if (showAllAnnouncements) announcements else initialAnnouncements
    val remainingCount = announcements.size - initialAnnouncements.size

    // Announcements container card (website style)
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
                        imageVector = Icons.Default.PushPin,
                        contentDescription = null,
                        tint = WebAccent,
                        modifier = Modifier.size(22.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        text = "Pengumuman",
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
                    displayedAnnouncements.forEachIndexed { index, announcement ->
                        if (index > 0) {
                            Spacer(modifier = Modifier.height(16.dp))
                        }
                        AnnouncementCard(
                            announcement = announcement,
                            onLike = { onLike(announcement.id) }
                        )
                    }

                    // "Lihat X Pengumuman Lainnya" button at BOTTOM (website style)
                    if (remainingCount > 0 && !showAllAnnouncements) {
                        Spacer(modifier = Modifier.height(16.dp))
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { showAllAnnouncements = true },
                            color = WebAccent.copy(alpha = 0.1f),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 12.dp),
                                horizontalArrangement = Arrangement.Center,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Lihat $remainingCount Pengumuman Lainnya",
                                    fontSize = 14.sp,
                                    color = WebAccent,
                                    fontWeight = FontWeight.Medium
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Icon(
                                    imageVector = Icons.Default.KeyboardArrowDown,
                                    contentDescription = "Buka detail",
                                    tint = WebAccent,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }
                    }

                    // "Sembunyikan" button when showing all
                    if (showAllAnnouncements && announcements.size > 2) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { showAllAnnouncements = false },
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Sembunyikan",
                                fontSize = 13.sp,
                                color = TextSecondaryDark,
                                fontWeight = FontWeight.Medium
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Icon(
                                imageVector = Icons.Default.KeyboardArrowUp,
                                contentDescription = "Tutup detail",
                                tint = TextSecondaryDark,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun AnnouncementCard(
    announcement: Announcement,
    onLike: () -> Unit
) {
    val isImportant = announcement.priority == "urgent" || announcement.priority == "important"
    val priorityColor = if (isImportant) Warning else WebAccent
    val priorityIcon = if (isImportant) Icons.Default.Warning else Icons.Default.Info

    // Inner card for each announcement
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = CardDark.copy(alpha = 0.6f)),
        border = androidx.compose.foundation.BorderStroke(1.dp, WebCardBorder.copy(alpha = 0.3f))
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            // Title row with icon and badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top
            ) {
                // Priority icon
                Icon(
                    imageVector = priorityIcon,
                    contentDescription = "Prioritas",
                    tint = priorityColor,
                    modifier = Modifier
                        .size(20.dp)
                        .padding(top = 2.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))

                // Title
                Text(
                    text = announcement.title,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimaryDark,
                    modifier = Modifier.weight(1f)
                )

                Spacer(modifier = Modifier.width(10.dp))

                // Badge
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = priorityColor
                ) {
                    Text(
                        text = if (isImportant) "PENTING" else "INFORMASI",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isImportant) Color.Black else Color.White,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Message content (full text, no truncation like website)
            MarkdownText(
                content = announcement.message,
                maxLines = Int.MAX_VALUE,
                modifier = Modifier.fillMaxWidth()
            )

            // Image if available
            if (!announcement.image_url.isNullOrEmpty()) {
                Spacer(modifier = Modifier.height(14.dp))
                AsyncImage(
                    model = announcement.image_url,
                    contentDescription = "Gambar pengumuman",
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp)
                        .clip(RoundedCornerShape(8.dp)),
                    contentScale = ContentScale.Crop
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Author section (website style)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Author with icon
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Person,
                        contentDescription = "Penulis",
                        tint = WebAccent,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = announcement.created_by_name ?: "Tim dokterDIBYA",
                        fontSize = 12.sp,
                        color = WebAccent,
                        fontWeight = FontWeight.Medium
                    )
                }

                // Like count and date
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Like button
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.clickable(onClick = onLike)
                    ) {
                        Icon(
                            imageVector = if (announcement.liked_by_me) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                            contentDescription = "Like",
                            tint = if (announcement.liked_by_me) Danger else TextSecondaryDark,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = announcement.like_count.toString(),
                            fontSize = 12.sp,
                            color = TextSecondaryDark
                        )
                    }

                    // Date
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.CalendarToday,
                            contentDescription = "Tanggal",
                            tint = TextSecondaryDark,
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = formatAnnouncementDate(announcement.created_at),
                            fontSize = 12.sp,
                            color = TextSecondaryDark
                        )
                    }
                }
            }
        }
    }
}

// Helper function to format date
private fun formatAnnouncementDate(dateString: String?): String {
    if (dateString.isNullOrEmpty()) return ""
    return try {
        val inputFormat = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale("id", "ID"))
        val outputFormat = java.text.SimpleDateFormat("dd MMMM yyyy", java.util.Locale("id", "ID"))
        val date = inputFormat.parse(dateString)
        date?.let { outputFormat.format(it) } ?: dateString.take(10)
    } catch (e: Exception) {
        dateString.take(10)
    }
}
