#!/bin/bash
# Patches iOS build scripts that break when the project path contains spaces.
# Runs automatically via `postinstall`, and can be re-run manually with `npm run fix-ios`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$SCRIPT_DIR/../ios"

# ── 1. expo-constants/scripts/get-app-config-ios.sh (node_modules) ───────────
# basename $PROJECT_DIR (unquoted) word-splits on spaces → returns "Projets"
# instead of "Pods" → script exits early without generating the manifest.
GET_APP_CONFIG="$SCRIPT_DIR/../node_modules/expo-constants/scripts/get-app-config-ios.sh"
if [[ -f "$GET_APP_CONFIG" ]]; then
  sed -i '' 's|PROJECT_DIR_BASENAME=$(basename $PROJECT_DIR)|PROJECT_DIR_BASENAME=$(basename "$PROJECT_DIR")|g' "$GET_APP_CONFIG"
  echo "✓ Patched expo-constants/scripts/get-app-config-ios.sh"
fi

# ── 2. Pods/Pods.xcodeproj — expo-constants build phase invocation ────────────
# bash -l -c "$PODS_TARGET_SRCROOT/…" word-splits the unquoted expanded path.
PODS_PBXPROJ="$IOS_DIR/Pods/Pods.xcodeproj/project.pbxproj"
if [[ -f "$PODS_PBXPROJ" ]]; then
  sed -i '' \
    's|bash -l -c \\"$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\"|bash -l -c \\"\\\\\\\"$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\\\\\"\"|g' \
    "$PODS_PBXPROJ"
  echo "✓ Patched Pods/Pods.xcodeproj/project.pbxproj"
fi

# ── 3. FirstSign.xcodeproj — Bundle React Native code and images ──────────────
# Backtick-executed NODE_BINARY path is unquoted → word-splits on spaces.
MAIN_PBXPROJ="$IOS_DIR/FirstSign.xcodeproj/project.pbxproj"
if [[ -f "$MAIN_PBXPROJ" ]]; then
  perl -i -0pe \
    's|`\\"\\$NODE_BINARY\\" --print \\"require\('"'"'path'"'"'\)\.dirname\(require\.resolve\('"'"'react-native/package\.json'"'"'\)\) \+ '"'"'/scripts/react-native-xcode\.sh'"'"'\\"` |_RN_XCODE_SH=`\\"\\$NODE_BINARY\\" --print \\"require('"'"'path'"'"').dirname(require.resolve('"'"'react-native/package.json'"'"')) + '"'"'/scripts/react-native-xcode.sh'"'"'\\"`\\n\\"\\$_RN_XCODE_SH\\" |g' \
    "$MAIN_PBXPROJ" 2>/dev/null || true
  echo "✓ Patched FirstSign.xcodeproj/project.pbxproj"
fi

echo "Done."
