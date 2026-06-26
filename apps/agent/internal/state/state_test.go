package state

import (
	"testing"
)

func TestStoreStartAndFail(t *testing.T) {
	dir := t.TempDir()
	s, err := NewStore(dir, "0.1.0")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.StartRun("run-1", "v0.1.1"); err != nil {
		t.Fatal(err)
	}
	if s.Snapshot().Idle {
		t.Fatal("expected not idle")
	}
	if err := s.Fail("TEST", "boom"); err != nil {
		t.Fatal(err)
	}
	snap := s.Snapshot()
	if !snap.Idle || snap.Run == nil || snap.Run.ErrorCode != "TEST" {
		t.Fatalf("unexpected snapshot: %+v", snap)
	}
}

func TestStoreRejectParallelStart(t *testing.T) {
	dir := t.TempDir()
	s, err := NewStore(dir, "0.1.0")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.StartRun("run-1", "v0.1.1"); err != nil {
		t.Fatal(err)
	}
	if err := s.StartRun("run-2", "v0.1.2"); err == nil {
		t.Fatal("expected parallel start error")
	}
}
