package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"
)

const (
	maxDoc      = 10 << 20
	maxAsset    = 25 << 20
	maxCaps     = 64
	pairTTL     = 60 * time.Second
	launchQuiet = 10 * time.Second
)

var (
	docExts   = map[string]bool{".md": true, ".markdown": true, ".mdx": true, ".mdown": true, ".txt": true}
	assetExts = map[string]bool{".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true, ".avif": true, ".svg": true, ".drawio": true}
	utf8BOM   = []byte{0xEF, 0xBB, 0xBF}

	errTooBig  = errors.New("too big")
	errNotFile = errors.New("not a regular file")
)

// httpErr is a failure the handler turns into a status. version is the file's current version, sent with a 412.
type httpErr struct {
	status  int
	msg     string
	version *string
}

func (e *httpErr) Error() string { return e.msg }

// doc is one open tab. The path is the real path, symlinks resolved. mu orders a save against the poller's read; gone and viewed are
// atomic so the list can be built without it. A lock on mu may take the registry's, never the other way round.
type doc struct {
	id     string
	path   string
	viewed atomic.Bool
	gone   atomic.Bool

	mu       sync.Mutex
	version  string // SHA-256 of the bytes this server last read or wrote
	bom      bool
	info     fs.FileInfo // the stat that version belongs to
	settling atomic.Bool
}

type event struct {
	name string
	data []byte
}

// stream is one connected event reader. A reader that cannot keep up is dropped; it reconnects and gets the full list again.
type stream struct {
	ch   chan event
	drop chan struct{}
	once sync.Once
}

type registry struct {
	mu         sync.Mutex
	docs       []*doc
	caps       [][32]byte
	pairs      map[string]time.Time
	lastLaunch time.Time
	dir        string

	smu     sync.Mutex
	streams map[*stream]struct{}
	nstream atomic.Int32
	stop    context.CancelFunc
	pollCtx context.Context
}

type stateDoc struct {
	ID     string `json:"id"`
	Path   string `json:"path"`
	Viewed bool   `json:"viewed"`
}

type stateFile struct {
	Docs []stateDoc `json:"docs"`
	Caps []string   `json:"caps"`
}

func sum(b []byte) string {
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

func randToken(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err) // no entropy: nothing safe can follow
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

// loadRegistry reads state.json. A missing file is an empty registry; a corrupt one is kept as state.json.bad and the registry starts empty.
func loadRegistry(dir string) *registry {
	r := &registry{dir: dir, pairs: map[string]time.Time{}, streams: map[*stream]struct{}{}}
	file := filepath.Join(dir, "state.json")
	data, err := os.ReadFile(file)
	if err != nil {
		return r
	}
	var st stateFile
	if err := json.Unmarshal(data, &st); err != nil {
		os.Rename(file, file+".bad")
		return r
	}
	for _, c := range st.Caps {
		if b, err := hex.DecodeString(c); err == nil && len(b) == 32 {
			r.caps = append(r.caps, [32]byte(b))
		}
	}
	for _, sd := range st.Docs {
		if sd.ID == "" || !filepath.IsAbs(sd.Path) {
			continue
		}
		d := &doc{id: sd.ID, path: sd.Path}
		d.viewed.Store(sd.Viewed)
		if raw, info, err := readRaw(d.path); err == nil {
			d.version, d.info, d.bom = sum(raw), info, bytes.HasPrefix(raw, utf8BOM)
		} else if errors.Is(err, fs.ErrNotExist) {
			d.gone.Store(true)
		}
		r.docs = append(r.docs, d)
	}
	return r
}

// persist writes state.json atomically. The caller holds r.mu.
func (r *registry) persist() {
	st := stateFile{Docs: []stateDoc{}, Caps: []string{}}
	for _, d := range r.docs {
		st.Docs = append(st.Docs, stateDoc{d.id, d.path, d.viewed.Load()})
	}
	for _, c := range r.caps {
		st.Caps = append(st.Caps, hex.EncodeToString(c[:]))
	}
	data, _ := json.Marshal(st)
	tmp := filepath.Join(r.dir, "state.json.tmp")
	if os.WriteFile(tmp, data, 0o600) == nil {
		os.Rename(tmp, filepath.Join(r.dir, "state.json"))
	}
}

func (r *registry) find(id string) *doc {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, d := range r.docs {
		if d.id == id {
			return d
		}
	}
	return nil
}

// project is the folder holding .git above the document, else the document's own folder. Assets and links stay inside it.
func project(path string) (root, name string) {
	dir := filepath.Dir(path)
	for p := dir; ; p = filepath.Dir(p) {
		if _, err := os.Lstat(filepath.Join(p, ".git")); err == nil {
			return p, filepath.Base(p)
		}
		if filepath.Dir(p) == p {
			break
		}
	}
	return dir, filepath.Base(dir)
}

type listItem struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Project string `json:"project"`
	Unread  bool   `json:"unread"`
	Gone    bool   `json:"gone"`
}

// list is the tab list in order.
func (r *registry) list() []listItem {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.listLocked()
}

func (r *registry) listLocked() []listItem {
	out := make([]listItem, 0, len(r.docs))
	for _, d := range r.docs {
		_, p := project(d.path)
		out = append(out, listItem{d.id, filepath.Base(d.path), p, !d.viewed.Load(), d.gone.Load()})
	}
	return out
}

// publishDocs sends the full list to every stream.
func (r *registry) publishDocs() {
	r.publish("docs", map[string]any{"list": r.list()})
}

func (r *registry) publish(name string, v any) {
	data, _ := json.Marshal(v)
	ev := event{name, data}
	r.smu.Lock()
	defer r.smu.Unlock()
	for s := range r.streams {
		select {
		case s.ch <- ev:
		default:
			s.once.Do(func() { close(s.drop) })
		}
	}
}

// attach registers an event reader. The first one starts the poller; with none connected the server does no periodic work.
func (r *registry) attach(poll func(context.Context)) *stream {
	s := &stream{ch: make(chan event, 64), drop: make(chan struct{})}
	r.smu.Lock()
	defer r.smu.Unlock()
	r.streams[s] = struct{}{}
	r.nstream.Store(int32(len(r.streams)))
	if len(r.streams) == 1 {
		ctx, cancel := context.WithCancel(context.Background())
		r.stop, r.pollCtx = cancel, ctx
		go poll(ctx)
	} else {
		// A new reader gets every document checked once, not only after the next tick.
		go r.tick(r.pollCtx)
	}
	return s
}

func (r *registry) detach(s *stream) {
	r.smu.Lock()
	defer r.smu.Unlock()
	delete(r.streams, s)
	r.nstream.Store(int32(len(r.streams)))
	if len(r.streams) == 0 && r.stop != nil {
		r.stop()
		r.stop = nil
	}
}

// register adds a document by real path, or returns the open one that is the same file.
func (r *registry) register(real string, info fs.FileInfo) (d *doc, opened bool, err error) {
	raw, st, err := readRaw(real)
	if err != nil {
		return nil, false, err
	}
	r.mu.Lock()
	for _, e := range r.docs {
		if s, err := os.Stat(e.path); (err == nil && os.SameFile(info, s)) || e.path == real {
			r.mu.Unlock()
			return e, false, nil
		}
	}
	d = &doc{id: randToken(9), path: real, version: sum(raw), info: st, bom: bytes.HasPrefix(raw, utf8BOM)}
	r.docs = append(r.docs, d)
	r.persist()
	r.mu.Unlock()
	r.publishDocs()
	return d, true, nil
}

// launchNow is true for one caller when no window is connected and none was launched lately, so a burst of opens starts one window.
func (r *registry) launchNow() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.nstream.Load() > 0 || time.Since(r.lastLaunch) < launchQuiet {
		return false
	}
	r.lastLaunch = time.Now()
	return true
}

