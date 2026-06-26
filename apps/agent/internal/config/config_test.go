package config

import "testing"

func TestValidateReleaseTag(t *testing.T) {
	if err := ValidateReleaseTag("v0.1.0"); err != nil {
		t.Fatal(err)
	}
	if err := ValidateReleaseTag("main"); err == nil {
		t.Fatal("expected error for main")
	}
}
