package git

import (
	"strconv"
	"strings"
)

// zeroSHA is git's all-zero object id, used in blame output for lines that are
// not yet committed (working-tree or piped buffer additions).
const zeroSHA = "0000000000000000000000000000000000000000"

// BlameLine is per-line authorship for a single final line of a file.
type BlameLine struct {
	Line        int    `json:"line"`        // 1-based line number in the final file
	Commit      string `json:"commit"`      // full sha; zeroSHA when uncommitted
	Author      string `json:"author"`      // author name
	AuthorEmail string `json:"authorEmail"` // author email, angle brackets stripped
	AuthorTime  int64  `json:"authorTime"`  // author time, unix epoch seconds
	Summary     string `json:"summary"`     // commit subject line
	Uncommitted bool   `json:"uncommitted"` // true when Commit == zeroSHA
}

// Blame returns per-line authorship for file.
//
// ref selects which version to blame: "" blames the working tree, while a
// commit-ish (sha, "HEAD", …) blames the file as of that revision — used to
// attribute the correct side of a diff editor.
//
// When contents is non-nil, git blames those bytes instead via
// `git blame --contents -`, keeping annotations correct for an editor buffer
// with unsaved edits (buffer-aware blame). contents is only meaningful for the
// working tree, so it is ignored when ref is set. file must be repo-relative;
// it is still required with --contents because it tells git which path the
// piped bytes represent.
func Blame(repoPath, file, ref string, contents []byte) ([]BlameLine, error) {
	args := []string{"blame", "--porcelain"}
	if ref != "" {
		// A historical revision: --contents is not applicable.
		args = append(args, ref)
		contents = nil
	} else if contents != nil {
		args = append(args, "--contents", "-")
	}
	args = append(args, "--", file)

	out, err := runStdin(repoPath, contents, args...)
	if err != nil {
		return nil, err
	}
	return parseBlamePorcelain(out), nil
}

// parseBlamePorcelain parses `git blame --porcelain` output.
//
// The format groups lines by commit. A group starts with a header line
// "<40-hex-sha> <orig-line> <final-line> [<lines-in-group>]" followed by commit
// metadata headers (author, author-mail, author-time, summary, …) and finally a
// TAB-prefixed line carrying the source content. Metadata headers are only
// emitted the FIRST time a sha appears; later groups for the same sha repeat
// just the header + content. We therefore cache metadata by sha.
func parseBlamePorcelain(out string) []BlameLine {
	type meta struct {
		author  string
		email   string
		time    int64
		summary string
	}
	metas := map[string]*meta{}

	var lines []BlameLine
	var curSHA string
	var finalLine int

	for _, line := range strings.Split(out, "\n") {
		// A TAB-prefixed line is the actual file content — emit the BlameLine
		// using the metadata accumulated for the current sha.
		if strings.HasPrefix(line, "\t") {
			m := metas[curSHA]
			if m == nil {
				m = &meta{}
			}
			lines = append(lines, BlameLine{
				Line:        finalLine,
				Commit:      curSHA,
				Author:      m.author,
				AuthorEmail: m.email,
				AuthorTime:  m.time,
				Summary:     m.summary,
				Uncommitted: curSHA == zeroSHA,
			})
			continue
		}

		// A header group line: "<sha> <orig> <final> [<num>]".
		if fields := strings.Fields(line); len(fields) >= 3 && isHex40(fields[0]) {
			curSHA = fields[0]
			finalLine, _ = strconv.Atoi(fields[2])
			if metas[curSHA] == nil {
				metas[curSHA] = &meta{}
			}
			continue
		}

		// A metadata header for the current sha.
		key, val, found := strings.Cut(line, " ")
		if !found {
			continue
		}
		m := metas[curSHA]
		if m == nil {
			continue
		}
		switch key {
		case "author":
			m.author = val
		case "author-mail":
			m.email = strings.Trim(val, "<>")
		case "author-time":
			m.time, _ = strconv.ParseInt(val, 10, 64)
		case "summary":
			m.summary = val
		}
	}

	return lines
}

// isHex40 reports whether s is a 40-character lowercase-or-mixed hex string,
// i.e. a full git object id. Used to distinguish blame group header lines from
// metadata header lines, which never start with a 40-hex token.
func isHex40(s string) bool {
	if len(s) != 40 {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') && (c < 'A' || c > 'F') {
			return false
		}
	}
	return true
}
