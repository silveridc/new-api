#!/usr/bin/env bash
# 一次构建两套前端并放进 web/dist：classic 挂在根路径，新版挂在 /next/（产物 web/dist/next）。
# 用法：仓库根目录执行 ./build-both-frontends.sh，然后 go build 得到的二进制两套界面都带。
# 顺序不能颠倒：build-classic.sh 会清空 web/dist，rsbuild 只清理自己的 dist/next。
# VITE_UI_BASE 不带前导斜杠，避免 Git Bash 把 /next/ 当路径改写。
set -e
cd "$(dirname "$0")"

./build-classic.sh

cd web
BUILD_ENV="VITE_UI_BASE=next UI_DIST_DIR=dist/next"
if command -v bun >/dev/null 2>&1; then
  env $BUILD_ENV bun run build
else
  env $BUILD_ENV npm run build
fi

echo "web/dist 已包含 classic（根路径）与新版（/next/）两套前端产物，接下来 go build 即可。"
