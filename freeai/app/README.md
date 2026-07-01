# Study Glass

Tauri 2 based Metaglass vision prompt app for iPhone and Android.

## Current scope

- Shared UI built with Vite + TypeScript
- Camera preview and JPEG frame capture from the active WebView camera
- Button-triggered capture flow for the on-screen button, Space key, and a `metaglass-button-pressed` browser event
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
root instead:

```bash
cd ../api
cp .env.example .env
OPENAI_API_KEY=sk-... \
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

## Notes

- The Metaglass SDK integration points are the `metaglass-button-pressed` input event and the cancellable `metaglass-speak` output event in `src/main.ts`.
- Reference files are handled locally before the request: PDF text is extracted for the first 20 pages, `.docx`/`.pptx`/`.xlsx` and OpenDocument files are read from their XML text, images are attached as image inputs, and unknown formats are passed as metadata instead of pretending to be semantically supported.
- `STUDY_GLASS_CLIENT_TOKEN` is a deployment guard, not user identity. Public production should add real user auth, per-user quotas, audit logs, and abuse monitoring before broad release.
