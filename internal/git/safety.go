package git

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"
)

// SafetyWarning is one pre-commit finding. Type is a stable identifier the UI
// maps to wording and the settings map to toggles.
type SafetyWarning struct {
	Type   string `json:"type"`   // secretFile | secretContent | conflictMarker | largeFile | protectedBranch
	Path   string `json:"path"`   // offending file, "" for repo-level warnings
	Detail string `json:"detail"` // human-readable specifics
}

// largeFileLimit is the size above which a file earns a warning. Big enough to
// skip generated bundles people commit on purpose, small enough to catch the
// accidental video/binary.
const largeFileLimit = 5 * 1024 * 1024

// maxScanSize caps how much of a file the content scan reads — secrets and
// conflict markers live in text files; anything bigger is covered by the
// large-file check anyway.
const maxScanSize = 1 * 1024 * 1024

// secretFilePatterns match basenames that should almost never be committed.
var secretFilePatterns = []string{
	".env", ".env.*", "id_rsa", "id_ed25519", "id_ecdsa", "*.pem", "*.key",
	"credentials", "credentials.json", ".npmrc", ".netrc",
}

// secretContentPatterns are deliberately high-precision token shapes — a false
// positive trains users to click through, which kills the feature.
var secretContentPatterns = []*regexp.Regexp{
	regexp.MustCompile(`AKIA[0-9A-Z]{16}`),                   // AWS access key id
	regexp.MustCompile(`gh[poasur]_[A-Za-z0-9]{36,}`),        // GitHub tokens
	regexp.MustCompile(`xox[baprs]-[A-Za-z0-9-]{10,}`),       // Slack tokens
	regexp.MustCompile(`sk-[A-Za-z0-9_-]{32,}`),              // OpenAI-style keys
	regexp.MustCompile(`AIza[0-9A-Za-z_-]{35}`),              // Google API key
	regexp.MustCompile(`-----BEGIN [A-Z ]*PRIVATE KEY-----`), // PEM private keys
	regexp.MustCompile(`(?i)(api[_-]?key|secret|password|token)["']?\s*[:=]\s*["'][^"'\s]{16,}["']`),
}

var conflictMarkerPattern = regexp.MustCompile(`(?m)^(<{7}|>{7})( |$)`)

// defaultProtectedBranches get a "committing straight to X" nudge when the
// user hasn't configured hydragit.safety.protectedBranches.
var defaultProtectedBranches = []string{"main", "master"}

// CommitSafety inspects the files about to be committed and returns warnings —
// never errors that block: per the safety-net thesis this is warn + proceed,
// the UI decides whether to ask "commit anyway?". The enabled set (from user
// settings, injected by the extension host) filters which checks run; an empty
// set means all. protected is the user's protected-branch list (also injected
// from settings); empty means the main/master default.
func CommitSafety(repoPath string, paths []string, enabled map[string]bool, protected []string) []SafetyWarning {
	on := func(check string) bool { return len(enabled) == 0 || enabled[check] }
	warnings := []SafetyWarning{}

	if on("protectedBranch") {
		if len(protected) == 0 {
			protected = defaultProtectedBranches
		}
		if branch, err := run(repoPath, "rev-parse", "--abbrev-ref", "HEAD"); err == nil && slices.Contains(protected, branch) {
			warnings = append(warnings, SafetyWarning{
				Type:   "protectedBranch",
				Detail: "committing directly to " + branch,
			})
		}
	}

	for _, p := range paths {
		abs := filepath.Join(repoPath, p)
		base := filepath.Base(p)

		if on("secretFile") {
			for _, pat := range secretFilePatterns {
				if ok, _ := filepath.Match(pat, base); ok {
					warnings = append(warnings, SafetyWarning{
						Type: "secretFile", Path: p,
						Detail: "filename suggests credentials (" + pat + ")",
					})
					break
				}
			}
		}

		info, err := os.Stat(abs)
		if err != nil || info.IsDir() {
			continue // deleted/renamed-away paths have nothing to scan
		}

		if on("largeFile") && info.Size() > largeFileLimit {
			warnings = append(warnings, SafetyWarning{
				Type: "largeFile", Path: p,
				Detail: humanSize(info.Size()),
			})
		}

		if (on("secretContent") || on("conflictMarker")) && info.Size() <= maxScanSize {
			content, err := os.ReadFile(abs)
			if err != nil || !utf8Like(content) {
				continue
			}
			text := string(content)
			if on("secretContent") {
				for _, re := range secretContentPatterns {
					if m := re.FindString(text); m != "" {
						warnings = append(warnings, SafetyWarning{
							Type: "secretContent", Path: p,
							Detail: "looks like a credential: " + truncateSecret(m),
						})
						break
					}
				}
			}
			if on("conflictMarker") && conflictMarkerPattern.MatchString(text) {
				warnings = append(warnings, SafetyWarning{
					Type: "conflictMarker", Path: p,
					Detail: "leftover merge conflict markers",
				})
			}
		}
	}
	return warnings
}

// utf8Like is a cheap binary-file filter: NUL bytes in the first KB mean we
// shouldn't regex-scan it.
func utf8Like(b []byte) bool {
	n := min(len(b), 1024)
	for i := range n {
		if b[i] == 0 {
			return false
		}
	}
	return true
}

// truncateSecret shows just enough of a matched token to be recognizable
// without echoing the whole credential back into UI/logs.
func truncateSecret(s string) string {
	if len(s) <= 12 {
		return s
	}
	return s[:8] + "…"
}

func humanSize(n int64) string {
	return fmt.Sprintf("%.1f MB", float64(n)/(1024*1024))
}
