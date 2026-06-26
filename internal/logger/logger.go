package logger

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Level represents log severity.
type Level string

const (
	LevelInfo  Level = "info"
	LevelWarn  Level = "warn"
	LevelError Level = "error"
	LevelDebug Level = "debug"
)

// Entry is a single JSON log line.
type Entry struct {
	Timestamp  string `json:"ts"`
	Level      Level  `json:"level"`
	Source     string `json:"source"`        // "git" | "ipc" | "process"
	Cmd        string `json:"cmd,omitempty"` // git subcommand or ipc command
	DurationMs int64  `json:"duration_ms,omitempty"`
	ExitCode   *int   `json:"exit_code,omitempty"`
	ReqID      string `json:"req_id,omitempty"`
	OK         *bool  `json:"ok,omitempty"`
	Error      string `json:"error,omitempty"`
	Msg        string `json:"msg,omitempty"`
}

// Logger writes JSON-lines to a daily rotating log file.
type Logger struct {
	mu      sync.Mutex
	dir     string
	day     string // "2006-01-02" of the currently open file
	file    *os.File
	encoder *json.Encoder
	retain  int // days to keep
}

var std *Logger

// Init initialises the package-level logger.
// logDir should come from HYDRAGIT_LOG_DIR (set by the TS extension from context.logUri).
// Falls back to os.TempDir()/hydragit-logs if the env var is missing.
func Init(logDir string, retainDays int) error {
	if logDir == "" {
		logDir = filepath.Join(os.TempDir(), "hydragit-logs")
	}
	if retainDays <= 0 {
		retainDays = 7
	}
	// 0o700 — logs contain repo metadata (branch names, file paths, git
	// command details); keep them readable by the owning user only.
	if err := os.MkdirAll(logDir, 0o700); err != nil {
		return fmt.Errorf("logger: create log dir: %w", err)
	}

	l := &Logger{dir: logDir, retain: retainDays}
	if err := l.rotate(); err != nil {
		return err
	}

	std = l
	l.write(&Entry{
		Level:  LevelInfo,
		Source: "process",
		Msg:    "logger initialised",
	})
	l.cleanup()
	return nil
}

// Close flushes and closes the current log file.
func Close() {
	if std == nil {
		return
	}
	std.mu.Lock()
	defer std.mu.Unlock()
	if std.file != nil {
		std.file.Close()
		std.file = nil
	}
}

// --- Public logging helpers -------------------------------------------------

// GitCmd logs a git command execution.
func GitCmd(cmd string, durationMs int64, exitCode int, errMsg string) {
	if std == nil {
		return
	}
	code := exitCode
	e := Entry{
		Level:      levelFor(errMsg),
		Source:     "git",
		Cmd:        cmd,
		DurationMs: durationMs,
		ExitCode:   &code,
	}
	if errMsg != "" {
		e.Error = errMsg
	}
	std.write(&e)
}

// IPCRequest logs an incoming IPC request.
func IPCRequest(id, cmd string) {
	if std == nil {
		return
	}
	std.write(&Entry{
		Level:  LevelInfo,
		Source: "ipc",
		ReqID:  id,
		Cmd:    cmd,
		Msg:    "request",
	})
}

// IPCResponse logs an outgoing IPC response.
func IPCResponse(id, cmd string, ok bool, durationMs int64, errMsg string) {
	if std == nil {
		return
	}
	okVal := ok
	e := Entry{
		Level:      levelFor(errMsg),
		Source:     "ipc",
		ReqID:      id,
		Cmd:        cmd,
		OK:         &okVal,
		DurationMs: durationMs,
		Msg:        "response",
	}
	if errMsg != "" {
		e.Error = errMsg
	}
	std.write(&e)
}

// Info logs a free-form informational message (process lifecycle etc.).
func Info(source, msg string) {
	if std == nil {
		return
	}
	std.write(&Entry{Level: LevelInfo, Source: source, Msg: msg})
}

// Error logs a free-form error message.
func Error(source, msg string) {
	if std == nil {
		return
	}
	std.write(&Entry{Level: LevelError, Source: source, Msg: msg})
}

// --- Internal ---------------------------------------------------------------

func (l *Logger) write(e *Entry) {
	e.Timestamp = time.Now().UTC().Format(time.RFC3339)

	l.mu.Lock()
	defer l.mu.Unlock()

	// Rotate if the day has changed.
	if today() != l.day {
		if err := l.rotate(); err != nil {
			fmt.Fprintf(os.Stderr, "logger: rotate: %v\n", err)
			return
		}
	}

	if err := l.encoder.Encode(e); err != nil {
		fmt.Fprintf(os.Stderr, "logger: encode: %v\n", err)
	}
}

func (l *Logger) rotate() error {
	if l.file != nil {
		l.file.Close()
	}

	day := today()
	path := filepath.Join(l.dir, "hydragit-"+day+".log")

	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("logger: open %s: %w", path, err)
	}

	l.file = f
	l.day = day
	l.encoder = json.NewEncoder(f)
	return nil
}

// cleanup deletes log files older than l.retain days.
func (l *Logger) cleanup() {
	cutoff := time.Now().AddDate(0, 0, -l.retain)

	entries, err := os.ReadDir(l.dir)
	if err != nil {
		return
	}

	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			os.Remove(filepath.Join(l.dir, e.Name()))
		}
	}
}

func today() string {
	return time.Now().UTC().Format("2006-01-02")
}

func levelFor(errMsg string) Level {
	if errMsg != "" {
		return LevelError
	}
	return LevelInfo
}
