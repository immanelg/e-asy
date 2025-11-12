package main

import (
	"context"
	"log/slog"
	"math/rand"
	"net/http"
	"os"
	"strconv"
	"sync/atomic"
	"time"
)

var slogger *slog.Logger

type slogHandler struct {
	slog.Handler
}

func (h slogHandler) Handle(ctx context.Context, record slog.Record) error {
	if requestID, ok := ctx.Value(contextKeyRequestID).(int); ok {
		record.Add("rid", slog.IntValue(requestID))
	}
	if userID, ok := ctx.Value(contextKeyUserID).(int); ok {
		record.Add("uid", slog.IntValue(userID))
	}
	return h.Handler.Handle(ctx, record)
}

const contextKeyRequestID = "requestID"

func init() {
	baseHandler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelDebug,
		// Level: slog.LevelInfo,
	})
	slogger = slog.New(slogHandler{baseHandler})
}

var nextReqId atomic.Uint64

type loggingResponseWriter struct {
	http.ResponseWriter
	StatusCode int
}

func (lrw *loggingResponseWriter) WriteHeader(code int) {
	lrw.StatusCode = code
	lrw.ResponseWriter.WriteHeader(code)
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// requestID := fmt.Sprintf("%d", nextReqId.Load())
		// nextReqId.Add(1)
		requestID := rand.Int()

		ctx := context.WithValue(r.Context(), contextKeyRequestID, requestID)
		r = r.WithContext(ctx)

		slogger.InfoContext(ctx, "start request", "method", r.Method, "path", r.URL.Path)
		w.Header().Set("Request-ID", strconv.Itoa(requestID))

		lw := &loggingResponseWriter{w, http.StatusOK}

		t := time.Now()
		next.ServeHTTP(lw, r)
		elapsed := time.Since(t)

		slogger.InfoContext(ctx, "done request", "status", lw.StatusCode, "elapsed-ms", elapsed.Milliseconds())
	})
}
