package com.dokterdibya.patient.ui.screens.home.components.sections

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dokterdibya.patient.R
import com.dokterdibya.patient.data.api.Medication
import com.dokterdibya.patient.ui.theme.*

@Composable
fun MedicationsSection(
    medications: List<Medication>,
    onViewAll: () -> Unit
) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    painter = painterResource(id = R.drawable.vit),
                    contentDescription = "Obat",
                    tint = Success,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Jadwal Vitamin",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimaryDark
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = CardDark)
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                medications.take(3).forEachIndexed { index, medication ->
                    if (index > 0) {
                        HorizontalDivider(
                            color = BgDark,
                            modifier = Modifier.padding(vertical = 8.dp)
                        )
                    }
                    MedicationItem(medication = medication)
                }

                if (medications.size > 3) {
                    Spacer(modifier = Modifier.height(8.dp))
                    TextButton(
                        onClick = onViewAll,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = "Lihat Semua (${medications.size})",
                            color = Accent
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun MedicationItem(medication: Medication) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(
                    if (medication.is_current == 1) Success.copy(alpha = 0.2f)
                    else TextSecondaryDark.copy(alpha = 0.2f)
                ),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                painter = painterResource(id = R.drawable.vit),
                contentDescription = medication.terapi ?: "Obat",
                tint = if (medication.is_current == 1) Success else TextSecondaryDark,
                modifier = Modifier.size(18.dp)
            )
        }

        Spacer(modifier = Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = medication.terapi ?: "Terapi",
                fontSize = 13.sp,
                color = TextPrimaryDark,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = medication.visit_date ?: "",
                fontSize = 11.sp,
                color = TextSecondaryDark
            )
        }

        if (medication.is_current == 1) {
            Surface(
                shape = RoundedCornerShape(4.dp),
                color = Success.copy(alpha = 0.2f)
            ) {
                Text(
                    text = "Aktif",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Medium,
                    color = Success,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                )
            }
        }
    }
}
