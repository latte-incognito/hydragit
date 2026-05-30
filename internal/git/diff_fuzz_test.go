package git

import (
	"strings"
	"testing"
)

// FuzzParseHunks feeds arbitrary text to the unified-diff hunk parser.
// Invariants: never panics; every emitted line carries a known type; and a hunk
// is only ever opened by an "@@" header (no orphan lines).
// Run: go test -run x -fuzz FuzzParseHunks ./internal/git
func FuzzParseHunks(f *testing.F) {
	f.Add("@@ -1,2 +1,2 @@\n-old\n+new\n ctx\n")
	f.Add("")
	f.Add("no hunks here\njust text")
	f.Add("@@ bad header\n+++added\n---removed")
	f.Add("@@\n@@\n@@\n")
	f.Fuzz(func(t *testing.T, diff string) {
		hunks := parseHunks(diff) // must not panic
		for _, h := range hunks {
			if !strings.HasPrefix(h.Header, "@@") {
				t.Fatalf("hunk header does not start with @@: %q", h.Header)
			}
			for _, l := range h.Lines {
				switch l.Type {
				case "add", "del", "ctx":
				default:
					t.Fatalf("unexpected hunk line type %q", l.Type)
				}
			}
		}
	})
}
