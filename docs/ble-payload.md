# BLE ペイロード仕様

この文書は [要求仕様.md §10.7](要求仕様.md#107-ble-プロトコル) を実装に流用しやすい形に整理したもの。

## 共通

- エンディアン: 複数バイト整数を追加する場合は little endian とする。
- UUID: `capture_id` は UUID v4 の 16 バイト表現を使う。文字列では送らない。
- MTU: デフォルト MTU 23 バイトでも送れる固定長ペイロードを基本にする。
- 値の範囲外を受信した場合、受信側は無視してログに残す。

## Characteristics

| Characteristic | 方向 | Properties | 長さ | Payload |
|---|---:|---|---:|---|
| Shutter Half | Central -> Camera | Write | 1 byte | `0x00` release, `0x01` half-press |
| Shutter Full | Central -> Camera | Write | 1 byte | `0x01` trigger |
| Navigation Key | Central -> Camera | Write | 1 byte | 下表参照 |
| Capture Done | Camera -> Central | Notify | 17 bytes | `status` 1 byte + `capture_id` 16 bytes |
| Battery Status | Camera -> Central | Read, Notify | 1 byte | `0..100` percent |
| Storage Status | Camera -> Central | Read, Notify | 1 byte | `0..100` percent |
| Submodule Battery | Central -> Camera | Write | 1 byte | `0..100` percent |

## Navigation Key

| 値 | 意味 |
|---:|---|
| `0x00` | release |
| `0x01` | up |
| `0x02` | down |
| `0x03` | left |
| `0x04` | right |
| `0x05` | ok |
| `0x06` | menu |
| `0x07` | playback |

## Capture Done

| Offset | 長さ | フィールド | 値 |
|---:|---:|---|---|
| 0 | 1 | `status` | `0x00` success, `0x01` failed |
| 1 | 16 | `capture_id` | UUID v4 bytes |

送信タイミング:

- 撮影完了時に 1 回 Notify する。
- 失敗時も `status = 0x01` で Notify する。
- スマホアプリは Notify 受信時点の GPS を取得し、`capture_id` と紐付けて SQLite に保存する。

## Periodic Status Notify

- Battery Status と Storage Status は接続中 10 秒ごとに Notify する。
- 値が変化していない場合も送信する。
- 取得できない場合は直近の有効値を維持する。起動直後など有効値がない場合は `0` を返す。
