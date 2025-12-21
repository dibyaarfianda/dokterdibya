package com.dokterdibya.patient.ui.screens.articles

import android.widget.TextView
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.ui.res.painterResource
import com.dokterdibya.patient.R
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.dokterdibya.patient.ui.theme.*
import com.dokterdibya.patient.viewmodel.ArticleDetailViewModel
import io.noties.markwon.Markwon
import io.noties.markwon.html.HtmlPlugin

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ArticleDetailScreen(
    onBack: () -> Unit,
    viewModel: ArticleDetailViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Artikel",
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
                            uiState.error ?: "Gagal memuat artikel",
                            color = TextSecondaryDark
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = { viewModel.loadArticle() },
                            colors = ButtonDefaults.buttonColors(containerColor = Accent)
                        ) {
                            Text("Coba Lagi")
                        }
                    }
                }
                uiState.article != null -> {
                    val article = uiState.article!!
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                    ) {
                        // Featured Image
                        if (!article.imageUrl.isNullOrEmpty()) {
                            AsyncImage(
                                model = article.imageUrl,
                                contentDescription = article.title,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(200.dp)
                            )
                        }

                        Column(
                            modifier = Modifier.padding(16.dp)
                        ) {
                            // Category
                            if (!article.category.isNullOrEmpty()) {
                                Text(
                                    text = article.category.uppercase(),
                                    fontSize = 12.sp,
                                    color = Accent,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                            }

                            // Title
                            Text(
                                text = article.title,
                                fontSize = 22.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextPrimaryDark,
                                lineHeight = 28.sp
                            )

                            Spacer(modifier = Modifier.height(12.dp))

                            // Meta info
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                if (!article.author.isNullOrEmpty()) {
                                    Icon(
                                        painter = painterResource(id = R.drawable.profil),
                                        contentDescription = null,
                                        tint = TextSecondaryDark,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text(
                                        text = article.author,
                                        fontSize = 13.sp,
                                        color = TextSecondaryDark
                                    )
                                    Spacer(modifier = Modifier.width(16.dp))
                                }

                                if (!article.publishedAt.isNullOrEmpty()) {
                                    Icon(
                                        Icons.Default.Schedule,
                                        contentDescription = null,
                                        tint = TextSecondaryDark,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text(
                                        text = article.publishedAt.take(10),
                                        fontSize = 13.sp,
                                        color = TextSecondaryDark
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(20.dp))

                            // Divider
                            HorizontalDivider(
                                color = Color(0xFF3a3a3a),
                                thickness = 1.dp
                            )

                            Spacer(modifier = Modifier.height(20.dp))

                            // Content - render Markdown with HTML support
                            if (!article.content.isNullOrEmpty()) {
                                MarkdownContent(
                                    content = article.content,
                                    modifier = Modifier.fillMaxWidth()
                                )
                            } else if (!article.excerpt.isNullOrEmpty()) {
                                Text(
                                    text = article.excerpt,
                                    fontSize = 16.sp,
                                    color = TextPrimaryDark,
                                    lineHeight = 24.sp
                                )
                            }

                            Spacer(modifier = Modifier.height(32.dp))
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun MarkdownContent(
    content: String,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val textColor = TextPrimaryDark.toArgb()
    val linkColor = Accent.toArgb()

    // Create Markwon instance with HTML support
    val markwon = remember {
        Markwon.builder(context)
            .usePlugin(HtmlPlugin.create())
            .build()
    }

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            TextView(ctx).apply {
                setTextColor(textColor)
                setLinkTextColor(linkColor)
                textSize = 16f
                setLineSpacing(8f, 1f)
            }
        },
        update = { textView ->
            // Convert </br> to <br> for proper HTML rendering
            val normalizedContent = content
                .replace("</br>", "<br>")
                .replace("\\n", "\n")
            markwon.setMarkdown(textView, normalizedContent)
        }
    )
}
