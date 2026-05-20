# nukon

「撮ることそれ自体を楽しめる専用機」としての満足感と、「撮ったらすぐ手元の他のデバイスで扱える」現代的な利便性を両立させた、自作のトイカメラ。

HW（基板・筐体）から OS、ファームウェア、サーバ、スマホアプリまで、すべて自分たちの手で作る。

## メンバー

- 小松琢磨
- 中村相馬

## システム構成

```
 ┌────────────────┐                  ┌──────────────┐
 │  サブモジュール  │◀───── BLE ──────▶│              │
 │  (ESP32 / Rust)│  Shutter/Nav     │              │
 └────────────────┘                  │              │
                                     │              │       ┌────────────────┐
 ┌────────────────┐                  │   カメラ      │  Wi-Fi│                │
 │   スマホアプリ   │◀───── BLE ──────▶│ (Pi5 / Rust) │──────▶│   サーバ        │
 │    (Tauri)     │  CaptureDone等   │              │       │ (Go + Gin)     │
 └───────┬────────┘                  └──────────────┘       │                │
         │                                                  │  ┌──────────┐  │
         │            Wi-Fi (REST/JSON)                     │  │PostgreSQL│  │
         └─────────────────────────────────────────────────▶│  └──────────┘  │
                                                            │  ┌──────────┐  │
                                                            │  │  MinIO   │  │
                                                            │  └──────────┘  │
                                                            └────────────────┘
```

- **メインカメラ**: Raspberry Pi 5 + Arducam 64MP AF + EVF + タッチパネル + 自作 PMIC ボード + 自作筐体
- **サブモジュール**: ESP32 ベースの小型リモコン（2 段シャッター + 十字キー）
- **サーバ**: Go + Gin。画像と画像メタデータを保管
- **アプリ**: Tauri 2.x（Mac / Windows / iOS / Android）。閲覧・レタッチ・SNS 投稿

詳細は [docs/要求仕様.md](docs/要求仕様.md) を参照。

## 技術スタック

| 領域 | 採用技術 |
|---|---|
| カメラ HW | Raspberry Pi 5 / Arducam 64MP AF / 自作 PMIC ボード / 自作筐体（3D プリント） |
| カメラ OS | カスタム Raspberry Pi OS（起動 10 秒以内、電源断耐性） |
| カメラ FW | Rust + libcamera + bluer（BLE Peripheral） |
| サブモジュール | ESP32 + Embedded Rust（`esp-hal` / `esp32-nimble`） |
| サーバ | Go + Gin + GORM + PostgreSQL + MinIO |
| アプリ | Tauri 2.x + React + TypeScript + Vite + SQLite + MapLibre GL JS |
| 通信 | BLE（カメラ ⇔ サブ／スマホ）/ Wi-Fi REST + JSON（カメラ／アプリ ⇔ サーバ） |
| 認証 | X (Twitter) OAuth 2.0 + PKCE |

## リポジトリ構成

```
2026nukon/
├── docs/              # 要求仕様書・タスクリスト・設計メモ
├── server/            # Go + Gin API サーバ
├── camera/            # Raspberry Pi 側 Rust FW
├── submodule/         # ESP32 側 Embedded Rust FW
├── app/               # Tauri 2.x + React アプリ
├── os/                # Raspberry Pi OS カスタムイメージ
├── hw/                # PCB・筐体・BOM・製造メモ
└── README.md
```

> 各サブディレクトリの詳細構成は [docs/要求仕様.md §10.10](docs/要求仕様.md) を参照。

## ドキュメント

- [要求仕様書](docs/要求仕様.md) — 機能要件・非機能要件・データ仕様・API・BLE プロトコルなど
- [要件定義書 v1](docs/requirements-1.md) — 背景・目的・スコープ
- [タスクリスト](docs/task_list.md) — フェーズ別の実装タスク
- [BLE UUID 定義](docs/ble-uuid.md) — GATT Service / Characteristic UUID の固定値
- [BLE ペイロード仕様](docs/ble-payload.md) — BLE の固定長バイナリ仕様
- [うなぎ定義書](docs/unagi.md) — 約束破りペナルティのルール

## 開発の進め方

1. **フェーズ 1**: メインモジュールの基板設計・筐体作成（土台）
2. **フェーズ 2**: 基板上に載せるカスタム OS の構築
3. **フェーズ 3 以降**: カメラ FW、サブモジュール、サーバ、アプリの実装

詳細マイルストーンと各タスクは [docs/task_list.md](docs/task_list.md) を参照。

## タスク管理

このリポジトリのタスクは Addness にも登録している。最新の担当・完了状態・階層は Addness を確認する。

```sh
/Users/bearwash/.local/bin/addness goal search "nukon"
/Users/bearwash/.local/bin/addness goal tree <goal-id>
```

ローカルの [docs/task_list.md](docs/task_list.md) は設計メモ兼バックアップとして扱い、作業が終わったら Addness 側の該当タスクも完了にする。

## 非機能目標

- 電源 ON から撮影可能まで **10 秒以内**
- シャッター全押しから記録完了まで **300ms 以下**
- メインモジュール本体重量 **700g 以下**（バッテリー込み）
- 1 充電で撮影 **500 枚以上** または連続使用 **4 時間以上**
