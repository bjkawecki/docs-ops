package envfile

import (
	"bufio"
	"bytes"
	"fmt"
	"os"
	"strings"
)

func ReadVersion(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "DOCSOPS_VERSION=") {
			return strings.TrimPrefix(line, "DOCSOPS_VERSION="), nil
		}
	}
	if err := scanner.Err(); err != nil {
		return "", err
	}
	return "", nil
}

// PatchVersion writes DOCSOPS_VERSION using truncate-write (safe on bind mounts).
func PatchVersion(path, version string) error {
	content, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read env file: %w", err)
	}

	lines := strings.Split(string(content), "\n")
	found := false
	for i, line := range lines {
		if strings.HasPrefix(line, "DOCSOPS_VERSION=") {
			lines[i] = "DOCSOPS_VERSION=" + version
			found = true
			break
		}
	}
	if !found {
		if len(lines) > 0 && lines[len(lines)-1] != "" {
			lines = append(lines, "DOCSOPS_VERSION="+version)
		} else if len(lines) == 1 && lines[0] == "" {
			lines[0] = "DOCSOPS_VERSION=" + version
		} else {
			lines = append(lines, "DOCSOPS_VERSION="+version)
		}
	}

	out := strings.Join(lines, "\n")
	if !bytes.HasSuffix([]byte(out), []byte("\n")) {
		out += "\n"
	}

	f, err := os.OpenFile(path, os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return fmt.Errorf("open env file for write: %w", err)
	}
	defer f.Close()

	if _, err := f.WriteString(out); err != nil {
		return fmt.Errorf("write env file: %w", err)
	}
	return nil
}

func IsWritable(path string) bool {
	f, err := os.OpenFile(path, os.O_WRONLY, 0)
	if err != nil {
		return false
	}
	_ = f.Close()
	return true
}
