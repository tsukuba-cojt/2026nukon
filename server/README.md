# server

Go + Gin API server. Stores metadata in PostgreSQL and image objects in MinIO.

## Local dependencies

From the repository root:

```sh
cp .env.example .env
docker compose up -d postgres minio minio-create-bucket
```

## Run

```sh
cd server
go run ./cmd/server
```

Health check:

```sh
curl http://localhost:18080/healthz
```

## Migrate

From the repository root:

```sh
make server-migrate
```

## Structure

```text
server/
├── cmd/server/
├── cmd/migrate/
├── internal/
├── migrations/
└── scripts/
```
