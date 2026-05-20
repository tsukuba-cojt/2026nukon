.PHONY: server-test server-migrate server-run

server-test:
	cd server && go test ./...

server-migrate:
	cd server && go run ./cmd/migrate

server-run:
	cd server && go run ./cmd/server
