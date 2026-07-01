# Study Glass API

Server-side OpenAI proxy for the Study Glass mobile app.

## Run

```bash
cp .env.example .env
pnpm start
```

Required environment:

- `OPENAI_API_KEY`: server-side OpenAI API key.
- `STUDY_GLASS_CLIENT_TOKEN` or `STUDY_GLASS_CLIENT_TOKENS`: bearer token guard for app requests.
- `ALLOWED_ORIGIN`: concrete browser origin when `NODE_ENV=production`.

Optional environment:

- `OPENAI_MODEL_DEFAULT`: defaults to `gpt-4.1-mini`.
- `TRUST_PROXY=true`: only when a reverse proxy safely sets `X-Forwarded-For`.
- `STUDY_GLASS_ALLOW_UNAUTHENTICATED=true`: local development only.

The proxy intentionally returns generic client errors and logs provider details server-side with request IDs.
