package auth

import (
	"encoding/hex"
	"testing"
)

func TestHashSessionToken(t *testing.T) {
	got := HashSessionToken("session-token")

	if len(got) != sha256HexLength {
		t.Fatalf("hash length = %d, want %d", len(got), sha256HexLength)
	}

	if _, err := hex.DecodeString(got); err != nil {
		t.Fatalf("hash is not hex: %v", err)
	}

	if got != HashSessionToken("session-token") {
		t.Fatal("hash should be deterministic")
	}

	if got == HashSessionToken("other-token") {
		t.Fatal("different tokens should not hash to the same value in this test")
	}
}

func TestGenerateSessionToken(t *testing.T) {
	first, err := GenerateSessionToken()
	if err != nil {
		t.Fatalf("generate first token: %v", err)
	}

	second, err := GenerateSessionToken()
	if err != nil {
		t.Fatalf("generate second token: %v", err)
	}

	if first == "" || second == "" {
		t.Fatal("tokens should not be empty")
	}

	if first == second {
		t.Fatal("generated tokens should differ")
	}
}

const sha256HexLength = 64
