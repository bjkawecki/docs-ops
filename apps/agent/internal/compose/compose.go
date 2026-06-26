package compose

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type Runner struct {
	InstallDir   string
	EnvFile      string
	ComposeFiles []string
	ExtraCompose string
	WaitTimeout  time.Duration
}

func (r *Runner) composeArgs() []string {
	args := []string{"compose", "--env-file", r.EnvFile}
	for _, f := range r.ComposeFiles {
		args = append(args, "-f", f)
	}
	if strings.TrimSpace(r.ExtraCompose) != "" {
		for _, f := range strings.Split(r.ExtraCompose, ":") {
			f = strings.TrimSpace(f)
			if f != "" {
				args = append(args, "-f", f)
			}
		}
	}
	return args
}

func (r *Runner) Pull(ctx context.Context) error {
	args := append(r.composeArgs(), "pull")
	return r.run(ctx, args)
}

func (r *Runner) Up(ctx context.Context) error {
	args := append(r.composeArgs(), "up", "-d")
	if r.supportsWait(ctx) {
		args = append(args, "--wait", "--wait-timeout", fmt.Sprintf("%d", int(r.WaitTimeout.Seconds())))
	}
	return r.run(ctx, args)
}

func (r *Runner) supportsWait(ctx context.Context) bool {
	args := append(r.composeArgs(), "up", "--help")
	var out bytes.Buffer
	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.Dir = r.InstallDir
	cmd.Env = environForCompose()
	cmd.Stdout = &out
	cmd.Stderr = &out
	if err := cmd.Run(); err != nil {
		return false
	}
	return strings.Contains(out.String(), "--wait")
}

// environForCompose drops DOCSOPS_* (and COMPOSE_*) inherited from the agent process.
// systemd loads docsops.env into the agent; after patch_env the file is newer but process
// env still wins over --env-file in docker compose unless we strip those variables.
func environForCompose() []string {
	var out []string
	for _, entry := range os.Environ() {
		key, _, ok := strings.Cut(entry, "=")
		if !ok {
			continue
		}
		if strings.HasPrefix(key, "DOCSOPS_") || strings.HasPrefix(key, "COMPOSE_") {
			continue
		}
		out = append(out, entry)
	}
	return out
}

func (r *Runner) run(ctx context.Context, args []string) error {
	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.Dir = r.InstallDir
	cmd.Env = environForCompose()
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return fmt.Errorf("docker %s: %s", strings.Join(args, " "), msg)
	}
	return nil
}

func DockerComposeAvailable() bool {
	cmd := exec.Command("docker", "compose", "version")
	return cmd.Run() == nil
}

func InstallDirValid(installDir string) bool {
	_, err := os.Stat(filepath.Join(installDir, "docker-compose.prod.yml"))
	return err == nil
}