func (r *registry) close(id string) bool {
	r.mu.Lock()
	ok := false
	for i, d := range r.docs {
		if d.id == id {
			r.docs = append(r.docs[:i:i], r.docs[i+1:]...)
			ok = true
			break
		}
	}
	if ok {
		r.persist()
	}
	r.mu.Unlock()
	if ok {
		r.publishDocs()
	}
	return ok
}

func (r *registry) setViewed(d *doc, v bool) {
	r.mu.Lock()
	d.viewed.Store(v)
	r.persist()
	r.mu.Unlock()
	r.publishDocs()
}

// reorder puts the listed ids first, in that order; open tabs not listed keep their place after them.
func (r *registry) reorder(ids []string) {
	r.mu.Lock()
	var out []*doc
	for _, id := range ids {
		for i, d := range r.docs {
			if d.id == id {
				out = append(out, d)
				r.docs = append(r.docs[:i:i], r.docs[i+1:]...)
				break
			}
		}
	}
	r.docs = append(out, r.docs...)
	r.persist()
	r.mu.Unlock()
	r.publishDocs()
}

// newPair makes a single-use code valid for pairTTL.
func (r *registry) newPair() (string, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.purgePairs()
	if len(r.pairs) >= 16 {
		return "", false
	}
	code := randToken(16)
	r.pairs[code] = time.Now().Add(pairTTL)
	return code, true
}

func (r *registry) purgePairs() {
	for c, exp := range r.pairs {
		if time.Now().After(exp) {
			delete(r.pairs, c)
		}
	}
}

