package main

import (
	"bufio"
	"crypto/sha256"
	"crypto/subtle"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

//go:embed all:dist
var assets embed.FS

const (
	port   = 4874
	addr   = "127.0.0.1:4874"
	origin = "http://" + addr
)

type rule struct {
	path    string
	headers [][2]string // a name with no value drops that header
}

type server struct {
	site  fs.FS
	rules []rule
	etags sync.Map
	reg   *registry
	token [32]byte // SHA-256 of the token file's contents
	build string
	done  chan struct{}
	mux   *http.ServeMux
}

func newServer(reg *registry, token string) (*server, error) {
	site, err := fs.Sub(assets, "dist")
	if err != nil {
		return nil, err
	}
	s := &server{site: site, reg: reg, token: sha256.Sum256([]byte(token)), done: make(chan struct{})}
	if s.rules, err = parseHeaders(site); err != nil {
		return nil, err
	}
	s.build = buildID(site)
	s.routes()
	return s, nil
}

// buildID names the page this binary carries, so a stale service shows up in `md doctor`.
func buildID(site fs.FS) string {
	f, err := site.Open("index.html")
	if err != nil {
		return ""
	}
	defer f.Close()
	h := sha256.New()
	io.Copy(h, f)
	return fmt.Sprintf("%x", h.Sum(nil)[:4])
}

// parseHeaders reads _headers: a path line, then indented "Name: value" lines, or "! Name" to drop a header set by a wider rule.
// HSTS is dropped; it belongs to the hosted site.
func parseHeaders(site fs.FS) ([]rule, error) {
	f, err := site.Open("_headers")
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var rules []rule
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := sc.Text()
		switch {
		case strings.TrimSpace(line) == "":
		case line[0] != ' ' && line[0] != '\t':
			rules = append(rules, rule{path: strings.TrimSpace(line)})
		case len(rules) > 0:
			r := &rules[len(rules)-1]
			t := strings.TrimSpace(line)
			if name, ok := strings.CutPrefix(t, "!"); ok {
				r.headers = append(r.headers, [2]string{strings.TrimSpace(name), ""})
			} else if name, value, ok := strings.Cut(t, ":"); ok && !strings.EqualFold(name, "Strict-Transport-Security") {
				r.headers = append(r.headers, [2]string{name, strings.TrimSpace(value)})
			}
		}
	}
	return rules, sc.Err()
}

// apply sets the headers of every rule that matches p. A rule that names a header replaces what a wider rule set, so the most
// specific rule wins: an exact path, then the longest prefix, then /*.
func (s *server) apply(h http.Header, p string) {
	type hit struct {
		rank int
		r    rule
	}
	var hits []hit
	for _, ru := range s.rules {
		switch {
		case ru.path == p:
			hits = append(hits, hit{1 << 20, ru})
		case strings.HasSuffix(ru.path, "*") && strings.HasPrefix(p, strings.TrimSuffix(ru.path, "*")):
			hits = append(hits, hit{len(ru.path), ru})
		}
	}
	sort.SliceStable(hits, func(i, j int) bool { return hits[i].rank < hits[j].rank })
	for _, ht := range hits {
		seen := map[string]bool{}
		for _, kv := range ht.r.headers {
			if !seen[kv[0]] {
				h.Del(kv[0])
				seen[kv[0]] = true
			}
			if kv[1] != "" {
				h.Add(kv[0], kv[1])
			}
		}
	}
}

func (s *server) routes() {
	m := http.NewServeMux()
	m.HandleFunc("GET /api/health", s.health)
	m.HandleFunc("POST /api/open", s.needToken(s.open))
	m.HandleFunc("POST /api/pair", s.needToken(s.pair))
	m.HandleFunc("POST /api/pair/claim", s.claim)
	m.HandleFunc("GET /api/docs", s.needCap(s.docs))
	m.HandleFunc("GET /api/doc/{id}", s.needCap(s.getDoc))
	m.HandleFunc("PUT /api/doc/{id}", s.needCap(s.putDoc))
	m.HandleFunc("DELETE /api/doc/{id}", s.needCap(s.closeDoc))
	m.HandleFunc("PATCH /api/doc/{id}", s.needCap(s.patchDoc))
	m.HandleFunc("POST /api/order", s.needCap(s.order))
	m.HandleFunc("GET /api/doc/{id}/asset", s.needCap(s.asset))
	m.HandleFunc("POST /api/doc/{id}/link", s.needCap(s.link))
	m.HandleFunc("POST /api/doc/{id}/reveal", s.needCap(s.reveal))
	m.HandleFunc("POST /api/tour", s.needCap(s.tour))
	m.HandleFunc("GET /api/events", s.needCap(s.events))
	m.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) { fail(w, 404, "not found") })
	s.mux = m
}

