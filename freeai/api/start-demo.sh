#!/bin/bash
# Study Glass デモ用: APIサーバー + Cloudflareトンネルを起動する。
# 使い方:  cd api && ./start-demo.sh
# 表示された https://xxxx.trycloudflare.com をアプリの「APIサーバー」欄に入力する。
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo ".env がありません。.env.example をコピーしてトークンを設定してください。" >&2
  exit 1
fi

if ! lsof -ti :8787 >/dev/null 2>&1; then
  echo "APIサーバーを起動します (backend: codex)..."
  nohup node --env-file=.env server.mjs > server.log 2>&1 &
  sleep 1
fi
curl -sf http://127.0.0.1:8787/health >/dev/null && echo "APIサーバー: OK"

echo "トンネルを起動します（URLは毎回変わります）..."
exec cloudflared tunnel --url http://localhost:8787
