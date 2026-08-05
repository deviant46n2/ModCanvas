#!/bin/bash
set -e

MOD_DIR="/home/deviant/Projects/ModCanvas/workbench-companion-forge"
BUILD_DIR="$MOD_DIR/build-manual"
SRC_DIR="$MOD_DIR/src/main/java"
RESOURCES_DIR="$MOD_DIR/src/main/resources"
OUTPUT_JAR="$MOD_DIR/build/libs/workbench-companion-1.0.0.jar"

PRISM_LIBS="$HOME/.local/share/PrismLauncher/libraries"

FORGE_UNIVERSAL="$PRISM_LIBS/net/minecraftforge/forge/1.20.1-47.4.10/forge-1.20.1-47.4.10-universal.jar"
FML_CORE="$PRISM_LIBS/net/minecraftforge/fmlcore/1.20.1-47.4.10/fmlcore-1.20.1-47.4.10.jar"
FML_LOADER="$PRISM_LIBS/net/minecraftforge/fmlloader/1.20.1-47.4.10/fmlloader-1.20.1-47.4.10.jar"
JAVA_FML="$PRISM_LIBS/net/minecraftforge/javafmllanguage/1.20.1-47.4.10/javafmllanguage-1.20.1-47.4.10.jar"
EVENTBUS="$PRISM_LIBS/net/minecraftforge/eventbus/6.0.5/eventbus-6.0.5.jar"
MINECRAFT="$PRISM_LIBS/com/mojang/minecraft/1.20.1/minecraft-1.20.1-client.jar"
SLF4J="$PRISM_LIBS/org/slf4j/slf4j-api/2.0.9/slf4j-api-2.0.9.jar"
LOG4J_API="$PRISM_LIBS/org/apache/logging/log4j/log4j-api/2.22.1/log4j-api-2.22.1.jar"
MERGETOOL="$PRISM_LIBS/net/minecraftforge/mergetool/1.1.5/mergetool-1.1.5-api.jar"
BRIGADIER="$PRISM_LIBS/com/mojang/brigadier/1.1.8/brigadier-1.1.8.jar"
AUTHLIB="$PRISM_LIBS/com/mojang/authlib/3.11.50/authlib-3.11.50.jar"
DATAFIXERUPPER="$PRISM_LIBS/com/mojang/datafixerupper/6.0.8/datafixerupper-6.0.8.jar"

JAVA_WS_JAR=$(find ~/.gradle/caches -name "Java-WebSocket-1.5.4.jar" 2>/dev/null | head -1)
GSON_JAR=$(find ~/.gradle/caches -name "gson-2.10.1.jar" 2>/dev/null | head -1)

if [ -z "$JAVA_WS_JAR" ] || [ -z "$GSON_JAR" ]; then
    echo "Downloading dependencies..."
    mkdir -p "$MOD_DIR/deps"
    if [ -z "$JAVA_WS_JAR" ]; then
        curl -sL "https://repo1.maven.org/maven2/org/java-websocket/Java-WebSocket/1.5.4/Java-WebSocket-1.5.4.jar" -o "$MOD_DIR/deps/Java-WebSocket-1.5.4.jar"
        JAVA_WS_JAR="$MOD_DIR/deps/Java-WebSocket-1.5.4.jar"
    fi
    if [ -z "$GSON_JAR" ]; then
        curl -sL "https://repo1.maven.org/maven2/com/google/code/gson/gson/2.10.1/gson-2.10.1.jar" -o "$MOD_DIR/deps/gson-2.10.1.jar"
        GSON_JAR="$MOD_DIR/deps/gson-2.10.1.jar"
    fi
fi

CLASSPATH="$FORGE_UNIVERSAL:$FML_CORE:$FML_LOADER:$JAVA_FML:$EVENTBUS:$MINECRAFT:$SLF4J:$LOG4J_API:$MERGETOOL:$BRIGADIER:$AUTHLIB:$DATAFIXERUPPER:$JAVA_WS_JAR:$GSON_JAR"

echo "=== Classpath ==="
echo "$CLASSPATH" | tr ':' '\n'

echo ""
echo "=== Building ==="
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/classes"

javac -d "$BUILD_DIR/classes" \
    -cp "$CLASSPATH" \
    --release 17 \
    $(find "$SRC_DIR" -name "*.java")

echo "=== Copying resources ==="
cp -r "$RESOURCES_DIR"/* "$BUILD_DIR/classes/"

echo "=== Packaging JAR ==="
mkdir -p "$(dirname "$OUTPUT_JAR")"
cd "$BUILD_DIR/classes"
jar cfm "$OUTPUT_JAR" "$MOD_DIR/MANIFEST.MF" .

echo "=== Done ==="
ls -la "$OUTPUT_JAR"
