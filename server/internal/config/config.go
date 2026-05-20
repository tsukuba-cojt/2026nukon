package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	ServerAddr string
	Database   DatabaseConfig
	Storage    StorageConfig
	XAPIKey    string
}

type DatabaseConfig struct {
	Host     string
	Port     string
	Name     string
	User     string
	Password string
	SSLMode  string
}

type StorageConfig struct {
	Endpoint        string
	Region          string
	Bucket          string
	AccessKeyID     string
	SecretAccessKey string
	UsePathStyle    bool
}

func Load() (Config, error) {
	usePathStyle, err := parseBoolEnv("MINIO_USE_PATH_STYLE", true)
	if err != nil {
		return Config{}, err
	}

	cfg := Config{
		ServerAddr: getEnv("SERVER_ADDR", ":18080"),
		Database: DatabaseConfig{
			Host:     getEnv("POSTGRES_HOST", "localhost"),
			Port:     getEnv("POSTGRES_PORT", "15432"),
			Name:     getEnv("POSTGRES_DB", "nukon"),
			User:     getEnv("POSTGRES_USER", "nukon"),
			Password: getEnv("POSTGRES_PASSWORD", "nukon_password"),
			SSLMode:  getEnv("POSTGRES_SSLMODE", "disable"),
		},
		Storage: StorageConfig{
			Endpoint:        getEnv("MINIO_ENDPOINT", "http://localhost:9000"),
			Region:          getEnv("MINIO_REGION", "ap-northeast-1"),
			Bucket:          getEnv("MINIO_BUCKET", "nukon-images"),
			AccessKeyID:     getEnv("MINIO_ACCESS_KEY_ID", getEnv("MINIO_ROOT_USER", "nukon_minio")),
			SecretAccessKey: getEnv("MINIO_SECRET_ACCESS_KEY", getEnv("MINIO_ROOT_PASSWORD", "nukon_minio_password")),
			UsePathStyle:    usePathStyle,
		},
		XAPIKey: os.Getenv("X_API_KEY"),
	}

	if cfg.Storage.Bucket == "" {
		return Config{}, fmt.Errorf("MINIO_BUCKET is required")
	}

	return cfg, nil
}

func (cfg DatabaseConfig) DSN() string {
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		cfg.Host,
		cfg.Port,
		cfg.User,
		cfg.Password,
		cfg.Name,
		cfg.SSLMode,
	)
}

func getEnv(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func parseBoolEnv(key string, fallback bool) (bool, error) {
	value := os.Getenv(key)
	if value == "" {
		return fallback, nil
	}

	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return false, fmt.Errorf("parse %s: %w", key, err)
	}

	return parsed, nil
}
