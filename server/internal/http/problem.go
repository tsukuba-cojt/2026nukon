package http

import (
	stdhttp "net/http"

	"github.com/gin-gonic/gin"
)

type ProblemDetails struct {
	Type     string `json:"type"`
	Title    string `json:"title"`
	Status   int    `json:"status"`
	Detail   string `json:"detail,omitempty"`
	Instance string `json:"instance,omitempty"`
}

func Problem(ctx *gin.Context, status int, problemType string, title string, detail string) {
	ctx.Header("Content-Type", "application/problem+json")
	ctx.AbortWithStatusJSON(status, ProblemDetails{
		Type:     "https://nukon.example.com/problems/" + problemType,
		Title:    title,
		Status:   status,
		Detail:   detail,
		Instance: ctx.Request.URL.Path,
	})
}

func BindProblem(ctx *gin.Context, err error) {
	Problem(ctx, stdhttp.StatusBadRequest, "bad-request", "Bad request", err.Error())
}
