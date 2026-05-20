package pagination

import (
	"fmt"
	"net/url"
	"strconv"
)

const (
	DefaultLimit = 50
	MaxLimit     = 100
)

type Cursor struct {
	Before string
	After  string
	Limit  int
}

func Parse(values url.Values) (Cursor, error) {
	cursor := Cursor{
		Before: values.Get("before"),
		After:  values.Get("after"),
		Limit:  DefaultLimit,
	}

	if cursor.Before != "" && cursor.After != "" {
		return Cursor{}, fmt.Errorf("before and after cannot both be set")
	}

	if rawLimit := values.Get("limit"); rawLimit != "" {
		limit, err := strconv.Atoi(rawLimit)
		if err != nil {
			return Cursor{}, fmt.Errorf("limit must be an integer")
		}

		if limit < 1 {
			return Cursor{}, fmt.Errorf("limit must be greater than 0")
		}

		if limit > MaxLimit {
			limit = MaxLimit
		}

		cursor.Limit = limit
	}

	return cursor, nil
}
