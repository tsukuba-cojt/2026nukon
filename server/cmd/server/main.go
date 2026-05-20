package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/tsukuba-cojt/2026nukon/server/internal/config"
	"github.com/tsukuba-cojt/2026nukon/server/internal/database"
	httpserver "github.com/tsukuba-cojt/2026nukon/server/internal/http"
	"github.com/tsukuba-cojt/2026nukon/server/internal/storage"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

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

	s3Client, err := storage.NewS3Client(context.Background(), cfg.Storage)
	if err != nil {
		logger.Error("create s3 client", "error", err)
		os.Exit(1)
	}

	router := httpserver.NewRouter(httpserver.Dependencies{
		Config:   cfg,
		DB:       db,
		S3Client: s3Client,
		Logger:   logger,
	})

	server := httpserver.NewServer(cfg.ServerAddr, router)

	go func() {
		logger.Info("starting server", "addr", cfg.ServerAddr)
		if err := server.ListenAndServe(); err != nil && err != httpserver.ErrServerClosed {
			logger.Error("server stopped", "error", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Error("shutdown server", "error", err)
		os.Exit(1)
	}

	logger.Info("server stopped")
}
