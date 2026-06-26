package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/bjkawecki/docs-ops/apps/agent/internal/api"
	"github.com/bjkawecki/docs-ops/apps/agent/internal/config"
	"github.com/bjkawecki/docs-ops/apps/agent/internal/orchestrator"
	"github.com/bjkawecki/docs-ops/apps/agent/internal/state"
)

func main() {
	if len(os.Args) > 1 {
		if err := runCLI(os.Args[1:]); err != nil {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			os.Exit(1)
		}
		return
	}

	cfg, err := config.LoadFromEnv()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	store, err := state.NewStore(cfg.StateDir, cfg.AgentVersion)
	if err != nil {
		log.Fatalf("state: %v", err)
	}

	orch := &orchestrator.Orchestrator{Config: cfg, Store: store}
	srv := &api.Server{Token: cfg.Token, Store: store, Orchestrator: orch}

	log.Printf("docsops-agent listening on %s", cfg.ListenAddr)
	if err := http.ListenAndServe(cfg.ListenAddr, srv.Handler()); err != nil {
		log.Fatalf("server: %v", err)
	}
}

func runCLI(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("usage: docsops-agent [preflight|apply] VERSION")
	}
	cfg, err := config.LoadFromEnv()
	if err != nil {
		return err
	}
	store, err := state.NewStore(cfg.StateDir, cfg.AgentVersion)
	if err != nil {
		return err
	}
	orch := &orchestrator.Orchestrator{Config: cfg, Store: store}

	switch args[0] {
	case "preflight":
		if len(args) < 2 {
			return fmt.Errorf("usage: docsops-agent preflight VERSION")
		}
		result := orch.Preflight(args[1])
		data, _ := json.MarshalIndent(result, "", "  ")
		fmt.Println(string(data))
		if !result.OK {
			os.Exit(1)
		}
		return nil
	case "apply":
		if len(args) < 2 {
			return fmt.Errorf("usage: docsops-agent apply VERSION")
		}
		runID := fmt.Sprintf("cli-%d", os.Getpid())
		if err := orch.ApplyAsync(runID, args[1]); err != nil {
			return err
		}
		for {
			snap := store.Snapshot()
			if snap.Idle {
				if snap.Run == nil {
					return fmt.Errorf("update finished without run state")
				}
				if snap.Run.ExitCode != nil && *snap.Run.ExitCode != 0 {
					return fmt.Errorf("%s", snap.Run.Error)
				}
				return nil
			}
			time.Sleep(2 * time.Second)
		}
	default:
		return fmt.Errorf("unknown command %q", args[0])
	}
}
