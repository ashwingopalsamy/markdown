// Command md is md Local (docs/local.md): a server for one machine, and the command that hands it a file.
//
//	md <path>      register a file; it appears as a tab in Chrome
//	md serve       run the server (what the LaunchAgent starts)
//	md setup       create the token, install and load the LaunchAgent
//	md doctor      check the service, port, identity, Chrome and token
//	md uninstall   unload and remove the LaunchAgent; documents are the user's files and stay
//
// It binds 127.0.0.1:4874, serves the page embedded from dist, and logs no document path or content.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
)

const label = "in.ashwingopalsamy.md"

// fatal is an error that ends the command with a message and an exit code.
type fatal struct {
	code int
	msg  string
}

func (f *fatal) Error() string { return f.msg }

func main() {
	args := os.Args[1:]
	var err error
	switch {
	case len(args) == 1 && args[0] == "serve":
		err = serve()
	case len(args) == 1 && args[0] == "setup":
		err = setup()
	case len(args) == 1 && args[0] == "doctor":
		err = doctor()
	case len(args) == 1 && args[0] == "uninstall":
		err = uninstall()
	case len(args) == 1 && !strings.HasPrefix(args[0], "-"):
		err = openFile(args[0])
	default:
		err = &fatal{1, "usage: md <path> | serve | setup | doctor | uninstall"}
	}
	if err != nil {
		var f *fatal
		code := 1
		if errors.As(err, &f) {
			code = f.code
		}
		fmt.Fprintln(os.Stderr, "md:", err)
		os.Exit(code)
	}
}

func configDir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "md"), nil
}

// ensureToken returns the token, creating the file (0600, in a 0700 folder) if it is missing.
func ensureToken(dir string) (string, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	file := filepath.Join(dir, "token")
	f, err := os.OpenFile(file, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err == nil {
		_, err = io.WriteString(f, randToken(32)+"\n")
		if cerr := f.Close(); err == nil {
			err = cerr
		}
		if err != nil {
			return "", err
		}
	} else if !errors.Is(err, os.ErrExist) {
		return "", err
	}
	return readToken(dir)
}

func readToken(dir string) (string, error) {
	b, err := os.ReadFile(filepath.Join(dir, "token"))
	if err != nil {
		return "", err
	}
	t := strings.TrimSpace(string(b))
	if t == "" {
		return "", errors.New("the token file is empty")
	}
	return t, nil
}

func serve() error {
	dir, err := configDir()
	if err != nil {
		return err
	}
	token, err := ensureToken(dir)
	if err != nil {
		return err
	}
	s, err := newServer(loadRegistry(dir), token)
	if err != nil {
		return err
	}
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("cannot listen on %s: %w", addr, err)
	}
	srv := &http.Server{Handler: s, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
	srv.RegisterOnShutdown(func() { close(s.done) })
	fmt.Printf("md: serving on %s (build %s)\n", addr, s.build)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	done := make(chan error, 1)
	go func() { done <- srv.Serve(ln) }()
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		shut, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		return srv.Shutdown(shut)
	}
}

// Client side

var client = &http.Client{Timeout: 5 * time.Second}

func call(method, p, token string, body any) (int, []byte, error) {
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, origin+p, rd)
	if err != nil {
		return 0, nil, err
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	return res.StatusCode, b, nil
}

var (
	errNotRunning = errors.New("nothing is listening")
	errNotMD      = errors.New("not md")
)

// identity asks whatever holds the port who it is, and returns the build of md.
func identity() (string, error) {
	status, b, err := call("GET", "/api/health", "", nil)
	if err != nil {
		if errors.Is(err, syscall.ECONNREFUSED) {
			return "", errNotRunning
		}
		return "", errNotMD
	}
	var h struct{ App, Build string }
	if status != 200 || json.Unmarshal(b, &h) != nil || h.App != "md" {
		return "", errNotMD
	}
	return h.Build, nil
}

func openFile(arg string) error {
	abs, err := filepath.Abs(arg)
	if err != nil {
		return &fatal{2, "cannot read the path " + arg}
	}
	if _, err := identity(); err != nil {
		if errors.Is(err, errNotMD) {
			return &fatal{5, "port 4874 is held by something that is not md; stop it, then run `md setup`"}
		}
		return &fatal{5, "md is not running; run `md setup`"}
	}
	dir, err := configDir()
	if err != nil {
		return err
	}
	token, err := readToken(dir)
	if err != nil {
		return &fatal{5, "no token; run `md setup`"}
	}
	status, b, err := call("POST", "/api/open", token, map[string]string{"path": abs})
	if err != nil {
		return &fatal{5, "md is not running; run `md setup`"}
	}
	switch status {
	case 200:
	case 404:
		return &fatal{2, arg + " is not a file that exists"}
	case 415:
		return &fatal{3, arg + " is not a Markdown or text file (md, markdown, mdx, mdown, txt)"}
	case 413:
		return &fatal{4, arg + " is larger than 10 MB"}
	case 401:
		return &fatal{6, "md refused the token; run `md setup`"}
	default:
		return &fatal{6, fmt.Sprintf("md refused the file (status %d)", status)}
	}
	var out opened
	if json.Unmarshal(b, &out) != nil {
		return &fatal{6, "md sent an answer this command does not understand; run `md doctor`"}
	}
	if out.Launch {
		status, b, err := call("POST", "/api/pair", token, nil)
		var pc struct{ Code string }
		if err != nil || status != 200 || json.Unmarshal(b, &pc) != nil {
			return &fatal{6, "md would not pair a window; run `md doctor`"}
		}
		// The code is single-use and lasts 60 s; the token never goes on a command line.
		if err := openBrowser(origin + "/#pair=" + pc.Code); err != nil {
			return &fatal{6, "could not open a browser; open " + origin + " yourself"}
		}
	}
	fmt.Printf("md: %s (%s) is open\n", out.Name, out.Project)
	return nil
}

