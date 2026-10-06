#!/usr/bin/env bash
# 构建旧版前端（web/classic）并把产物放入 web/dist，供 go:embed 打进二进制。
# 用法：在仓库根目录执行 ./build-classic.sh，然后 go build 得到的就是旧版界面。
# 注意：Dockerfile 与上游脚本构建的是 web/（新版前端），会覆盖 web/dist，之后重新跑本脚本即可。
set -e
cd "$(dirname "$0")"

cd web/classic
if command -v bun >/dev/null 2>&1; then
  bun run build
else
  npm run build
fi

cd ..
rm -rf dist
cp -r classic/dist dist
echo "web/dist 已更新为旧版前端构建产物，接下来 go build 即可。"
