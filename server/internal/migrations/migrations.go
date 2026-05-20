package migrations

import (
	"github.com/tsukuba-cojt/2026nukon/server/internal/models"
	"gorm.io/gorm"
)

func Run(db *gorm.DB) error {
	if err := db.Exec(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`).Error; err != nil {
		return err
	}

	return db.AutoMigrate(
		&models.User{},
		&models.Camera{},
		&models.Session{},
		&models.Image{},
	)
}
