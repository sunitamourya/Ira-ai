plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.ira.ai"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.ira.ai"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }
}

dependencies {
    implementation(
        "com.google.ai.edge.litertlm:litertlm-android:0.18.0"
    )
}
