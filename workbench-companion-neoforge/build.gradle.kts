plugins {
    id("java")
    id("net.neoforged.gradle") version "1.0.0"
    id("com.github.johnrengelman.shadow") version "8.1.1"
}

group = "com.modcanvas.companion"
version = "1.0.0"

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}

repositories {
    mavenCentral()
    maven("https://maven.neoforged.net")
}

dependencies {
    minecraft("com.mojang:minecraft:1.20.1")
    mappings("net.neoforged:forge:1.20.1-48.1.0:recomp")

    // NeoForge API
    implementation(fg.deobf("net.neoforged:neoforge:1.20.1-48.1.0"))

    // WebSocket client
    implementation("org.java-websocket:Java-WebSocket:1.5.4")

    // JSON parsing
    implementation("com.google.code.gson:gson:2.10.1")

    // Testing
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.2")
}

neoforge {
    mappingsChannel = "official"
    mappingsVersion = "1.20.1"
}

tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
}

// Shadow plugin - relocate WebSocket & Gson to avoid conflicts
tasks.shadowJar {
    archiveClassifier.set("")
    relocate("org.java_websocket", "com.modcanvas.companion.shaded.org.java_websocket")
    relocate("com.google.gson", "com.modcanvas.companion.shaded.com.google.gson")

    manifest {
        attributes(
            "Implementation-Title" to "Workbench Companion",
            "Implementation-Version" to version,
            "Main-Class" to "com.modcanvas.companion.WorkbenchCompanionForge",
            "NeoForge-Mod" to "META-INF/neoforge.mods.toml"
        )
    }
}

tasks.build {
    dependsOn(tasks.shadowJar)
}

// Testing
tasks.test {
    useJUnitPlatform()
}