func (s *server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if p := path.Clean("/" + r.URL.Path); p == "/api" || strings.HasPrefix(p, "/api/") {
		s.api(w, r)
		return
	}
	host, _, err := net.SplitHostPort(r.Host)
	if err != nil {
		host = r.Host
	}
	if host = strings.Trim(strings.ToLower(host), "[]"); host != "127.0.0.1" && host != "localhost" && host != "::1" {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	s.static(w, r)
}

// api runs the checks every /api request passes before anything else. localhost is refused because other ports on it share a site.
func (s *server) api(w http.ResponseWriter, r *http.Request) {
	h := w.Header()
	h.Set("Cache-Control", "no-store")
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Cross-Origin-Resource-Policy", "same-origin")
	if r.Host != addr {
		fail(w, 403, "forbidden")
		return
	}
	if o := r.Header.Values("Origin"); len(o) > 0 && (len(o) != 1 || o[0] != origin) {
		fail(w, 403, "forbidden")
		return
	}
	if f := r.Header.Values("Sec-Fetch-Site"); len(f) > 0 && (len(f) != 1 || f[0] != "same-origin") {
		fail(w, 403, "forbidden")
		return
	}
	if r.Method == http.MethodOptions {
		h.Set("Allow", "GET, POST, PUT, PATCH, DELETE")
		fail(w, 405, "method not allowed")
		return
	}
	limit := int64(64 << 10)
	if r.Method == http.MethodPut {
		limit = 11 << 20
	}
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	s.mux.ServeHTTP(w, r)
}

func (s *server) static(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	p := path.Clean("/" + r.URL.Path)
	name, status := strings.TrimPrefix(p, "/"), http.StatusOK
	if name == "" {
		name = "."
	}
	if st, err := fs.Stat(s.site, name); err == nil && st.IsDir() {
		if !strings.HasSuffix(r.URL.Path, "/") && name != "." {
			http.Redirect(w, r, p+"/", http.StatusPermanentRedirect)
			return
		}
		name = path.Join(name, "index.html")
	}
	if _, err := fs.Stat(s.site, name); err != nil || name == "_headers" || !fs.ValidPath(name) {
		name, status = "404.html", http.StatusNotFound
	}
	f, err := s.site.Open(name)
	if err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	defer f.Close()
	h := w.Header()
	s.apply(h, p)
	ctype := mime.TypeByExtension(path.Ext(name))
	if ctype == "" {
		ctype = "application/octet-stream"
	}
	h.Set("Content-Type", ctype)
	if h.Get("Cache-Control") == "" {
		h.Set("Cache-Control", "no-cache")
	}
	rs, ok := f.(io.ReadSeeker)
	if !ok {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	if status == http.StatusOK {
		h.Set("ETag", s.etag(name, rs))
		http.ServeContent(w, r, name, time.Time{}, rs)
		return
	}
	w.WriteHeader(status)
	if r.Method != http.MethodHead {
		io.Copy(w, rs)
	}
}

// etag is a hash of the file's bytes; the files cannot change while the binary runs, so each is hashed once.
func (s *server) etag(name string, rs io.ReadSeeker) string {
	if v, ok := s.etags.Load(name); ok {
		return v.(string)
	}
	sum := sha256.New()
	io.Copy(sum, rs)
	rs.Seek(0, io.SeekStart)
	tag := fmt.Sprintf(`"%x"`, sum.Sum(nil)[:8])
	s.etags.Store(name, tag)
	return tag
}

// API plumbing

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func failErr(w http.ResponseWriter, err error) {
	var he *httpErr
	if errors.As(err, &he) {
		body := map[string]any{"error": he.msg}
		if he.version != nil {
			body["version"] = *he.version
		}
		writeJSON(w, he.status, body)
		return
	}
	fail(w, 500, "internal error")
}

func decodeBody(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		var big *http.MaxBytesError
		if errors.As(err, &big) {
			fail(w, 413, "too large")
		} else {
			fail(w, 400, "bad request")
		}
		return false
	}
	return true
}

func bearer(r *http.Request) string {
	v, _ := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	return v
}

func (s *server) needToken(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		got := sha256.Sum256([]byte(bearer(r)))
		if subtle.ConstantTimeCompare(got[:], s.token[:]) != 1 {
			fail(w, 401, "unauthorized")
			return
		}
		next(w, r)
	}
}

func (s *server) needCap(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.reg.capOK(bearer(r)) {
			fail(w, 401, "unauthorized")
			return
		}
		next(w, r)
	}
}

// doc finds the document named in the path, or answers 404.
func (s *server) doc(w http.ResponseWriter, r *http.Request) *doc {
	d := s.reg.find(r.PathValue("id"))
	if d == nil {
		fail(w, 404, "no such document")
	}
	return d
}

// API routes

func (s *server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]string{"app": "md", "build": s.build})
}

