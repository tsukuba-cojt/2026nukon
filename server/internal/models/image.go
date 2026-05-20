package models

import (
	"time"

	"github.com/google/uuid"
)

type ImageKind string

const (
	ImageKindOriginal  ImageKind = "original"
	ImageKindRetouched ImageKind = "retouched"
)

type Image struct {
	ID                 uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	UserID             uuid.UUID  `gorm:"type:uuid;not null;index:idx_images_user_captured_at,priority:1"`
	CameraID           *uuid.UUID `gorm:"type:uuid;index"`
	CaptureID          uuid.UUID  `gorm:"type:uuid;uniqueIndex;not null;index"`
	CapturedAt         time.Time  `gorm:"not null;index:idx_images_user_captured_at,priority:2,sort:desc"`
	Kind               ImageKind  `gorm:"type:text;not null;check:kind IN ('original','retouched')"`
	ParentImageID      *uuid.UUID `gorm:"type:uuid;index"`
	JPEGObjectKey      string     `gorm:"type:text;not null"`
	RawObjectKey       *string    `gorm:"type:text"`
	ThumbnailObjectKey string     `gorm:"type:text;not null"`
	CreatedAt          time.Time  `gorm:"not null;default:now()"`

	User        User    `gorm:"constraint:OnDelete:CASCADE"`
	Camera      *Camera `gorm:"constraint:OnDelete:SET NULL"`
	ParentImage *Image  `gorm:"foreignKey:ParentImageID;constraint:OnDelete:CASCADE"`
}
