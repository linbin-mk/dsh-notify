#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
sdk_path=$(xcrun --sdk macosx --show-sdk-path)
build_dir="$project_dir/.native-build"
module_cache="$build_dir/module-cache"

mkdir -p "$build_dir" "$module_cache"
swiftc "$project_dir/native/MenuBar.swift" \
  -parse-as-library -O \
  -target x86_64-apple-macos13.0 \
  -sdk "$sdk_path" \
  -module-cache-path "$module_cache" \
  -o "$build_dir/dsh-notify-menubar-x86_64"
swiftc "$project_dir/native/MenuBar.swift" \
  -parse-as-library -O \
  -target arm64-apple-macos13.0 \
  -sdk "$sdk_path" \
  -module-cache-path "$module_cache" \
  -o "$build_dir/dsh-notify-menubar-arm64"
lipo -create \
  "$build_dir/dsh-notify-menubar-x86_64" \
  "$build_dir/dsh-notify-menubar-arm64" \
  -output "$project_dir/native/dsh-notify-menubar"
chmod 755 "$project_dir/native/dsh-notify-menubar"
