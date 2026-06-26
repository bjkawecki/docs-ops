package config

import (
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"
)

var releaseTagPattern = regexp.MustCompile(`^v\d+\.\d+\.\d+$`)

type Config struct {
	Token          string
	ListenAddr     string
	StateDir       string
	InstallDir     string
	EnvFile        string
	HealthURL      string
	GitHubRepo     string
	ImagePrefix    string
	ComposeFiles   []string
	ExtraCompose   string
	SkipImagePull  bool
	BundlePath     string
	HealthRetries  int
	HealthDelaySec int
	ComposeWaitSec int
	AgentVersion   string
}

func LoadFromEnv() (Config, error) {
	token := strings.TrimSpace(os.Getenv("DOCSOPS_AGENT_TOKEN"))
	if token == "" {
		return Config{}, fmt.Errorf("DOCSOPS_AGENT_TOKEN is required")
	}

	cfg := Config{
		Token:          token,
		ListenAddr:     envOr("DOCSOPS_AGENT_LISTEN", "0.0.0.0:8091"),
		StateDir:       envOr("DOCSOPS_AGENT_STATE_DIR", "/var/lib/docsops"),
		InstallDir:     envOr("DOCSOPS_AGENT_INSTALL_DIR", "/opt/docsops"),
		EnvFile:        envOr("DOCSOPS_AGENT_ENV_FILE", "/etc/docsops/docsops.env"),
		HealthURL:      envOr("DOCSOPS_AGENT_HEALTH_URL", envOr("DOCSOPS_HEALTH_URL", "http://127.0.0.1/health")),
		GitHubRepo:     envOr("DOCSOPS_UPDATE_GITHUB_REPO", envOr("DOCSOPS_GITHUB_REPO", "bjkawecki/docs-ops")),
		ImagePrefix:    envOr("DOCSOPS_IMAGE_PREFIX", "ghcr.io/bjkawecki"),
		ExtraCompose:   strings.TrimSpace(os.Getenv("DOCSOPS_EXTRA_COMPOSE_FILES")),
		SkipImagePull:  os.Getenv("DOCSOPS_SKIP_IMAGE_PULL") == "1",
		BundlePath:     strings.TrimSpace(os.Getenv("DOCSOPS_BUNDLE_PATH")),
		HealthRetries:  envIntOr("DOCSOPS_HEALTH_RETRIES", 30),
		HealthDelaySec: envIntOr("DOCSOPS_HEALTH_DELAY", 10),
		ComposeWaitSec: envIntOr("DOCSOPS_COMPOSE_WAIT_TIMEOUT", 300),
		AgentVersion:   strings.TrimSpace(os.Getenv("DOCSOPS_AGENT_VERSION")),
	}

	composeFiles := envOr("DOCSOPS_COMPOSE_FILES", "docker-compose.yml:docker-compose.prod.yml")
	cfg.ComposeFiles = strings.Split(composeFiles, ":")

	return cfg, nil
}

func ValidateReleaseTag(version string) error {
	if !releaseTagPattern.MatchString(version) {
		return fmt.Errorf("version must be a release tag like v0.1.0, got %q", version)
	}
	return nil
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func envIntOr(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 {
		return fallback
	}
	return n
}
