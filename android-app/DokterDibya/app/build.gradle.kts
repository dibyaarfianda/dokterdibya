plugins {
    id 'com.android.application'
    id 'org.jetbrains.kotlin.android'
    id 'kotlin-kapt'
    id 'dagger.hilt.android.plugin'
    id 'com.google.gms.google-services'
    id 'kotlin-parcelize'
}

android {
    namespace 'com.dokterdibya.app'
    compileSdk 34

    defaultConfig {
        applicationId "com.dokterdibya.app"
        minSdk 24
        targetSdk 34
        versionCode 1
        versionName "1.0.0"

        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary true
        }

        // API Configuration
        buildConfigField "String", "BASE_URL", "\"https://dokterdibya.com/api/\""
        buildConfigField "String", "SOCKET_URL", "\"https://dokterdibya.com\""
        buildConfigField "String", "BASE_URL_DEBUG", "\"http://10.0.2.2:3000/api/\""
        buildConfigField "String", "SOCKET_URL_DEBUG", "\"http://10.0.2.2:3000\""
    }

    buildTypes {
        release {
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
            buildConfigField "String", "BASE_URL", "\"https://dokterdibya.com/api/\""
            buildConfigField "String", "SOCKET_URL", "\"https://dokterdibya.com\""
        }
        debug {
            minifyEnabled false
            buildConfigField "String", "BASE_URL", "\"http://10.0.2.2:3000/api/\""
            buildConfigField "String", "SOCKET_URL", "\"http://10.0.2.2:3000\""
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = '17'
    }

    buildFeatures {
        compose true
        buildConfig true
    }

    composeOptions {
        kotlinCompilerExtensionVersion '1.5.3'
    }

    packaging {
        resources {
            excludes += '/META-INF/{AL2.0,LGPL2.1}'
        }
    }
}

dependencies {
    // Core Android
    implementation 'androidx.core:core-ktx:1.12.0'
    implementation 'androidx.lifecycle:lifecycle-runtime-ktx:2.6.2'
    implementation 'androidx.activity:activity-compose:1.8.1'
    implementation 'androidx.lifecycle:lifecycle-viewmodel-compose:2.6.2'
    implementation 'androidx.lifecycle:lifecycle-runtime-compose:2.6.2'

    // Jetpack Compose
    implementation platform('androidx.compose:compose-bom:2023.10.01')
    implementation 'androidx.compose.ui:ui'
    implementation 'androidx.compose.ui:ui-graphics'
    implementation 'androidx.compose.ui:ui-tooling-preview'
    implementation 'androidx.compose.material3:material3:1.1.2'
    implementation 'androidx.compose.material:material-icons-extended'
    debugImplementation 'androidx.compose.ui:ui-tooling'
    debugImplementation 'androidx.compose.ui:ui-test-manifest'

    // Navigation
    implementation 'androidx.navigation:navigation-compose:2.7.5'
    implementation 'androidx.hilt:hilt-navigation-compose:1.1.0'

    // Networking
    implementation 'com.squareup.retrofit2:retrofit:2.9.0'
    implementation 'com.squareup.retrofit2:converter-gson:2.9.0'
    implementation 'com.squareup.okhttp3:okhttp:4.12.0'
    implementation 'com.squareup.okhttp3:logging-interceptor:4.12.0'

    // Socket.IO
    implementation ('io.socket:socket.io-client:2.1.0') {
        exclude group: 'org.json', module: 'json'
    }

    // Room Database
    implementation 'androidx.room:room-runtime:2.6.0'
    implementation 'androidx.room:room-ktx:2.6.0'
    kapt 'androidx.room:room-compiler:2.6.0'

    // Dependency Injection - Hilt
    implementation "com.google.dagger:hilt-android:2.48"
    kapt "com.google.dagger:hilt-android-compiler:2.48"

    // Coroutines
    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'
    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.7.3'

    // DataStore
    implementation 'androidx.datastore:datastore-preferences:1.0.0'
    implementation 'androidx.security:security-crypto:1.1.0-alpha06'

    // WorkManager
    implementation 'androidx.work:work-runtime-ktx:2.9.0'

    // Image Loading - Coil
    implementation 'io.coil-kt:coil-compose:2.5.0'

    // Firebase
    implementation platform('com.google.firebase:firebase-bom:32.5.0')
    implementation 'com.google.firebase:firebase-messaging'
    implementation 'com.google.firebase:firebase-analytics'
    implementation 'com.google.firebase:firebase-crashlytics'
    implementation 'com.google.android.gms:play-services-auth:20.7.0'

    // Accompanist
    implementation 'com.google.accompanist:accompanist-permissions:0.32.0'
    implementation 'com.google.accompanist:accompanist-systemuicontroller:0.32.0'
    implementation 'com.google.accompanist:accompanist-pager:0.32.0'
    implementation 'com.google.accompanist:accompanist-pager-indicators:0.32.0'
    implementation 'com.google.accompanist:accompanist-swiperefresh:0.32.0'

    // Markdown Rendering
    implementation 'io.noties.markwon:core:4.6.2'
    implementation 'io.noties.markwon:image-coil:4.6.2'

    // Splash Screen
    implementation 'androidx.core:core-splashscreen:1.0.1'

    // Biometric
    implementation 'androidx.biometric:biometric:1.1.0'

    // Gson
    implementation 'com.google.code.gson:gson:2.10.1'

    // Lottie Animations
    implementation 'com.airbnb.android:lottie-compose:6.1.0'

    // Paging
    implementation 'androidx.paging:paging-runtime-ktx:3.2.1'
    implementation 'androidx.paging:paging-compose:3.2.1'

    // Charts
    implementation 'com.github.PhilJay:MPAndroidChart:v3.1.0'

    // PDF Viewer
    implementation 'com.github.barteksc:android-pdf-viewer:3.2.0-beta.1'

    // Testing
    testImplementation 'junit:junit:4.13.2'
    testImplementation 'org.mockito:mockito-core:5.5.0'
    testImplementation 'org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3'
    androidTestImplementation 'androidx.test.ext:junit:1.1.5'
    androidTestImplementation 'androidx.test.espresso:espresso-core:3.5.1'
    androidTestImplementation platform('androidx.compose:compose-bom:2023.10.01')
    androidTestImplementation 'androidx.compose.ui:ui-test-junit4'
}