type opened struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Project string `json:"project"`
	Opened  bool   `json:"opened"`
	Launch  bool   `json:"launch"`
}

// openPath registers a file by absolute path. The extension is checked on the resolved target, and the size before anything is read.
func (s *server) openPath(p string) (*opened, error) {
	if !filepath.IsAbs(p) || strings.ContainsRune(p, 0) {
		return nil, &httpErr{status: 400, msg: "the path must be absolute"}
	}
	real, err := filepath.EvalSymlinks(p)
	if err != nil {
		return nil, &httpErr{status: 404, msg: "not found"}
	}
	info, err := os.Stat(real)
	if err != nil || !info.Mode().IsRegular() {
		return nil, &httpErr{status: 404, msg: "not a file"}
	}
	if !docExts[strings.ToLower(filepath.Ext(real))] {
		return nil, &httpErr{status: 415, msg: "type not allowed"}
	}
	if info.Size() > maxDoc {
		return nil, &httpErr{status: 413, msg: "too large"}
	}
	d, fresh, err := s.reg.register(real, info)
	if err != nil {
		if errors.Is(err, errTooBig) {
			return nil, &httpErr{status: 413, msg: "too large"}
		}
		return nil, &httpErr{status: 404, msg: "not found"}
	}
	_, proj := project(d.path)
	return &opened{ID: d.id, Name: filepath.Base(d.path), Project: proj, Opened: fresh}, nil
}

func (s *server) open(w http.ResponseWriter, r *http.Request) {
	var in struct{ Path string }
	if !decodeBody(w, r, &in) {
		return
	}
	out, err := s.openPath(in.Path)
	if err != nil {
		failErr(w, err)
		return
	}
	out.Launch = s.reg.launchNow()
	writeJSON(w, 200, out)
}

func (s *server) link(w http.ResponseWriter, r *http.Request) {
	d := s.doc(w, r)
	if d == nil {
		return
	}
	var in struct{ P string }
	if !decodeBody(w, r, &in) {
		return
	}
	f, real, err := d.openRel(in.P, docExts, maxDoc)
	if err != nil {
		failErr(w, err)
		return
	}
	f.Close()
	out, err := s.openPath(real)
	if err != nil {
		failErr(w, err)
		return
	}
	writeJSON(w, 200, out)
}

func (s *server) pair(w http.ResponseWriter, r *http.Request) {
	code, ok := s.reg.newPair()
	if !ok {
		fail(w, 429, "too many pending codes")
		return
	}
	writeJSON(w, 200, map[string]string{"code": code})
}

func (s *server) claim(w http.ResponseWriter, r *http.Request) {
	var in struct{ Code string }
	if !decodeBody(w, r, &in) {
		return
	}
	cap, ok := s.reg.claim(in.Code)
	if !ok {
		fail(w, 401, "unauthorized")
		return
	}
	writeJSON(w, 200, map[string]string{"cap": cap})
}

func (s *server) docs(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"list": s.reg.list()})
}

func (s *server) getDoc(w http.ResponseWriter, r *http.Request) {
	d := s.doc(w, r)
	if d == nil {
		return
	}
	_, proj := project(d.path)
	out := map[string]any{"id": d.id, "name": filepath.Base(d.path), "project": proj, "path": d.path, "version": "", "text": "", "readonly": false, "bom": false, "gone": false}
	raw, _, err := readRaw(d.path)
	switch {
	case errors.Is(err, fs.ErrNotExist):
		out["gone"] = true
	case errors.Is(err, errTooBig):
		fail(w, 413, "too large")
		return
	case err != nil:
		fail(w, 500, "cannot read the file")
		return
	default:
		text, bom, ro := decode(raw)
		out["version"], out["text"], out["bom"], out["readonly"] = sum(raw), text, bom, ro
	}
	writeJSON(w, 200, out)
}

func (s *server) putDoc(w http.ResponseWriter, r *http.Request) {
	d := s.doc(w, r)
	if d == nil {
		return
	}
	// A save can be 10 MB over a slow reader; the read deadline is longer here than for any other route.
	http.NewResponseController(w).SetReadDeadline(time.Now().Add(60 * time.Second))
	create := r.Header.Get("If-None-Match") == "*"
	match := strings.Trim(r.Header.Get("If-Match"), `"`)
	if !create && match == "" {
		fail(w, 428, "If-Match is required")
		return
	}
	text, err := io.ReadAll(r.Body)
	if err != nil {
		fail(w, 413, "too large")
		return
	}
	if len(text) > maxDoc {
		fail(w, 413, "too large")
		return
	}
	v, err := d.save(text, match, create)
	if err != nil {
		failErr(w, err)
		return
	}
	if create {
		s.reg.publishDocs()
	}
	writeJSON(w, 200, map[string]string{"version": v})
}

