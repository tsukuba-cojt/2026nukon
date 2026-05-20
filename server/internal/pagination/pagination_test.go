package pagination

import (
	"net/url"
	"testing"
)

func TestParseDefault(t *testing.T) {
	cursor, err := Parse(url.Values{})
	if err != nil {
		t.Fatalf("parse default: %v", err)
	}

	if cursor.Limit != DefaultLimit {
		t.Fatalf("limit = %d, want %d", cursor.Limit, DefaultLimit)
	}
}

func TestParseLimit(t *testing.T) {
	cursor, err := Parse(url.Values{"limit": {"25"}})
	if err != nil {
		t.Fatalf("parse limit: %v", err)
	}

	if cursor.Limit != 25 {
		t.Fatalf("limit = %d, want 25", cursor.Limit)
	}
}

func TestParseLimitCapsAtMax(t *testing.T) {
	cursor, err := Parse(url.Values{"limit": {"500"}})
	if err != nil {
		t.Fatalf("parse capped limit: %v", err)
	}

	if cursor.Limit != MaxLimit {
		t.Fatalf("limit = %d, want %d", cursor.Limit, MaxLimit)
	}
}

func TestParseRejectsInvalidLimit(t *testing.T) {
	for _, rawLimit := range []string{"0", "-1", "abc"} {
		if _, err := Parse(url.Values{"limit": {rawLimit}}); err == nil {
			t.Fatalf("expected error for limit %q", rawLimit)
		}
	}
}

func TestParseRejectsBeforeAndAfter(t *testing.T) {
	_, err := Parse(url.Values{
		"before": {"cursor-a"},
		"after":  {"cursor-b"},
	})
	if err == nil {
		t.Fatal("expected error when before and after are both set")
	}
}