// claim spends a pair code for a capability. The code is compared in constant time and removed whether or not later steps succeed.
func (r *registry) claim(code string) (string, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.purgePairs()
	found := ""
	for c := range r.pairs {
		if subtle.ConstantTimeCompare([]byte(c), []byte(code)) == 1 {
			found = c
		}
	}
	if found == "" {
		return "", false
	}
	delete(r.pairs, found)
	cap := randToken(32)
	r.caps = append(r.caps, sha256.Sum256([]byte(cap)))
	if len(r.caps) > maxCaps {
		r.caps = r.caps[len(r.caps)-maxCaps:]
	}
	r.persist()
	return cap, true
}

func (r *registry) capOK(cap string) bool {
	h := sha256.Sum256([]byte(cap))
	r.mu.Lock()
	defer r.mu.Unlock()
	ok := 0
	for _, c := range r.caps {
		ok |= subtle.ConstantTimeCompare(c[:], h[:])
	}
	return ok == 1
}

// readRaw reads a document inside its own folder, so a symlink swapped in after open cannot lead out of it.
func readRaw(path string) ([]byte, fs.FileInfo, error) {
	root, err := os.OpenRoot(filepath.Dir(path))
	if err != nil {
		return nil, nil, err
	}
	defer root.Close()
	return readIn(root, filepath.Base(path))
}

func readIn(root *os.Root, base string) ([]byte, fs.FileInfo, error) {
	f, err := root.Open(base)
	if err != nil {
		return nil, nil, err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return nil, nil, err
	}
	if !st.Mode().IsRegular() {
		return nil, nil, errNotFile
	}
	raw, err := io.ReadAll(io.LimitReader(f, maxDoc+1))
	if err != nil {
		return nil, nil, err
	}
	if len(raw) > maxDoc {
		return nil, nil, errTooBig
	}
	return raw, st, nil
}

// decode splits raw bytes into the text a person edits. Text that is not UTF-8 is lossy and the document read-only.
func decode(raw []byte) (text string, bom, readonly bool) {
	b := bytes.TrimPrefix(raw, utf8BOM)
	bom = len(b) != len(raw)
	if utf8.Valid(b) {
		return string(b), bom, false
	}
	return strings.ToValidUTF8(string(b), "�"), bom, true
}

// save replaces the file with text if it is still the version the caller read (or, with create, if nothing is there).
// It re-reads and hashes the file under the lock; a write between that hash and the rename is lost, which docs/local.md names as the limit.
func (d *doc) save(text []byte, ifMatch string, create bool) (string, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	root, err := os.OpenRoot(filepath.Dir(d.path))
	if err != nil {
		return "", &httpErr{status: 409, msg: "the folder is gone"}
	}
	defer root.Close()
	base := filepath.Base(d.path)
	mode, bom := fs.FileMode(0o644), d.bom
	raw, st, err := readIn(root, base)
	switch {
	case err == nil:
		cur := sum(raw)
		if create || cur != ifMatch {
			return "", &httpErr{status: 412, msg: "the file changed", version: &cur}
		}
		if _, _, ro := decode(raw); ro {
			return "", &httpErr{status: 403, msg: "the file is not UTF-8"}
		}
		mode, bom = st.Mode().Perm(), bytes.HasPrefix(raw, utf8BOM)
	case errors.Is(err, fs.ErrNotExist):
		if !create {
			none := ""
			return "", &httpErr{status: 412, msg: "the file is gone", version: &none}
		}
	default:
		return "", &httpErr{status: 500, msg: "cannot read the file"}
	}
	out := text
	if bom {
		out = append(append([]byte{}, utf8BOM...), text...)
	}
	tmp := "." + base + ".md-" + randToken(6) + ".tmp"
	f, err := root.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return "", &httpErr{status: 500, msg: "cannot write beside the file"}
	}
	_, err = f.Write(out)
	if err == nil {
		err = f.Chmod(mode)
	}
	if err == nil {
		err = f.Sync()
	}
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err == nil {
		if create {
			// Link fails if anything is there, which keeps a recreate from replacing a file that appeared meanwhile.
			if err = root.Link(tmp, base); errors.Is(err, fs.ErrExist) {
				root.Remove(tmp)
				return "", &httpErr{status: 412, msg: "a file is there"}
			}
			root.Remove(tmp)
		} else {
			err = root.Rename(tmp, base)
		}
	}
	if err != nil {
		root.Remove(tmp)
		return "", &httpErr{status: 500, msg: "cannot replace the file"}
	}
	v := sum(out)
	d.version, d.bom = v, bom
	if info, err := root.Stat(base); err == nil {
		d.info = info
	}
	d.gone.Store(false)
	return v, nil
}

