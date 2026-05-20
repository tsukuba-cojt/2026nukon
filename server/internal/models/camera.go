package models

import (
	"time"

	"github.com/google/uuid"
)

type Camera struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	UserID       uuid.UUID `gorm:"type:uuid;not null;index"`
	DeviceName   string    `gorm:"type:text;not null"`
	RegisteredAt time.Time `gorm:"not null;default:now()"`

	User     User      `gorm:"constraint:OnDelete:CASCADE"`
	Sessions []Session `gorm:"constraint:OnDelete:CASCADE"`
	Images   []Image   `gorm:"constraint:OnDelete:SET NULL"`
}
