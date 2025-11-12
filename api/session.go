package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/rand"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

const sessionCookiesMaxAgeSeconds = 30 * 24 * 60 * 60

const contextKeyUserID = "userID"

var secretKey = "i love solving differential equations"

func init() {
	key := os.Getenv("SECRET_KEY")
	if key == "" {
		slogger.Warn("no SECRET_KEY in env, using the default one: " + secretKey)
	}
}

func cmpSignatures(one string, two string) bool {
	return hmac.Equal([]byte(one), []byte(two))
}
func signString(data string) string {
	h := hmac.New(sha256.New, []byte(secretKey))
	h.Write([]byte(data))
	return hex.EncodeToString(h.Sum(nil))
}

func genToken(userID int) string {
	ts := time.Now().Unix()
	data := fmt.Sprintf("%s.%s", strconv.Itoa(userID), strconv.FormatInt(ts, 10))
	signature := signString(data)
	token := fmt.Sprintf("%s#%s", data, signature)
	return token
}
func session(w http.ResponseWriter, r *http.Request) (result int, isValid bool) {
	cookie, err := r.Cookie("session")
	if err != nil {
		if err != http.ErrNoCookie {
			slogger.WarnContext(r.Context(), "cannot read cookie")
			return 0, false
		}
		return 0, false
	}
	cookieParts := strings.Split(cookie.Value, "#")
	if len(cookieParts) != 2 {
		return 0, false
	}
	data := cookieParts[0]
	signature := cookieParts[1]

	dataParts := strings.Split(data, ".")
	if len(dataParts) != 2 {
		return 0, false
	}

	userIDStr := dataParts[0]
	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return 0, false
	}

	tsStr := dataParts[1]
	tsInt, err := strconv.ParseInt(tsStr, 10, 64)
	if err != nil {
		return 0, false
	}
	ts := time.Unix(tsInt, 0)

	if time.Now().After(ts.Add(time.Second * sessionCookiesMaxAgeSeconds)) {
		return 0, false
	}

	if !cmpSignatures(signString(data), signature) {
		return 0, false
	}
	// insecure: tokenNeedsRefreshing := ts.Add(time.Second * sessionCookiesMaxAgeSeconds / 2).After(time.Now())
	return userID, true
}

func userSessionMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var userID int
		userID, ok := session(w, r)
		if !ok {
			userID = rand.Int()
			token := genToken(userID)
			cookie := http.Cookie{
				Name:     "session",
				Value:    token,
				MaxAge:   sessionCookiesMaxAgeSeconds,
				Secure:   true,
				HttpOnly: true,
				SameSite: http.SameSiteLaxMode,
			}
			http.SetCookie(w, &cookie)
		}
		slogger.DebugContext(r.Context(), "user cookie", "uid", userID)
		ctx := context.WithValue(r.Context(), contextKeyUserID, userID)
		r = r.WithContext(ctx)
		next.ServeHTTP(w, r)
	})
}
