package envfile

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPatchVersionTruncateWrite(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "docsops.env")
	if err := os.WriteFile(path, []byte("FOO=bar\nDOCSOPS_VERSION=v0.1.0\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := PatchVersion(path, "v0.1.1"); err != nil {
		t.Fatal(err)
	}

	got, err := ReadVersion(path)
	if err != nil {
		t.Fatal(err)
	}
	if got != "v0.1.1" {
		t.Fatalf("got %q want v0.1.1", got)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytesContains(string(data), "FOO=bar") {
		t.Fatalf("expected FOO=bar preserved, got %q", string(data))
	}
}

func bytesContains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 || indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

func TestPatchVersionAppendsWhenMissing(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "docsops.env")
	if err := os.WriteFile(path, []byte("FOO=bar\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := PatchVersion(path, "v0.2.0"); err != nil {
		t.Fatal(err)
	}
	got, err := ReadVersion(path)
	if err != nil {
		t.Fatal(err)
	}
	if got != "v0.2.0" {
		t.Fatalf("got %q", got)
	}
}
