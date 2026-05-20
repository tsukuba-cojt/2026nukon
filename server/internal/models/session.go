package models

import (
	"time"

	"github.com/google/uuid"
)

type SessionSubject string

const (
	SessionSubjectApp    SessionSubject = "app"
	SessionSubjectCamera SessionSubject = "camera"
)

type Session struct {
	TokenHash string         `gorm:"type:text;primaryKey"`
	UserID    uuid.UUID      `gorm:"type:uuid;not null;index"`
	Subject   SessionSubject `gorm:"type:text;not null;check:subject IN ('app','camera')"`
	CameraID  *uuid.UUID     `gorm:"type:uuid"`
	ExpiresAt time.Time      `gorm:"not null;index"`
	CreatedAt time.Time      `gorm:"not null;default:now()"`

	User   User    `gorm:"constraint:OnDelete:CASCADE"`
	Camera *Camera `gorm:"constraint:OnDelete:CASCADE"`
}