func chromeApp() string {
	home, _ := os.UserHomeDir()
	for _, p := range []string{"/Applications/Google Chrome.app", filepath.Join(home, "Applications", "Google Chrome.app")} {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

func openBrowser(url string) error {
	switch runtime.GOOS {
	case "darwin":
		if chromeApp() != "" && exec.Command("open", "-a", "Google Chrome", url).Run() == nil {
			return nil
		}
		return exec.Command("open", url).Run()
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	}
	return exec.Command("xdg-open", url).Start()
}

// Service management

func plistPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "Library", "LaunchAgents", label+".plist"), nil
}

func needMac(cmd string) error {
	if runtime.GOOS != "darwin" {
		return &fatal{1, "`md " + cmd + "` manages a macOS LaunchAgent; on this system run `md serve` yourself"}
	}
	return nil
}

func xml(s string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;").Replace(s)
}

func setup() error {
	if err := needMac("setup"); err != nil {
		return err
	}
	dir, err := configDir()
	if err != nil {
		return err
	}
	if _, err := ensureToken(dir); err != nil {
		return err
	}
	exe, err := os.Executable()
	if err == nil {
		exe, err = filepath.EvalSymlinks(exe)
	}
	if err != nil {
		return err
	}
	plist, err := plistPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(plist), 0o755); err != nil {
		return err
	}
	// No log paths: launchd discards output, so nothing about a document is written anywhere.
	body := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>%s</string>
	<key>ProgramArguments</key>
	<array>
		<string>%s</string>
		<string>serve</string>
	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
</dict>
</plist>
`, label, xml(exe))
	if err := os.WriteFile(plist, []byte(body), 0o644); err != nil {
		return err
	}
	domain := fmt.Sprintf("gui/%d", os.Getuid())
	exec.Command("launchctl", "bootout", domain+"/"+label).Run()
	// bootout returns before the old job is gone; bootstrap fails until it is.
	for i := 0; ; i++ {
		out, err := exec.Command("launchctl", "bootstrap", domain, plist).CombinedOutput()
		if err == nil {
			break
		}
		if i == 10 {
			return fmt.Errorf("launchctl bootstrap failed: %s", strings.TrimSpace(string(out)))
		}
		time.Sleep(500 * time.Millisecond)
	}
	for i := 0; i < 50; i++ {
		if build, err := identity(); err == nil {
			fmt.Printf("md: running (build %s). Try `md README.md`.\n", build)
			return nil
		}
		time.Sleep(200 * time.Millisecond)
	}
	return &fatal{1, "the service was loaded but does not answer on " + addr + "; run `md doctor`"}
}

func uninstall() error {
	if err := needMac("uninstall"); err != nil {
		return err
	}
	plist, err := plistPath()
	if err != nil {
		return err
	}
	exec.Command("launchctl", "bootout", fmt.Sprintf("gui/%d/%s", os.Getuid(), label)).Run()
	if err := os.Remove(plist); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	fmt.Println("md: service removed. Your documents, the token and state.json were left in place.")
	return nil
}

func doctor() error {
	bad := false
	line := func(ok bool, what, detail string) {
		mark := "ok  "
		if !ok {
			mark, bad = "FAIL", true
		}
		fmt.Printf("%s %s: %s\n", mark, what, detail)
	}
	dir, err := configDir()
	if err != nil {
		return err
	}
	if st, err := os.Stat(filepath.Join(dir, "token")); err != nil {
		line(false, "token", "missing; run `md setup`")
	} else if p := st.Mode().Perm(); p != 0o600 {
		line(false, "token", fmt.Sprintf("mode is %04o, expected 0600", p))
	} else {
		line(true, "token", "present, mode 0600")
	}
	build, err := identity()
	switch {
	case err == nil:
		line(true, "service", "md is answering on "+addr)
		line(true, "port", "4874 is held by md")
		if site, err := fs.Sub(assets, "dist"); err == nil && buildID(site) != build {
			line(false, "build", fmt.Sprintf("service runs %s, this binary carries %s; run `md setup`", build, buildID(site)))
		} else {
			line(true, "build", build)
		}
	case errors.Is(err, errNotMD):
		line(false, "service", "port 4874 is held by something that is not md")
		line(false, "port", "4874 is in use by another program")
	default:
		line(false, "service", "not running; run `md setup`")
		if ln, err := net.Listen("tcp", addr); err == nil {
			ln.Close()
			line(true, "port", "4874 is free")
		} else {
			line(false, "port", "4874 cannot be bound: "+err.Error())
		}
	}
	if app := chromeApp(); app != "" {
		line(true, "chrome", app)
	} else {
		line(false, "chrome", "Google Chrome.app not found; md will use your default browser")
	}
	if bad {
		return &fatal{1, "one or more checks failed"}
	}
	return nil
}
