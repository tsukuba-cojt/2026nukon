# Study Glass API

Server-side answer proxy for the Study Glass mobile app. Two interchangeable
backends produce the answer for a captured photo + prompt:

- **codex** (default when no API key is set): runs the OpenAI Codex agent via
  [`@openai/codex-sdk`](https://developers.openai.com/codex/sdk) using the
  machine's ChatGPT login — run `codex login` once on the server machine. No
  API key billing. The captured photo is passed as a `local_image` input and
  the agent runs with `sandbox_mode=read-only` in a throwaway temp directory.
- **openai**: calls the OpenAI Responses API with `OPENAI_API_KEY`.

## Run

```bash
cp .env.example .env
pnpm install
STUDY_GLASS_BACKEND=codex \
STUDY_GLASS_CLIENT_TOKEN="$(openssl rand -hex 32)" \
pnpm start
```

Required environment:

- `STUDY_GLASS_CLIENT_TOKEN` or `STUDY_GLASS_CLIENT_TOKENS`: bearer token guard for app requests.
- `ALLOWED_ORIGIN`: concrete browser origin when `NODE_ENV=production`.
- `OPENAI_API_KEY`: only when `STUDY_GLASS_BACKEND=openai`.

Optional environment:

- `STUDY_GLASS_BACKEND`: `codex` or `openai`. Defaults to `codex` unless `OPENAI_API_KEY` is set.
- `CODEX_MODEL`: Codex model override; defaults to the Codex CLI default.
- `CODEX_TIMEOUT_MS`: per-request Codex timeout, defaults to `90000`.
- `OPENAI_MODEL_DEFAULT`: defaults to `gpt-4.1-mini` (openai backend).
- `TRUST_PROXY=true`: only when a reverse proxy safely sets `X-Forwarded-For`.
- `STUDY_GLASS_ALLOW_UNAUTHENTICATED=true`: local development only.

Notes for the codex backend:

- The Codex agent takes roughly 10-40 seconds per answer; the app's HTTP
  timeout is sized accordingly.
- Usage is billed to the logged-in ChatGPT plan's Codex quota, and the ChatGPT
  account's data settings apply. Keep the token guard on: anyone who can reach
  this server consumes your Codex quota.
- `server.mjs` does not auto-load `.env`; export variables in the shell or use
  `node --env-file=.env server.mjs`.

The proxy intentionally returns generic client errors and logs provider details server-side with request IDs.
