#!/usr/bin/env bash
# 构建安卓安装包：bash tools/build-apk.sh  ->  dist/模型行情.apk
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
BT="$HOME/tools/android-build-tools/android-15"
JDK="/c/Program Files/Microsoft/jdk-21.0.8.9-hotspot/bin"
AJAR="$ROOT/toolchain/android-35/android.jar"
B="$ROOT/build"
# DEBUG=1 -> 打成可调试包（manifest 加 debuggable，开启 WebView CDP），输出 dist/modelhub-debug.apk
DEBUG="${DEBUG:-0}"
if [ "$DEBUG" = "1" ]; then
  APK_NAME="modelhub-debug.apk"
  AAPT_FLAGS="--debug-mode"
  echo "[debug] 构建可调试包：$APK_NAME"
else
  APK_NAME="modelhub.apk"
  AAPT_FLAGS=""
fi
# 版本号从仓库根的 VERSION 文件读：1.1.0 -> versionName=1.1.0, versionCode=10100
if [ -z "${VERSION:-}" ] && [ -f VERSION ]; then VERSION="$(tr -d ' \r\n' < VERSION)"; fi
VER="${VERSION:-1.0.0}"
IFS=. read -r V1 V2 V3 <<< "$VER"
VCODE=$(( ${V1:-1} * 10000 + ${V2:-0} * 100 + ${V3:-0} ))
echo "[版本] $VER (code $VCODE)"

rm -rf "$B"; mkdir -p "$B/classes" "$B/assets" "$ROOT/dist"

echo "[1/6] 编译资源"
"$BT/aapt2.exe" compile --dir android/res -o "$B/res.zip"

echo "[2/6] 复制网页文件"
mkdir -p "$B/assets/web"
cp -r web/index.html web/css web/js web/seed web/assets "$B/assets/web/"
# 像素冒险（web/game/）是独立整屏页面，单独整目录拷进 assets
if [ -d web/game ]; then cp -r web/game "$B/assets/web/game"; fi

echo "[3/6] 打包清单和资源"
"$BT/aapt2.exe" link -o "$B/base.apk" -I "$AJAR" --manifest android/AndroidManifest.xml \
  --min-sdk-version 24 --target-sdk-version 31 --version-code "$VCODE" --version-name "$VER" \
  $AAPT_FLAGS -A "$B/assets" -R "$B/res.zip" --auto-add-overlay

echo "[4/6] 编译 Java"
"$JDK/javac.exe" --release 8 -Xlint:-options -encoding UTF-8 -cp "$AJAR" -d "$B/classes" android/src/app/modelhub/*.java
(cd "$B/classes" && "$JDK/jar.exe" cf ../classes.jar app)
"$JDK/java.exe" -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 --release --min-api 24 --lib "$AJAR" --output "$B" "$B/classes.jar"
(cd "$B" && "$BT/aapt.exe" add base.apk classes.dex >/dev/null)

echo "[5/6] 修正路径、对齐并签名"
python tools/fix-apk-paths.py "$(cygpath -w "$B/base.apk")" "$(cygpath -w "$B/fixed.apk")"
"$BT/zipalign.exe" -f -p 4 "$B/fixed.apk" "$B/aligned.apk"
KS="$ROOT/tools/debug.keystore"
if [ ! -f "$KS" ]; then
  "$JDK/keytool.exe" -genkeypair -keystore "$(cygpath -w "$KS")" -storepass modelhub -keypass modelhub -alias modelhub \
    -keyalg RSA -keysize 2048 -validity 36500 -dname "CN=ModelHub" >/dev/null 2>&1
fi
"$JDK/java.exe" -jar "$BT/lib/apksigner.jar" sign --ks "$KS" --ks-pass pass:modelhub --key-pass pass:modelhub --out "$ROOT/dist/$APK_NAME" "$B/aligned.apk"

echo "[6/6] 完成"
ls -la "$ROOT/dist/$APK_NAME"
