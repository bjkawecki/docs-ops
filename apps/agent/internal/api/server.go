package api

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/bjkawecki/docs-ops/apps/agent/internal/orchestrator"
	"github.com/bjkawecki/docs-ops/apps/agent/internal/state"
)

type Server struct {
	Token        string
	Store        *state.Store
	Orchestrator *orchestrator.Orchestrator
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/status", s.handleStatus)
	mux.HandleFunc("/v1/preflight", s.handlePreflight)
	mux.HandleFunc("/v1/apply", s.handleApply)
	return mux
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !s.authorize(r) {
		s.jsonError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	s.writeJSON(w, http.StatusOK, s.Store.Snapshot())
}

func (s *Server) handlePreflight(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !s.authorize(r) {
		s.jsonError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	body, err := readJSON(r)
	if err != nil {
		s.jsonError(w, http.StatusBadRequest, "invalid json")
		return
	}
	version, _ := body["version"].(string)
	version = strings.TrimSpace(version)
	if version == "" {
		s.jsonError(w, http.StatusBadRequest, "version required")
		return
	}
	s.writeJSON(w, http.StatusOK, s.Orchestrator.Preflight(version))
}

func (s *Server) handleApply(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !s.authorize(r) {
		s.jsonError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	body, err := readJSON(r)
	if err != nil {
		s.jsonError(w, http.StatusBadRequest, "invalid json")
		return
	}
	version, _ := body["version"].(string)
	runID, _ := body["runId"].(string)
	version = strings.TrimSpace(version)
	runID = strings.TrimSpace(runID)
	if version == "" {
		s.jsonError(w, http.StatusBadRequest, "version required")
		return
	}
	if runID == "" {
		s.jsonError(w, http.StatusBadRequest, "runId required")
		return
	}
	if err := s.Orchestrator.ApplyAsync(runID, version); err != nil {
		if strings.Contains(err.Error(), "already running") {
			s.jsonError(w, http.StatusConflict, err.Error())
			return
		}
		s.jsonError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.writeJSON(w, http.StatusAccepted, map[string]any{
		"accepted": true,
		"version":  version,
		"runId":    runID,
	})
}

func (s *Server) authorize(r *http.Request) bool {
	header := r.Header.Get("Authorization")
	return header == "Bearer "+s.Token
}

func (s *Server) writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func (s *Server) jsonError(w http.ResponseWriter, status int, message string) {
	s.writeJSON(w, status, map[string]string{"error": message})
}

func readJSON(r *http.Request) (map[string]any, error) {
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	var body map[string]any
	if err := json.Unmarshal(raw, &body); err != nil {
		return nil, err
	}
	return body, nil
}
