package http

import (
	"errors"
	"log/slog"
	stdhttp "net/http"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gin-gonic/gin"
	"github.com/tsukuba-cojt/2026nukon/server/internal/config"
	"gorm.io/gorm"
)

var ErrServerClosed = stdhttp.ErrServerClosed

type Dependencies struct {
	Config   config.Config
	DB       *gorm.DB
	S3Client *s3.Client
	Logger   *slog.Logger
}

func NewServer(addr string, handler stdhttp.Handler) *stdhttp.Server {
	return &stdhttp.Server{
		Addr:    addr,
		Handler: handler,
	}
}

func NewRouter(deps Dependencies) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)

	router := gin.New()
	router.Use(AccessLog(deps.Logger), Recovery(deps.Logger))

	router.GET("/healthz", func(ctx *gin.Context) {
		status := gin.H{
			"status": "ok",
		}

		sqlDB, err := deps.DB.DB()
		if err != nil {
			Problem(ctx, stdhttp.StatusInternalServerError, "database-unavailable", "Database unavailable", err.Error())
			return
		}

		if err := sqlDB.PingContext(ctx.Request.Context()); err != nil {
			Problem(ctx, stdhttp.StatusServiceUnavailable, "database-unavailable", "Database unavailable", err.Error())
			return
		}

		ctx.JSON(stdhttp.StatusOK, status)
	})

	router.NoRoute(func(ctx *gin.Context) {
		Problem(ctx, stdhttp.StatusNotFound, "not-found", "Resource not found", "The requested route does not exist.")
	})

	return router
}

func Recovery(logger *slog.Logger) gin.HandlerFunc {
	return gin.CustomRecovery(func(ctx *gin.Context, recovered any) {
		err, ok := recovered.(error)
		if !ok {
			err = errors.New("panic recovered")
		}

		logger.Error("panic recovered", "error", err)
		Problem(ctx, stdhttp.StatusInternalServerError, "internal-server-error", "Internal server error", "Unexpected server error.")
	})
}