// openRel opens rel, written in the document, inside the document's project. The path is checked as written, then the symlink-resolved
// target is checked for folder and extension, then the file is opened through os.Root so a link swapped in between cannot leave the project.
func (d *doc) openRel(rel string, exts map[string]bool, max int64) (*os.File, string, error) {
	if rel == "" || strings.ContainsRune(rel, 0) || strings.HasPrefix(rel, "/") || filepath.IsAbs(rel) {
		return nil, "", &httpErr{status: 400, msg: "bad path"}
	}
	base, _ := project(d.path)
	from, err := filepath.Rel(base, filepath.Dir(d.path))
	if err != nil {
		return nil, "", &httpErr{status: 403, msg: "outside the project"}
	}
	target := filepath.Join(from, filepath.FromSlash(rel))
	if target == ".." || strings.HasPrefix(target, ".."+string(filepath.Separator)) {
		return nil, "", &httpErr{status: 403, msg: "outside the project"}
	}
	real, err := filepath.EvalSymlinks(filepath.Join(base, target))
	if err != nil {
		return nil, "", &httpErr{status: 404, msg: "not found"}
	}
	if !strings.HasPrefix(real, base+string(filepath.Separator)) {
		return nil, "", &httpErr{status: 403, msg: "outside the project"}
	}
	if !exts[strings.ToLower(filepath.Ext(real))] {
		return nil, "", &httpErr{status: 415, msg: "type not allowed"}
	}
	root, err := os.OpenRoot(base)
	if err != nil {
		return nil, "", &httpErr{status: 404, msg: "not found"}
	}
	defer root.Close()
	f, err := root.Open(target)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, "", &httpErr{status: 404, msg: "not found"}
		}
		return nil, "", &httpErr{status: 403, msg: "outside the project"}
	}
	st, err := f.Stat()
	if err != nil || !st.Mode().IsRegular() {
		f.Close()
		return nil, "", &httpErr{status: 404, msg: "not a file"}
	}
	if st.Size() > max {
		f.Close()
		return nil, "", &httpErr{status: 413, msg: "too large"}
	}
	return f, real, nil
}

// poll runs while at least one stream is connected: a 1 s tick, plus a check as soon as a stream attaches.
func (r *registry) poll(ctx context.Context) {
	t := time.NewTicker(time.Second)
	defer t.Stop()
	for {
		r.tick(ctx)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

func same(a, b fs.FileInfo) bool {
	return a != nil && b != nil && os.SameFile(a, b) && a.Size() == b.Size() && a.ModTime().Equal(b.ModTime())
}

func statDoc(path string) (fs.FileInfo, error) {
	root, err := os.OpenRoot(filepath.Dir(path))
	if err != nil {
		return nil, err
	}
	defer root.Close()
	return root.Stat(filepath.Base(path))
}

func (r *registry) tick(ctx context.Context) {
	r.mu.Lock()
	docs := append([]*doc(nil), r.docs...)
	r.mu.Unlock()
	for _, d := range docs {
		st, err := statDoc(d.path)
		switch {
		case errors.Is(err, fs.ErrNotExist):
			d.mu.Lock()
			was := d.gone.Swap(true)
			d.mu.Unlock()
			if !was {
				r.publish("gone", map[string]string{"id": d.id})
				r.publishDocs()
			}
		case err != nil:
		default:
			d.mu.Lock()
			quiet := !d.gone.Load() && same(d.info, st)
			d.mu.Unlock()
			if !quiet && d.settling.CompareAndSwap(false, true) {
				go r.settle(ctx, d, st)
			}
		}
	}
}

// settle waits for the file to stop changing: two stats about 500 ms apart must match, and an empty file must hold for about 2 s,
// since an editor or agent often truncates before it writes. Then it hashes the bytes and publishes if they differ from the known version.
func (r *registry) settle(ctx context.Context, d *doc, st fs.FileInfo) {
	defer d.settling.Store(false)
	for stable, rounds := 0, 0; ; rounds++ {
		select {
		case <-ctx.Done():
			return
		case <-time.After(500 * time.Millisecond):
		}
		next, err := statDoc(d.path)
		if err != nil {
			return
		}
		if !same(st, next) {
			st, stable = next, 0
			if rounds < 240 {
				continue
			}
		} else if stable++; st.Size() == 0 && stable < 4 && rounds < 240 {
			continue
		}
		break
	}
	d.mu.Lock()
	raw, info, err := readRaw(d.path)
	if err != nil {
		d.mu.Unlock()
		return
	}
	v, was := sum(raw), d.gone.Swap(false)
	changed := v != d.version
	d.version, d.info, d.bom = v, info, bytes.HasPrefix(raw, utf8BOM)
	d.mu.Unlock()
	switch {
	case was:
		if changed {
			d.viewed.Store(false)
		}
		r.publish("back", map[string]string{"id": d.id, "version": v})
	case changed:
		d.viewed.Store(false)
		r.publish("change", map[string]string{"id": d.id, "version": v})
	default:
		return
	}
	r.mu.Lock()
	r.persist()
	r.mu.Unlock()
	r.publishDocs()
}
