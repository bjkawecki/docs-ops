package bundle

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type Service struct {
	GitHubRepo  string
	StateDir    string
	InstallDir  string
	BundlePath  string
	HTTPClient  *http.Client
}

func (s *Service) CachedArchivePath(version string) string {
	return filepath.Join(s.StateDir, "bundles", fmt.Sprintf("docsops-%s.tar.gz", version))
}

func (s *Service) Download(version string) (archivePath string, err error) {
	if s.BundlePath != "" {
		return s.BundlePath, nil
	}

	cacheDir := filepath.Join(s.StateDir, "bundles")
	if err := os.MkdirAll(cacheDir, 0o700); err != nil {
		return "", err
	}

	archivePath = s.CachedArchivePath(version)
	if _, err := os.Stat(archivePath); err == nil {
		return archivePath, nil
	}

	url := fmt.Sprintf("https://github.com/%s/releases/download/%s/docsops-%s.tar.gz", s.GitHubRepo, version, version)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	client := s.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}
	res, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("download bundle: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download bundle: HTTP %d", res.StatusCode)
	}

	tmp := archivePath + ".part"
	f, err := os.Create(tmp)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(f, res.Body); err != nil {
		_ = f.Close()
		_ = os.Remove(tmp)
		return "", err
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmp)
		return "", err
	}
	if err := os.Rename(tmp, archivePath); err != nil {
		return "", err
	}
	return archivePath, nil
}

func (s *Service) Extract(archivePath, version string) error {
	marker := filepath.Join(s.InstallDir, ".bundle-version")
	if data, err := os.ReadFile(marker); err == nil && strings.TrimSpace(string(data)) == version {
		return nil
	}

	tmpDir, err := os.MkdirTemp("", "docsops-bundle-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmpDir)

	root, err := extractTarGz(archivePath, tmpDir)
	if err != nil {
		return err
	}

	if err := clearDir(s.InstallDir); err != nil {
		return err
	}
	if err := copyDirContents(root, s.InstallDir); err != nil {
		return err
	}

	return os.WriteFile(marker, []byte(version+"\n"), 0o600)
}

func clearDir(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if err := os.RemoveAll(filepath.Join(dir, e.Name())); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) SHA256(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func extractTarGz(archivePath, destDir string) (bundleRoot string, err error) {
	f, err := os.Open(archivePath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		return "", err
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", err
		}
		target := filepath.Join(destDir, hdr.Name)
		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0o755); err != nil {
				return "", err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return "", err
			}
			out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, os.FileMode(hdr.Mode))
			if err != nil {
				return "", err
			}
			if _, err := io.Copy(out, tr); err != nil {
				_ = out.Close()
				return "", err
			}
			_ = out.Close()
		}
	}

	return findBundleRoot(destDir)
}

func findBundleRoot(searchDir string) (string, error) {
	entries, err := os.ReadDir(searchDir)
	if err != nil {
		return "", err
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		candidate := filepath.Join(searchDir, e.Name())
		if _, err := os.Stat(filepath.Join(candidate, "scripts", "install-prod.sh")); err == nil {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("invalid release bundle: scripts/install-prod.sh missing")
}

func copyDirContents(src, dest string) error {
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, e := range entries {
		srcPath := filepath.Join(src, e.Name())
		destPath := filepath.Join(dest, e.Name())
		if e.IsDir() {
			if err := os.MkdirAll(destPath, 0o755); err != nil {
				return err
			}
			if err := copyDirContents(srcPath, destPath); err != nil {
				return err
			}
			continue
		}
		data, err := os.ReadFile(srcPath)
		if err != nil {
			return err
		}
		if err := os.WriteFile(destPath, data, 0o644); err != nil {
			return err
		}
	}
	return nil
}
