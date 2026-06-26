package preflight

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/bjkawecki/docs-ops/apps/agent/internal/config"
)

func TestCheckLockHeld(t *testing.T) {
	dir := t.TempDir()
	lockPath := filepath.Join(dir, "update.lock")
	if err := os.WriteFile(lockPath, []byte("run-1\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	r := &Runner{
		Config:   config.Config{StateDir: dir},
		LockPath: lockPath,
	}
	check := r.checkLock()
	if check.OK {
		t.Fatal("expected lock check to fail when lock file exists")
	}
	if check.Message != "update lock held" {
		t.Fatalf("unexpected message: %q", check.Message)
	}
}

func TestCheckLockFree(t *testing.T) {
	dir := t.TempDir()
	lockPath := filepath.Join(dir, "update.lock")

	r := &Runner{
		Config:   config.Config{StateDir: dir},
		LockPath: lockPath,
	}
	check := r.checkLock()
	if !check.OK {
		t.Fatalf("expected no lock: %q", check.Message)
	}
}
