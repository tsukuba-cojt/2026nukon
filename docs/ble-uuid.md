# BLE UUID 定義

この文書は nukon の BLE GATT UUID を固定値として管理する。UUID はすべて v4 で生成し、カメラ FW、サブモジュール FW、アプリで同じ値を使う。

## Camera Control Service

| 種別 | 名前 | UUID |
|---|---|---|
| Service | Camera Control Service | `329264d2-5b05-475f-bfea-a905a9dbce54` |
| Characteristic | Shutter Half | `2f04fc94-32dd-42b9-b83d-fd980d583d1c` |
| Characteristic | Shutter Full | `860256d6-3aa1-412b-ac2a-0f14dda9c579` |
| Characteristic | Navigation Key | `143e3946-1a6a-45c1-8e7e-277cf9190a4a` |
| Characteristic | Capture Done | `68b930e4-efc9-47cc-b1f5-06885b5a4f20` |
| Characteristic | Battery Status | `7eb075b9-7e0a-4d83-b74c-5353b6bf3f61` |
| Characteristic | Storage Status | `208a1ec7-2fac-45e2-a0aa-a66f18306a7c` |
| Characteristic | Submodule Battery | `cd9699d6-7160-4323-980b-fe21079d8418` |

## 実装メモ

- カメラは BLE Peripheral として Camera Control Service を公開する。
- スマホアプリとサブモジュールは Central として接続する。
- 画像本体やトークンなどの秘匿情報は BLE では送らない。
- ペイロード仕様は [ble-payload.md](ble-payload.md) を参照する。
