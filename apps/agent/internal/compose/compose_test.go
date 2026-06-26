package compose

import (
	"os"
	"slices"
	"testing"
)

func TestEnvironForCompose_stripsDocsOpsAndCompose(t *testing.T) {
	t.Setenv("DOCSOPS_VERSION", "v0.1.0")
	t.Setenv("DOCSOPS_IMAGE_PREFIX", "ghcr.io/example")
	t.Setenv("COMPOSE_PROJECT_NAME", "docsops")
	t.Setenv("PATH", "/usr/bin")

	env := environForCompose()
	if slices.Contains(env, "DOCSOPS_VERSION=v0.1.0") {
		t.Fatal("DOCSOPS_VERSION must not be passed to docker compose")
	}
	if slices.Contains(env, "COMPOSE_PROJECT_NAME=docsops") {
		t.Fatal("COMPOSE_PROJECT_NAME must come from --env-file only")
	}
	if !slices.Contains(env, "PATH="+os.Getenv("PATH")) {
		t.Fatal("PATH must be preserved")
	}
}
