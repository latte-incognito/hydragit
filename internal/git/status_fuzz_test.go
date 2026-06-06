package git

import "testing"

// FuzzResolveStatus throws arbitrary porcelain XY codes at the status mapper.
// Invariants: it never panics, and it only ever returns the empty string or one
// of the known single-letter statuses. Run: go test -run x -fuzz FuzzResolveStatus ./internal/git
func FuzzResolveStatus(f *testing.F) {
	for _, seed := range []string{"", "M", "M ", " M", "??", "UU", "AA", "DD", "AU", "UA", "R ", "C ", "T ", "XY", "  "} {
		f.Add(seed)
	}
	allowed := map[string]bool{"": true, "M": true, "A": true, "D": true, "U": true, "R": true, "C": true, "T": true, "!": true}
	f.Fuzz(func(t *testing.T, xy string) {
		got := resolveStatus(xy) // must not panic for any input
		if !allowed[got] {
			t.Fatalf("resolveStatus(%q) returned unexpected status %q", xy, got)
		}
	})
}
