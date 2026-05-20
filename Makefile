ifneq (,$(wildcard .env))
include .env
export
endif

POSTGRES_HOST_PORT ?= 15432
MINIO_API_PORT ?= 9000
MINIO_BUCKET ?= nukon-images
MINIO_ROOT_USER ?= nukon_minio
MINIO_ROOT_PASSWORD ?= nukon_minio_password
MC_ALIAS ?= nukon-local
STATICCHECK_HOME ?= $(CURDIR)/.staticcheck-home
MC_CONFIG_DIR ?= $(CURDIR)/.mc

.PHONY: server-test server-migrate server-run server-dev server-lint workflow-lint minio-alias minio-ls api-test

server-test:
	cd server && go test ./...

server-migrate:
	cd server && go run ./cmd/migrate

server-run:
	cd server && go run ./cmd/server

server-dev:
	cd server && "$$(go env GOPATH)/bin/air" -c .air.toml

server-lint:
	cd server && go vet ./...
	cd server && HOME="$(STATICCHECK_HOME)" "$$(go env GOPATH)/bin/staticcheck" ./...

workflow-lint:
	"$$(go env GOPATH)/bin/actionlint" .github/workflows/*.yml

minio-alias:
	mc --config-dir "$(MC_CONFIG_DIR)" alias set $(MC_ALIAS) http://localhost:$(MINIO_API_PORT) $(MINIO_ROOT_USER) $(MINIO_ROOT_PASSWORD)

minio-ls: minio-alias
	mc --config-dir "$(MC_CONFIG_DIR)" ls $(MC_ALIAS)/$(MINIO_BUCKET)

api-test:
	cd api && bru run --env Local
