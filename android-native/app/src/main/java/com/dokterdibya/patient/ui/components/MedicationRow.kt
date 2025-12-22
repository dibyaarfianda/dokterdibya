package com.dokterdibya.patient.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * A row for entering medication information (name, dose, frequency)
 * Used for current medications in the intake form
 */
@Composable
fun MedicationRow(
    index: Int,
    name: String,
    dose: String,
    frequency: String,
    onNameChange: (String) -> Unit,
    onDoseChange: (String) -> Unit,
    onFrequencyChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = "Obat ${index + 1}",
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            color = Color(0xFF6B7280),
            modifier = Modifier.padding(bottom = 4.dp)
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                value = name,
                onValueChange = onNameChange,
                placeholder = { Text("Nama obat", fontSize = 12.sp) },
                modifier = Modifier.weight(1f),
                singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Color(0xFF667EEA),
                    unfocusedBorderColor = Color(0xFFD1D5DB)
                ),
                textStyle = LocalTextStyle.current.copy(fontSize = 13.sp)
            )

            OutlinedTextField(
                value = dose,
                onValueChange = onDoseChange,
                placeholder = { Text("Dosis", fontSize = 12.sp) },
                modifier = Modifier.weight(0.6f),
                singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Color(0xFF667EEA),
                    unfocusedBorderColor = Color(0xFFD1D5DB)
                ),
                textStyle = LocalTextStyle.current.copy(fontSize = 13.sp)
            )

            OutlinedTextField(
                value = frequency,
                onValueChange = onFrequencyChange,
                placeholder = { Text("Frekuensi", fontSize = 12.sp) },
                modifier = Modifier.weight(0.6f),
                singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Color(0xFF667EEA),
                    unfocusedBorderColor = Color(0xFFD1D5DB)
                ),
                textStyle = LocalTextStyle.current.copy(fontSize = 13.sp)
            )
        }
    }
}

/**
 * Container for multiple medication rows
 */
@Composable
fun MedicationSection(
    med1: Triple<String, String, String>,
    med2: Triple<String, String, String>,
    med3: Triple<String, String, String>,
    onMed1Change: (name: String?, dose: String?, freq: String?) -> Unit,
    onMed2Change: (name: String?, dose: String?, freq: String?) -> Unit,
    onMed3Change: (name: String?, dose: String?, freq: String?) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = "Obat yang Sedang Dikonsumsi",
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            color = Color(0xFF4B5563),
            modifier = Modifier.padding(bottom = 12.dp)
        )

        Text(
            text = "Isi jika ada obat yang sedang diminum secara rutin",
            fontSize = 12.sp,
            color = Color(0xFF9CA3AF),
            modifier = Modifier.padding(bottom = 12.dp)
        )

        MedicationRow(
            index = 0,
            name = med1.first,
            dose = med1.second,
            frequency = med1.third,
            onNameChange = { onMed1Change(it, null, null) },
            onDoseChange = { onMed1Change(null, it, null) },
            onFrequencyChange = { onMed1Change(null, null, it) }
        )

        Spacer(modifier = Modifier.height(12.dp))

        MedicationRow(
            index = 1,
            name = med2.first,
            dose = med2.second,
            frequency = med2.third,
            onNameChange = { onMed2Change(it, null, null) },
            onDoseChange = { onMed2Change(null, it, null) },
            onFrequencyChange = { onMed2Change(null, null, it) }
        )

        Spacer(modifier = Modifier.height(12.dp))

        MedicationRow(
            index = 2,
            name = med3.first,
            dose = med3.second,
            frequency = med3.third,
            onNameChange = { onMed3Change(it, null, null) },
            onDoseChange = { onMed3Change(null, it, null) },
            onFrequencyChange = { onMed3Change(null, null, it) }
        )
    }
}
