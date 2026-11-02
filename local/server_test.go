package main

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
)

func TestReveal(t *testing.T) {
	var got [][]string
	was := revealCmd
	revealCmd = func(arg ...string) error { got = append(got, arg); return nil }
	defer func() { revealCmd = was }()

	reg := loadRegistry(t.TempDir())
	s, err := newServer(reg, "tok")
	if err != nil {
		t.Fatal(err)
	}
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	sub := filepath.Join(dir, "sub")
	if err := os.Mkdir(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(sub, "a.md")
	if err := os.WriteFile(file, []byte("# A\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	o, err := s.openPath(file)
	if err != nil {
		t.Fatal(err)
	}
	code, _ := reg.newPair()
	cap, _ := reg.claim(code)

	post := func(auth string) int {
		r := httptest.NewRequest(http.MethodPost, "/api/doc/"+o.ID+"/reveal", nil)
		r.Host = "127.0.0.1:4874"
		if auth != "" {
			r.Header.Set("Authorization", "Bearer "+auth)
		}
		w := httptest.NewRecorder()
		s.ServeHTTP(w, r)
		return w.Code
	}

	if c := post(""); c != http.StatusUnauthorized {
		t.Fatalf("no capability: %d, want 401", c)
	}
	if len(got) != 0 {
		t.Fatalf("open ran without a capability: %v", got)
	}
	if runtime.GOOS != "darwin" {
		if c := post(cap); c != http.StatusNotImplemented {
			t.Fatalf("off macOS: %d, want 501", c)
		}
		t.Skip("Show in Finder is macOS only")
	}
	if c := post(cap); c != http.StatusNoContent {
		t.Fatalf("present file: %d, want 204", c)
	}
	if want := [][]string{{"-R", file}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("present file: %v, want %v", got, want)
	}
	got = nil
	os.Remove(file)
	if c := post(cap); c != http.StatusNoContent {
		t.Fatalf("file gone: %d, want 204", c)
	}
	if want := [][]string{{sub}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("file gone: %v, want %v", got, want)
	}
	got = nil
	os.Remove(sub)
	if c := post(cap); c != http.StatusNotFound {
		t.Fatalf("folder gone: %d, want 404", c)
	}
	if len(got) != 0 {
		t.Fatalf("open ran with nothing to show: %v", got)
	}
}

func TestTour(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	reg := loadRegistry(t.TempDir())
	s, err := newServer(reg, "tok")
	if err != nil {
		t.Fatal(err)
	}
	code, _ := reg.newPair()
	cap, _ := reg.claim(code)
	post := func(auth string) (int, string) {
		r := httptest.NewRequest(http.MethodPost, "/api/tour", nil)
		r.Host = "127.0.0.1:4874"
		if auth != "" {
			r.Header.Set("Authorization", "Bearer "+auth)
		}
		w := httptest.NewRecorder()
		s.ServeHTTP(w, r)
		return w.Code, w.Body.String()
	}
	if c, _ := post(""); c != http.StatusUnauthorized {
		t.Fatalf("no capability: %d, want 401", c)
	}
	embedded, err := fs.ReadFile(s.site, "tour.md")
	if err != nil {
		t.Skip("this build has no tour.md (run npm run build:local)")
	}
	c, body := post(cap)
	if c != http.StatusOK || !strings.Contains(body, `"id":"`) {
		t.Fatalf("first call: %d %s, want 200 with an id", c, body)
	}
	dir, _ := configDir()
	file := filepath.Join(dir, "tour", "tour.md")
	info, err := os.Stat(file)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("mode %v, want 0600", info.Mode().Perm())
	}
	got, _ := os.ReadFile(file)
	if string(got) != string(embedded) {
		t.Fatal("the written tour is not the embedded one")
	}
	mine := []byte("# mine\n")
	if err := os.WriteFile(file, mine, 0o600); err != nil {
		t.Fatal(err)
	}
	if c, _ := post(cap); c != http.StatusOK {
		t.Fatalf("second call: %d, want 200", c)
	}
	again, _ := os.ReadFile(file)
	if string(again) != string(mine) {
		t.Fatalf("an edited tour was overwritten: %q", again)
	}
}
