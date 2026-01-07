package com.dokterdibya.patient.ui.screens.documents

import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebSettings
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import com.dokterdibya.patient.ui.theme.*
import com.dokterdibya.patient.viewmodel.DocumentViewerViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DocumentViewerScreen(
    onBack: () -> Unit,
    viewModel: DocumentViewerViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        uiState.document?.title ?: "Dokumen",
                        fontWeight = FontWeight.SemiBold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = BgDark,
                    titleContentColor = TextPrimaryDark,
                    navigationIconContentColor = TextPrimaryDark
                )
            )
        },
        containerColor = BgDark
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when {
                uiState.isLoading -> {
                    CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center),
                        color = Accent
                    )
                }
                uiState.error != null -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Icon(
                            Icons.Default.Warning,
                            contentDescription = null,
                            tint = Danger,
                            modifier = Modifier.size(48.dp)
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            uiState.error ?: "Gagal memuat dokumen",
                            color = TextSecondaryDark
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = { viewModel.loadDocument() },
                            colors = ButtonDefaults.buttonColors(containerColor = Accent)
                        ) {
                            Text("Coba Lagi")
                        }
                    }
                }
                uiState.document != null -> {
                    val content = uiState.document!!.content
                    if (!content.isNullOrEmpty()) {
                        // Display HTML content in WebView
                        DocumentContentView(content = content)
                    } else {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(16.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center
                        ) {
                            Icon(
                                Icons.Default.Description,
                                contentDescription = null,
                                tint = TextSecondaryDark,
                                modifier = Modifier.size(48.dp)
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                "Tidak ada konten",
                                color = TextSecondaryDark
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * Secure WebView client that prevents navigation to external URLs
 */
private class SecureWebViewClient : WebViewClient() {
    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
        // Block all navigation - we only display static HTML content
        return true
    }

    override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
        // Block all navigation for older Android versions
        return true
    }
}

/**
 * Sanitize HTML content to prevent XSS attacks
 * Removes potentially dangerous tags and attributes
 */
private fun sanitizeHtml(content: String): String {
    return content
        .replace(Regex("<script[^>]*>.*?</script>", RegexOption.IGNORE_CASE), "")
        .replace(Regex("<iframe[^>]*>.*?</iframe>", RegexOption.IGNORE_CASE), "")
        .replace(Regex("<object[^>]*>.*?</object>", RegexOption.IGNORE_CASE), "")
        .replace(Regex("<embed[^>]*>.*?</embed>", RegexOption.IGNORE_CASE), "")
        .replace(Regex("<form[^>]*>.*?</form>", RegexOption.IGNORE_CASE), "")
        .replace(Regex("on\\w+\\s*=", RegexOption.IGNORE_CASE), "data-blocked=")
        .replace(Regex("javascript:", RegexOption.IGNORE_CASE), "blocked:")
}

@Composable
fun DocumentContentView(content: String) {
    // Sanitize content before display to prevent XSS
    val sanitizedContent = sanitizeHtml(content)

    val htmlContent = """
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https:;">
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    font-size: 16px;
                    line-height: 1.6;
                    color: #ffffff;
                    background-color: #0F0F1A;
                    padding: 16px;
                    margin: 0;
                }
                h1, h2, h3, h4, h5, h6 {
                    color: #0091FF;
                    margin-top: 16px;
                    margin-bottom: 8px;
                }
                h1 { font-size: 24px; }
                h2 { font-size: 20px; }
                h3 { font-size: 18px; }
                p { margin: 8px 0; }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 16px 0;
                }
                th, td {
                    border: 1px solid #3a3a3a;
                    padding: 8px;
                    text-align: left;
                }
                th {
                    background-color: #1A1A2E;
                    color: #0091FF;
                }
                tr:nth-child(even) {
                    background-color: #1A1A2E;
                }
                ul, ol {
                    margin: 8px 0;
                    padding-left: 24px;
                }
                li { margin: 4px 0; }
                a { color: #0091FF; pointer-events: none; }
                hr {
                    border: none;
                    border-top: 1px solid #3a3a3a;
                    margin: 16px 0;
                }
                .section {
                    background-color: #1E1E2E;
                    border-radius: 8px;
                    padding: 16px;
                    margin: 16px 0;
                }
                strong { color: #ffffff; }
            </style>
        </head>
        <body>
            $sanitizedContent
        </body>
        </html>
    """.trimIndent()

    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { context ->
            WebView(context).apply {
                // SECURITY: Disable JavaScript to prevent XSS attacks
                settings.javaScriptEnabled = false

                // SECURITY: Disable file and content access
                settings.allowFileAccess = false
                settings.allowContentAccess = false

                // SECURITY: Disable geolocation
                settings.setGeolocationEnabled(false)

                // SECURITY: Disable DOM storage
                settings.domStorageEnabled = false

                // SECURITY: Disable database access
                settings.databaseEnabled = false

                // Display settings
                settings.loadWithOverviewMode = true
                settings.useWideViewPort = true
                settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW

                // Use secure WebViewClient that blocks navigation
                webViewClient = SecureWebViewClient()

                setBackgroundColor(android.graphics.Color.parseColor("#0F0F1A"))
            }
        },
        update = { webView ->
            webView.loadDataWithBaseURL(
                null,
                htmlContent,
                "text/html",
                "UTF-8",
                null
            )
        }
    )
}
