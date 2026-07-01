# Study Glass

Tauri 2 based Metaglass vision prompt app for iPhone and Android.

## Current scope

- Shared UI built with Vite + TypeScript
- Camera preview and JPEG frame capture from the active WebView camera
- Button-triggered capture flow for the on-screen button, Space key, and a `metaglass-button-pressed` browser event
- Tauri Rust command that sends the image and arbitrary prompt to an LLM
- Fast response path using low-detail image input, compressed frames, short output limits, and request timeouts
- Answer speech via the `metaglass-speak` browser event with Web Speech fallback
- Reference uploads for PDF, text/code/data files, images, and modern Office/OpenDocument files
- OpenAI Responses API support with `OPENAI_API_KEY` or the in-app API key field
- Local fallback response when no API key is configured
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
root instead:

```bash
cd api
cp .env.example .env
OPENAI_API_KEY=sk-... STUDY_GLASS_CLIENT_TOKEN=change-me pnpm start
```

Then point the Tauri app at the proxy:

```bash
STUDY_GLASS_API_URL=https://your-api.example.com \
STUDY_GLASS_CLIENT_TOKEN=change-me \
pnpm tauri dev
```

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

## Notes

- The Metaglass SDK integration points are the `metaglass-button-pressed` input event and the cancellable `metaglass-speak` output event in `src/main.ts`.
- Reference files are handled locally before the request: PDF text is extracted for the first 20 pages, `.docx`/`.pptx`/`.xlsx` and OpenDocument files are read from their XML text, images are attached as image inputs, and unknown formats are passed as metadata.
- `STUDY_GLASS_CLIENT_TOKEN` is a simple deployment guard. For public production, replace it with real user auth, per-user quotas, audit logs, and abuse monitoring.
