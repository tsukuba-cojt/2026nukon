package models

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	XUserID     string    `gorm:"type:text;uniqueIndex;not null"`
	XScreenName string    `gorm:"type:text;not null"`
	CreatedAt   time.Time `gorm:"not null;default:now()"`
	UpdatedAt   time.Time `gorm:"not null;default:now()"`

	Cameras  []Camera  `gorm:"constraint:OnDelete:CASCADE"`
	Sessions []Session `gorm:"constraint:OnDelete:CASCADE"`
	Images   []Image   `gorm:"constraint:OnDelete:CASCADE"`
}
