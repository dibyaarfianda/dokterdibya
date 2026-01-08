package com.dokterdibya.patient.ui.screens.home.components.common

import android.widget.TextView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import com.dokterdibya.patient.ui.theme.Accent
import com.dokterdibya.patient.ui.theme.TextSecondaryDark
import io.noties.markwon.Markwon
import io.noties.markwon.html.HtmlPlugin

@Composable
fun MarkdownText(
    content: String,
    maxLines: Int = Int.MAX_VALUE,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val textColor = TextSecondaryDark.toArgb()
    val accentColor = Accent.toArgb()

    // Create Markwon instance with HTML support
    val markwon = remember {
        Markwon.builder(context)
            .usePlugin(HtmlPlugin.create())
            .build()
    }

    // Normalize content: convert </br> to <br>, \n to actual newlines
    val normalizedContent = remember(content) {
        content
            .replace("</br>", "<br>")
            .replace("\\n", "\n")
    }

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            TextView(ctx).apply {
                setTextColor(textColor)
                setLinkTextColor(accentColor)
                textSize = 13f
                setLineSpacing(4f, 1f)
                this.maxLines = maxLines
                ellipsize = android.text.TextUtils.TruncateAt.END
                // Don't consume touch events - let parent handle clicks
                isClickable = false
                isFocusable = false
            }
        },
        update = { textView ->
            textView.maxLines = maxLines
            markwon.setMarkdown(textView, normalizedContent)
        }
    )
}
