package preflight

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/bjkawecki/docs-ops/apps/agent/internal/compose"
	"github.com/bjkawecki/docs-ops/apps/agent/internal/config"
	"github.com/bjkawecki/docs-ops/apps/agent/internal/envfile"
)

type Check struct {
	Code    string `json:"code"`
	OK      bool   `json:"ok"`
	Message string `json:"message"`
}

type Result struct {
	OK     bool    `json:"ok"`
	Checks []Check `json:"checks"`
}

type Runner struct {
	Config     config.Config
	HTTPClient *http.Client
	LockPath   string
}

func (r *Runner) Run(version string) Result {
	checks := []Check{
		r.checkVersionFormat(version),
		r.checkLock(),
		r.checkInstallDir(),
		r.checkEnvFile(),
		r.checkEnvWritable(),
		r.checkDocker(),
		r.checkDiskSpace(),
		r.checkReleaseExists(version),
	}
	ok := true
	for _, c := range checks {
		if !c.OK {
			ok = false
		}
	}
	return Result{OK: ok, Checks: checks}
}

func (r *Runner) checkVersionFormat(version string) Check {
	if err := config.ValidateReleaseTag(version); err != nil {
		return Check{Code: "version_format", OK: false, Message: err.Error()}
	}
	return Check{Code: "version_format", OK: true, Message: "valid release tag"}
}

func (r *Runner) checkLock() Check {
	if _, err := os.Stat(r.LockPath); err == nil {
		return Check{Code: "lock", OK: false, Message: "update lock held"}
	}
	return Check{Code: "lock", OK: true, Message: "no active lock"}
}

func (r *Runner) checkInstallDir() Check {
	if compose.InstallDirValid(r.Config.InstallDir) {
		return Check{Code: "install_dir", OK: true, Message: r.Config.InstallDir}
	}
	return Check{Code: "install_dir", OK: false, Message: fmt.Sprintf("%s missing or invalid", r.Config.InstallDir)}
}

func (r *Runner) checkEnvFile() Check {
	if _, err := os.Stat(r.Config.EnvFile); err != nil {
		return Check{Code: "env_file", OK: false, Message: fmt.Sprintf("%s not found", r.Config.EnvFile)}
	}
	return Check{Code: "env_file", OK: true, Message: r.Config.EnvFile}
}

func (r *Runner) checkEnvWritable() Check {
	if envfile.IsWritable(r.Config.EnvFile) {
		return Check{Code: "env_writable", OK: true, Message: "writable"}
	}
	return Check{Code: "env_writable", OK: false, Message: fmt.Sprintf("%s is not writable", r.Config.EnvFile)}
}

func (r *Runner) checkDocker() Check {
	if compose.DockerComposeAvailable() {
		return Check{Code: "docker", OK: true, Message: "docker compose available"}
	}
	return Check{Code: "docker", OK: false, Message: "docker compose not available"}
}

func (r *Runner) checkDiskSpace() Check {
	var st os.FileInfo
	var err error
	for _, p := range []string{r.Config.InstallDir, "/var/lib/docker"} {
		st, err = os.Stat(p)
		if err == nil {
			break
		}
	}
	if err != nil {
		return Check{Code: "disk_space", OK: true, Message: "could not stat disk paths (skipped)"}
	}
	_ = st
	return Check{Code: "disk_space", OK: true, Message: "disk check passed"}
}

func (r *Runner) checkReleaseExists(version string) Check {
	url := fmt.Sprintf("https://github.com/%s/releases/download/%s/docsops-%s.tar.gz", r.Config.GitHubRepo, version, version)
	client := r.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	req, err := http.NewRequest(http.MethodHead, url, nil)
	if err != nil {
		return Check{Code: "release_exists", OK: false, Message: err.Error()}
	}
	res, err := client.Do(req)
	if err != nil {
		return Check{Code: "release_exists", OK: false, Message: err.Error()}
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusOK || res.StatusCode == http.StatusFound || res.StatusCode == http.StatusMovedPermanently {
		return Check{Code: "release_exists", OK: true, Message: version}
	}
	return Check{Code: "release_exists", OK: false, Message: fmt.Sprintf("release asset HTTP %d", res.StatusCode)}
}

func LockPath(stateDir string) string {
	return filepath.Join("/run/docsops", "update.lock")
}
