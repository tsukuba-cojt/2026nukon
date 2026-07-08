# Study Glass

Tauri 2 based Metaglass vision prompt app for iPhone and Android.

## Current scope

- Shared UI built with Vite + TypeScript (Japanese, light-blue theme), glasses-only: the phone camera is not used
- Metaglass photo watch mode: new photos imported from the Ray-Ban Meta glasses are detected in the phone photo library and answered automatically with the saved prompt (`tauri-plugin-photo-inbox`)
- The main stage shows the latest photo received from the glasses
- Tauri Rust command that sends the image and arbitrary prompt to an LLM
- Math-readable default capture path using 1600px max edge, JPEG 0.8, high-detail image input, short output limits, and request timeouts
- Answer speech via the `metaglass-speak` browser event with Web Speech fallback
- Reference uploads for PDF, text/code/data files, images, and modern Office/OpenDocument files
- OpenAI Responses API support through the server-side API proxy
- Android project generated under `src-tauri/gen/android`
- iOS project generated under `src-tauri/gen/apple`

## Run

```bash
pnpm install
pnpm dev
```

Browser preview: `http://localhost:1420/`

## Production API

The app should not ship an OpenAI API key. Run the API proxy from the repository
root instead. Default backend is the Codex agent (`codex login` once, no API
key billing); see `../api/README.md` for the OpenAI Responses API alternative:

```bash
cd ../api
pnpm install
STUDY_GLASS_BACKEND=codex \
STUDY_GLASS_CLIENT_TOKEN="$(openssl rand -hex 32)" \
ALLOWED_ORIGIN=https://your-app.example.com \
pnpm start
```

Then point the Tauri app at the proxy:

```bash
STUDY_GLASS_API_URL=https://your-api.example.com \
STUDY_GLASS_CLIENT_TOKEN=change-me \
pnpm tauri dev
```

For release Android/iOS builds, `STUDY_GLASS_API_URL` must be set to the deployed HTTPS API and `STUDY_GLASS_CLIENT_TOKEN` must be set at build time. Release mobile builds intentionally fail fast if they would point at `localhost`.

## Tauri

```bash
pnpm tauri dev
pnpm android:dev
pnpm ios:dev
```

If mobile targets need to be regenerated:

```bash
pnpm android:init
pnpm ios:init
```

## Metaglass (Ray-Ban Meta) end-to-end flow

The glasses have no public realtime capture API, so the pipeline rides on the
official auto-import path:

1. Press the capture button on the Ray-Ban Meta glasses.
2. The Meta AI app syncs the photo to the phone photo library. Enable
   **Settings → Media → Auto-import (自動インポート)** in the Meta AI app so this
   happens without opening the app.
3. Study Glass watches the photo library (`tauri-plugin-photo-inbox`:
   `ContentObserver` on Android, `PHPhotoLibraryChangeObserver` on iOS). Any new
   photo that appears while **Metaglass photo watch** is on is sent to the LLM
   proxy together with the prompt saved in the app.
4. The answer is spoken with TTS. Because the glasses are connected as the
   phone's Bluetooth audio device, the speech plays from the glasses' speakers.

Turn the mode on with the **Start watching** button in the settings card. The
first activation asks for photo library permission (`READ_MEDIA_IMAGES` /
`NSPhotoLibraryUsageDescription`). While watching, every new photo in the
library is treated as a glasses capture, so screenshots also trigger it — keep
that in mind during demos.

### Desktop simulation without glasses

On desktop the watcher polls a folder instead of the photo library:
`~/Pictures/metaglass-inbox` by default, overridable with
`STUDY_GLASS_INBOX_DIR`. Start watching, then drop a JPEG/PNG into the folder
to simulate a glasses capture end-to-end.

## Notes

- The Metaglass SDK integration point is the cancellable `metaglass-speak` output event in `src/main.ts`; photo input comes from the photo library watcher.
- Reference files are handled locally before the request: PDF text is extracted for the first 20 pages, `.docx`/`.pptx`/`.xlsx` and OpenDocument files are read from their XML text, images are attached as image inputs, and unknown formats are passed as metadata instead of pretending to be semantically supported.
- `STUDY_GLASS_CLIENT_TOKEN` is a deployment guard, not user identity. Public production should add real user auth, per-user quotas, audit logs, and abuse monitoring before broad release.
