package state

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type Phase string

const (
	PhaseIdle           Phase = "idle"
	PhasePreflight      Phase = "preflight"
	PhaseDownloadBundle Phase = "download_bundle"
	PhaseExtractBundle  Phase = "extract_bundle"
	PhasePatchEnv       Phase = "patch_env"
	PhasePullImages     Phase = "pull_images"
	PhaseComposeUp      Phase = "compose_up"
	PhaseWaitHealth     Phase = "wait_health"
	PhaseVerifyVersion  Phase = "verify_version"
	PhaseCleanup        Phase = "cleanup"
	PhaseSucceeded      Phase = "succeeded"
	PhaseFailed         Phase = "failed"
)

type Run struct {
	RunID          string     `json:"runId"`
	Version        string     `json:"version"`
	Phase          Phase      `json:"phase"`
	PhaseStartedAt time.Time  `json:"phaseStartedAt"`
	StartedAt      time.Time  `json:"startedAt"`
	FinishedAt     *time.Time `json:"finishedAt,omitempty"`
	ExitCode       *int       `json:"exitCode,omitempty"`
	Error          string     `json:"error,omitempty"`
	ErrorCode      string     `json:"errorCode,omitempty"`
	LogTail        string     `json:"logTail,omitempty"`
}

type Snapshot struct {
	AgentVersion string `json:"agentVersion"`
	Idle         bool   `json:"idle"`
	Run          *Run   `json:"run"`
}

type Store struct {
	mu          sync.RWMutex
	stateDir    string
	statePath   string
	agentVersion string
	current     *Run
	logLines    []string
}

func NewStore(stateDir, agentVersion string) (*Store, error) {
	if err := os.MkdirAll(stateDir, 0o700); err != nil {
		return nil, err
	}
	s := &Store{
		stateDir:     stateDir,
		statePath:    filepath.Join(stateDir, "agent-state.json"),
		agentVersion: agentVersion,
	}
	if err := s.loadFromDisk(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) Snapshot() Snapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.current == nil || s.current.Phase == PhaseSucceeded || s.current.Phase == PhaseFailed {
		return Snapshot{AgentVersion: s.agentVersion, Idle: true, Run: s.copyRun(s.current)}
	}
	return Snapshot{AgentVersion: s.agentVersion, Idle: false, Run: s.copyRun(s.current)}
}

func (s *Store) IsRunning() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.isRunningLocked()
}

func (s *Store) isRunningLocked() bool {
	if s.current == nil {
		return false
	}
	switch s.current.Phase {
	case PhaseSucceeded, PhaseFailed:
		return false
	default:
		return true
	}
}

func (s *Store) StartRun(runID, version string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.isRunningLocked() {
		return fmt.Errorf("update already running")
	}
	now := time.Now().UTC()
	s.current = &Run{
		RunID:          runID,
		Version:        version,
		Phase:          PhasePreflight,
		PhaseStartedAt: now,
		StartedAt:      now,
	}
	s.logLines = nil
	return s.persistLocked()
}

func (s *Store) SetPhase(phase Phase) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.current == nil {
		return fmt.Errorf("no active run")
	}
	now := time.Now().UTC()
	s.current.Phase = phase
	s.current.PhaseStartedAt = now
	return s.persistLocked()
}

func (s *Store) Fail(errorCode, message string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.current == nil {
		return fmt.Errorf("no active run")
	}
	now := time.Now().UTC()
	code := 1
	s.current.Phase = PhaseFailed
	s.current.FinishedAt = &now
	s.current.ExitCode = &code
	s.current.ErrorCode = errorCode
	s.current.Error = message
	s.current.LogTail = s.tailLogLocked()
	return s.persistLocked()
}

func (s *Store) Succeed() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.current == nil {
		return fmt.Errorf("no active run")
	}
	now := time.Now().UTC()
	code := 0
	s.current.Phase = PhaseSucceeded
	s.current.FinishedAt = &now
	s.current.ExitCode = &code
	s.current.LogTail = s.tailLogLocked()
	return s.persistLocked()
}

func (s *Store) AppendLog(line string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.logLines = append(s.logLines, line)
	if len(s.logLines) > 500 {
		s.logLines = s.logLines[len(s.logLines)-500:]
	}
	if s.current != nil {
		s.current.LogTail = s.tailLogLocked()
	}
}

func (s *Store) tailLogLocked() string {
	const maxChars = 6000
	var b []byte
	for i := len(s.logLines) - 1; i >= 0; i-- {
		part := s.logLines[i] + "\n"
		if len(b)+len(part) > maxChars {
			break
		}
		b = append([]byte(part), b...)
	}
	return string(b)
}

func (s *Store) copyRun(r *Run) *Run {
	if r == nil {
		return nil
	}
	cp := *r
	return &cp
}

func (s *Store) persistLocked() error {
	data, err := json.MarshalIndent(s.current, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.statePath + ".tmp"
	if err := os.WriteFile(tmp, append(data, '\n'), 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.statePath)
}

func (s *Store) loadFromDisk() error {
	data, err := os.ReadFile(s.statePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	var run Run
	if err := json.Unmarshal(data, &run); err != nil {
		return nil
	}
	s.current = &run
	return nil
}
