package main

import (
	"log/slog"
	"os"

	"github.com/tsukuba-cojt/2026nukon/server/internal/config"
	"github.com/tsukuba-cojt/2026nukon/server/internal/database"
	"github.com/tsukuba-cojt/2026nukon/server/internal/migrations"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	cfg, err := config.Load()
	if err != nil {
		logger.Error("load config", "error", err)
		os.Exit(1)
	}

	db, err := database.Open(cfg.Database)
	if err != nil {
		logger.Error("open database", "error", err)
		os.Exit(1)
	}

	sqlDB, err := db.DB()
	if err != nil {
		logger.Error("get sql database", "error", err)
		os.Exit(1)
	}
	defer sqlDB.Close()

	if err := migrations.Run(db); err != nil {
		logger.Error("run migrations", "error", err)
		os.Exit(1)
	}

	logger.Info("migrations completed")
}
