package com.dokterdibya.patient.ui.screens.documents

import android.webkit.WebView
import android.webkit.WebViewClient
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

@Composable
fun DocumentContentView(content: String) {
    val htmlContent = """
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
                a { color: #0091FF; }
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
            $content
        </body>
        </html>
    """.trimIndent()

    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { context ->
            WebView(context).apply {
                settings.javaScriptEnabled = false
                settings.loadWithOverviewMode = true
                settings.useWideViewPort = true
                webViewClient = WebViewClient()
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
