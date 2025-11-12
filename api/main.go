package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"time"
)

func handleCompilation(w http.ResponseWriter, r *http.Request) {
	var ofmt string
	var ifmt string
	query := r.URL.Query()
	ofmt = query.Get("o")
	ifmt = query.Get("i")

	var iext string
	switch ifmt {
	case "asy":
		iext = ifmt
	case "tex":
		iext = ifmt
	default:
		http.Error(w, "invalid input type", http.StatusBadRequest)
		return
	}
	var oext string
	switch ofmt {
	case "svg":
		oext = ofmt
	case "pdf":
		oext = ofmt
	case "png":
		oext = ofmt
	default:
		http.Error(w, "invalid output type", http.StatusBadRequest)
		return
	}

	userID := r.Context().Value(contextKeyUserID).(int)

	dir := filepath.Join(tmpdir, fmt.Sprintf("user:%s", strconv.Itoa(userID)))
	if err := os.MkdirAll(dir, 0700); err != nil {
		slogger.ErrorContext(r.Context(), "create temp dir failed", "error", err)
		http.Error(w, "create user dir failed", http.StatusInternalServerError)
		return
	}
	slogger.DebugContext(r.Context(), "user dir", "path", dir)
	var base = "input."
	var inputName = base + iext
	var outputName = base + oext

	inputFullPath := filepath.Join(dir, inputName)
	outputFullPath := filepath.Join(dir, outputName)

	inpf, err := os.Create(inputFullPath)
	if err != nil {
		slogger.ErrorContext(r.Context(), "create input file failed", "error", err)
		http.Error(w, "cannot create input file", http.StatusInternalServerError)
		return
	}
	slogger.DebugContext(r.Context(), "create input file")
	defer func() {
		if err := inpf.Close(); err != nil {
			slogger.ErrorContext(r.Context(), "close input file failed", "error", err)
		}
	}()

	buf := make([]byte, 512)
	for {
		// TODO: max file size (or in reverse proxy)
		n, err := r.Body.Read(buf)
		if err != nil && err != io.EOF {
			slogger.ErrorContext(r.Context(), "read body failed", "error", err)
			http.Error(w, "cant read body", http.StatusInternalServerError)
			return
		}
		if n == 0 {
			break
		}

		if _, err := inpf.Write(buf[:n]); err != nil {
			slogger.ErrorContext(r.Context(), "write to input file failed", "error", err)
			http.Error(w, "cannot write to input file", http.StatusInternalServerError)
			return
		}
	}

	var cmds [][]string
	switch ifmt {
	case "tex":
		cmds = [][]string{
			{"latexmk", "-pdf", "-halt-on-error", inputName},
		}
		if ofmt == "svg" {
			cmds = append(cmds,
				[]string{"pdf2svg", base + "pdf", outputName},
			)
		}
	case "asy":
		cmds = [][]string{
			{"asy", inputName, "-safe", "-f", ofmt, "-o", "input"},
		}
	}

	const compilerErrorMimeType = "application/vnd.asy-compiler-error"

	for _, args := range cmds {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		cmd := exec.CommandContext(ctx, args[0], args[1:]...)
		cmd.Dir = dir
		slogger.DebugContext(r.Context(), "exec", "args", cmd.Args)

		outputb, err := cmd.CombinedOutput()
		slogger.DebugContext(r.Context(), "output", "output", string(outputb))
		if err != nil {
			exitErr := err.(*exec.ExitError)
			slogger.WarnContext(r.Context(), "exec failed", "exit code", exitErr.ExitCode(), "signal", exitErr.ProcessState, "output", string(outputb))

			if ctx.Err() == context.DeadlineExceeded {
				slogger.WarnContext(r.Context(), "exec timeout: process killed")
				w.Header().Add("Content-Type", "text/plain")
				w.WriteHeader(http.StatusRequestTimeout)
				w.Write([]byte("Command timed out!\n"))
				return
			}
			// TODO: maybe parse errors to json server side
			w.Header().Add("Content-Type", compilerErrorMimeType)
			w.WriteHeader(200)
			w.Write(outputb)
			return
		}
	}
	if _, err := os.Stat(outputFullPath); err != nil {
		slogger.DebugContext(r.Context(), "cannot stat output file to serve it", "error", err)
		w.Header().Add("Content-Type", compilerErrorMimeType)
		w.WriteHeader(200)
		w.Write([]byte("no output"))
	} else {
		http.ServeFile(w, r, outputFullPath)
	}
}

func incCompilations(userID int) error {
	_, err := db.Exec("UPDATE users SET evals = evals + 1 WHERE id = ?", userID)
	return err
}

var tmpdir string

func main() {
	mux := http.NewServeMux()

	mux.Handle("POST /eval", http.HandlerFunc(handleCompilation))

	var addr string
	flag.StringVar(&addr, "addr", "localhost:8050", "address to use")
	flag.Parse()

	slogger.Info("starting server", "addr", addr)

	tmpdir = filepath.Join(os.TempDir(), "asy-eval-server-data")
	if err := os.MkdirAll(tmpdir, 0700); err != nil {
		panic(err)
	}
	defer os.RemoveAll(tmpdir)

	initDB()
	defer closeDB()

	err := http.ListenAndServe(addr,
		errorHandlingMiddleware(
			loggingMiddleware(
				userSessionMiddleware(
					corsMiddleware(
						mux)))))
	if err != nil {
		slogger.Error("listen", "failed to listen", err)
	}
}
