package com.dokterdibya.patient.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dokterdibya.patient.ui.theme.*

/**
 * A reusable checkbox group component for multi-select options
 * Used for past_conditions, family_history, payment_method, etc.
 */
@Composable
fun CheckboxGroup(
    title: String,
    options: List<Pair<String, String>>, // (value, label)
    selectedOptions: Set<String>,
    onToggle: (String) -> Unit,
    modifier: Modifier = Modifier,
    columns: Int = 2
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = title,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            color = IntakeTextSecondary,
            modifier = Modifier.padding(bottom = 8.dp)
        )

        // Use a column with rows instead of LazyVerticalGrid to avoid nested scroll issues
        val chunkedOptions = options.chunked(columns)
        chunkedOptions.forEach { rowOptions ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                rowOptions.forEach { (value, label) ->
                    Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Checkbox(
                            checked = selectedOptions.contains(value),
                            onCheckedChange = { onToggle(value) },
                            colors = CheckboxDefaults.colors(
                                checkedColor = IntakePrimary,
                                uncheckedColor = IntakeBorder,
                                checkmarkColor = Color.White
                            )
                        )
                        Text(
                            text = label,
                            fontSize = 13.sp,
                            color = IntakeTextPrimary,
                            modifier = Modifier.padding(start = 4.dp)
                        )
                    }
                }
                // Fill empty space if odd number of items in last row
                if (rowOptions.size < columns) {
                    repeat(columns - rowOptions.size) {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

/**
 * A single row checkbox for simple yes/no selections
 */
@Composable
fun SingleCheckbox(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = CheckboxDefaults.colors(
                checkedColor = IntakePrimary,
                uncheckedColor = IntakeBorder,
                checkmarkColor = Color.White
            )
        )
        Text(
            text = label,
            fontSize = 14.sp,
            color = IntakeTextPrimary,
            modifier = Modifier.padding(start = 8.dp)
        )
    }
}

/**
 * Payment method checkbox group with specific styling
 */
@Composable
fun PaymentMethodGroup(
    selectedMethods: Set<String>,
    onToggle: (String) -> Unit,
    insuranceName: String,
    onInsuranceNameChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val paymentOptions = listOf(
        "self" to "Biaya Sendiri",
        "bpjs" to "BPJS",
        "insurance" to "Asuransi"
    )

    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = "Pembiayaan (bisa pilih lebih dari satu)",
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            color = IntakeTextSecondary,
            modifier = Modifier.padding(bottom = 8.dp)
        )

        paymentOptions.forEach { (value, label) ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Checkbox(
                    checked = selectedMethods.contains(value),
                    onCheckedChange = { onToggle(value) },
                    colors = CheckboxDefaults.colors(
                        checkedColor = IntakePrimary,
                        uncheckedColor = IntakeBorder,
                        checkmarkColor = Color.White
                    )
                )
                Text(
                    text = label,
                    fontSize = 14.sp,
                    color = IntakeTextPrimary,
                    modifier = Modifier.padding(start = 8.dp)
                )
            }
        }

        // Show insurance name field if insurance is selected
        if (selectedMethods.contains("insurance")) {
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
                value = insuranceName,
                onValueChange = onInsuranceNameChange,
                label = { Text("Nama Asuransi") },
                placeholder = { Text("Contoh: Prudential, AXA") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = IntakeTextPrimary,
                    unfocusedTextColor = IntakeTextPrimary,
                    focusedContainerColor = IntakeInputBg,
                    unfocusedContainerColor = IntakeInputBg,
                    focusedBorderColor = IntakePrimary,
                    unfocusedBorderColor = IntakeBorder,
                    focusedLabelColor = IntakePrimary,
                    unfocusedLabelColor = IntakeTextSecondary,
                    cursorColor = IntakePrimary,
                    focusedPlaceholderColor = IntakePlaceholder,
                    unfocusedPlaceholderColor = IntakePlaceholder
                )
            )
        }
    }
}