func (s *server) closeDoc(w http.ResponseWriter, r *http.Request) {
	if !s.reg.close(r.PathValue("id")) {
		fail(w, 404, "no such document")
		return
	}
	w.WriteHeader(204)
}

func (s *server) patchDoc(w http.ResponseWriter, r *http.Request) {
	d := s.doc(w, r)
	if d == nil {
		return
	}
	var in struct{ Viewed *bool }
	if !decodeBody(w, r, &in) || in.Viewed == nil {
		return
	}
	s.reg.setViewed(d, *in.Viewed)
	w.WriteHeader(204)
}

func (s *server) order(w http.ResponseWriter, r *http.Request) {
	var in struct{ IDs []string }
	if !decodeBody(w, r, &in) {
		return
	}
	s.reg.reorder(in.IDs)
	w.WriteHeader(204)
}

// asset serves a picture inside the document's project. The response cannot run anything: it is a download with an empty sandboxed policy.
func (s *server) asset(w http.ResponseWriter, r *http.Request) {
	d := s.doc(w, r)
	if d == nil {
		return
	}
	f, real, err := d.openRel(r.URL.Query().Get("p"), assetExts, maxAsset)
	if err != nil {
		failErr(w, err)
		return
	}
	defer f.Close()
	h := w.Header()
	h.Set("Content-Security-Policy", "default-src 'none'; sandbox")
	h.Set("Content-Disposition", "attachment")
	h.Set("X-Content-Type-Options", "nosniff")
	ctype := mime.TypeByExtension(strings.ToLower(filepath.Ext(real)))
	if ctype == "" {
		ctype = "application/octet-stream"
	}
	h.Set("Content-Type", ctype)
	http.ServeContent(w, r, "", time.Time{}, f)
}

func (s *server) events(w http.ResponseWriter, r *http.Request) {
	// No write or read deadline: this response stays open for as long as the window does.
	rc := http.NewResponseController(w)
	rc.SetWriteDeadline(time.Time{})
	rc.SetReadDeadline(time.Time{})
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	st := s.reg.attach(s.reg.poll)
	defer s.reg.detach(st)
	send := func(name string, data []byte) bool {
		if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", name, data); err != nil {
			return false
		}
		return rc.Flush() == nil
	}
	hello, _ := json.Marshal(map[string]string{"build": s.build})
	list, _ := json.Marshal(map[string]any{"list": s.reg.list()})
	if !send("hello", hello) || !send("docs", list) {
		return
	}
	ping := time.NewTicker(25 * time.Second)
	defer ping.Stop()
	for {
		select {
		case ev := <-st.ch:
			if !send(ev.name, ev.data) {
				return
			}
		case <-ping.C:
			if !send("ping", []byte("{}")) {
				return
			}
		case <-st.drop:
			return
		case <-r.Context().Done():
			return
		case <-s.done:
			return
		}
	}
}

// revealCmd runs open(1); a test replaces it.
var revealCmd = func(arg ...string) error { return exec.Command("open", arg...).Run() }

// reveal shows the document in Finder, selected, or its folder when the file is gone. The path is the one md stored, never one from the page, and it goes to open as an argument, with no shell.
func (s *server) reveal(w http.ResponseWriter, r *http.Request) {
	d := s.doc(w, r)
	if d == nil {
		return
	}
	if runtime.GOOS != "darwin" {
		fail(w, 501, "Show in Finder works on macOS only")
		return
	}
	var err error
	if _, e := os.Stat(d.path); e == nil {
		err = revealCmd("-R", d.path)
	} else if st, e := os.Stat(filepath.Dir(d.path)); e == nil && st.IsDir() {
		err = revealCmd(filepath.Dir(d.path))
	} else {
		fail(w, 404, "the file and its folder are gone")
		return
	}
	if err != nil {
		fail(w, 500, "Finder did not open")
		return
	}
	w.WriteHeader(204)
}

// tour opens the tour as a file of the person's own: the build's copy is written once to <config>/tour/tour.md, and an existing file is never overwritten, because by then it is theirs.
func (s *server) tour(w http.ResponseWriter, r *http.Request) {
	dir, err := configDir()
	if err != nil {
		fail(w, 500, "no config folder")
		return
	}
	dir = filepath.Join(dir, "tour")
	file := filepath.Join(dir, "tour.md")
	if _, err := os.Stat(file); err != nil {
		text, err := fs.ReadFile(s.site, "tour.md")
		if err != nil {
			fail(w, 404, "no tour in this build")
			return
		}
		if err := os.MkdirAll(dir, 0o700); err != nil {
			fail(w, 500, "the tour could not be written")
			return
		}
		if err := os.WriteFile(file, text, 0o600); err != nil {
			fail(w, 500, "the tour could not be written")
			return
		}
	}
	out, err := s.openPath(file)
	if err != nil {
		failErr(w, err)
		return
	}
	writeJSON(w, 200, out)
}
