//     ▄▄ ▄▄ ▄▄  ▄▄▄▄  ▄▄▄▄ ▄▄    ▄▄▄▄▄ ▄▄▄▄
//     ██ ██ ██ ██ ▄▄ ██ ▄▄ ██    ██▄▄  ██▄█▄   Copyright (c) 2026 Julian Storer
//   ▄▄█▀ ▀███▀ ▀███▀ ▀███▀ ██▄▄▄ ██▄▄▄ ██ ██   AGPL-3.0-or-later - see LICENSE

package server

import (
	"io/fs"
	"net/http"
	"os"
	"slices"
	"strconv"
	"strings"

	"juggler/cmd/juggler/core"
	"juggler/cmd/juggler/msg"
	"juggler/cmd/juggler/server/handlers"
	"juggler/cmd/juggler/webui"
	"juggler/web"
)

// The UI language. The choice is GlobalSettings.UILocale; the translations are
// web/i18n/<locale>.json, one flat object per locale mapping each English
// source string to its translation (the format registerCatalog takes — see
// web/sdk/lib/i18n.js). web/i18n/en.json is the list of source strings that
// translators work from, never a catalogue: English is what every message
// already is.
//
// A viewer is handed its catalogue inline by serveIndex, so the first frame is
// already translated. The engine has no page of its own to read, so it fetches
// the same file through handleUICatalog. The catalogue lookup itself is
// webui.LoadCatalog, shared with the machine server's sessions page.

// uiLocale is the UI language the user chose, or "" for the default. A server
// without a settings store (a bare test server) has none.
func (s *Server) uiLocale() string {
	if s.settings == nil {
		return ""
	}
	return core.NormalizeUILocale(s.settings.get().UILocale)
}

// uiLocaleFor is the language to serve this request in: the one the user chose,
// or — with none chosen — the best match for the languages the viewer says it
// accepts (Accept-Language), and English when nothing matches.
//
// Following the viewer is what makes a fresh install open in the person's own
// language rather than English. A chosen language always wins, so the setting is
// how you stop following the viewer; clearing it — the menu's "Default" entry —
// resumes following. English is "" here, matching the default.
//
// Only languages there is a catalogue for are considered. Serving a language we
// have none for would leave the page in English while the desktop menus, which
// the app translates from the catalogue it was sent, stayed English too. The
// header is advisory: a malformed one picks a different language at worst.
func (s *Server) uiLocaleFor(r *http.Request) string {
	if chosen := s.uiLocale(); chosen != "" {
		return chosen
	}
	return matchAcceptedLocale(r.Header.Get("Accept-Language"), s.uiLocales())
}

// matchAcceptedLocale picks the best language an Accept-Language header asks
// for, from the catalogues that exist, or "" (English).
//
// The header is a comma-separated list of tags with optional q-values, most
// preferred first: "zh-CN,zh;q=0.9,en;q=0.8". A tag matches a catalogue of the
// same language, preferring the viewer's own region, then that language's other
// catalogues — "zh-Hant-TW" is served zh-Hant-TW, then zh-Hant, then zh. A
// q-value of 0 means "not acceptable" and is skipped; anything it cannot parse
// is passed over rather than failing the request. Ties keep the header's order,
// so the viewer's own preference decides.
func matchAcceptedLocale(header string, available []string) string {
	if header == "" || len(available) == 0 {
		return ""
	}
	type candidate struct {
		tag string
		q   float64
	}
	var candidates []candidate
	for _, part := range strings.Split(header, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		tag, q := part, 1.0
		if semi := strings.IndexByte(part, ';'); semi >= 0 {
			tag = strings.TrimSpace(part[:semi])
			for _, param := range strings.Split(part[semi+1:], ";") {
				if v, ok := strings.CutPrefix(strings.TrimSpace(param), "q="); ok {
					if parsed, err := strconv.ParseFloat(strings.TrimSpace(v), 64); err == nil {
						q = parsed
					}
				}
			}
		}
		// "*" matches anything, which would make the language arbitrary; a
		// zero weight is a refusal.
		if tag == "*" || q <= 0 {
			continue
		}
		tag = core.NormalizeUILocale(tag)
		if tag == "" {
			continue
		}
		if matched := bestCatalogueFor(tag, available); matched != "" {
			candidates = append(candidates, candidate{matched, q})
		}
	}
	if len(candidates) == 0 {
		return ""
	}
	slices.SortStableFunc(candidates, func(a, b candidate) int {
		switch {
		case a.q > b.q:
			return -1
		case a.q < b.q:
			return 1
		default:
			return 0
		}
	})
	return candidates[0].tag
}

// bestCatalogueFor is the catalogue to serve a request for tag, or "" when there
// is none for its language.
//
// The tag is shortened one subtag at a time, longest first, so a viewer asking
// for zh-Hant-HK is served zh-Hant — the same script — rather than whichever
// Chinese catalogue happens to sort first. Only when no prefix matches at all
// does it fall back to another catalogue of the same language, which is what
// serves a bare "zh" (zh-CN, the commoner case).
func bestCatalogueFor(tag string, available []string) string {
	subtags := strings.Split(tag, "-")
	for end := len(subtags); end >= 1; end-- {
		prefix := strings.ToLower(strings.Join(subtags[:end], "-"))
		for _, candidate := range available {
			if strings.ToLower(candidate) == prefix {
				return candidate
			}
		}
	}
	base := strings.ToLower(subtags[0])
	for _, candidate := range available {
		if strings.EqualFold(strings.SplitN(candidate, "-", 2)[0], base) {
			return candidate
		}
	}
	return ""
}

// testPageUILocale is the UI language a test server was asked to serve one page
// in, through ?uiLocale=<tag>, so a browser test can render the whole shell in
// a language without changing the setting every other page on that server
// reads. Only a test server (testMode, set by RegisterTestRoutes) honours it;
// any other server answers ok=false whatever the URL says. An invalid tag is
// ignored. The page stays in that language when the setting changes
// (app.js, createUILocaleReloader's caller).
func (s *Server) testPageUILocale(r *http.Request) (locale string, ok bool) {
	if !s.testMode {
		return "", false
	}
	q := r.URL.Query().Get("uiLocale")
	if q == "" || !core.IsValidUILocale(q) {
		return "", false
	}
	return core.NormalizeUILocale(q), true
}

// uiCatalog is the catalogue for locale from the served asset tree (the disk
// tree under --assets-from-disk, so an edited catalogue shows on reload).
func (s *Server) uiCatalog(locale string) map[string]string {
	return webui.LoadCatalog(func(p string) ([]byte, error) { return s.readWebAsset(p, web.Files) }, locale)
}

// uiCatalogResponse is GET /api/i18n/catalog's body.
type uiCatalogResponse struct {
	Locale   string            `json:"locale"`
	Messages map[string]string `json:"messages"`
	// Extensions holds each extension's own catalogue for the locale, by
	// extension id (see ExtensionsAPI.Catalogs); registered by the client under
	// that id as its namespace.
	Extensions map[string]map[string]string `json:"extensions"`
}

// handleUICatalog serves GET /api/i18n/catalog?locale=<tag>: the core
// catalogue — what the page would have been given inline — and every
// extension's. The engine reads both from here; a viewer reads the extensions'
// before loading their code (the core one is already in its page). A locale with
// no catalogue answers an empty one — every message then falls back to English,
// which is the same thing a missing catalogue means anywhere else.
func (s *Server) handleUICatalog(w http.ResponseWriter, r *http.Request) {
	locale := r.URL.Query().Get("locale")
	if !core.IsValidUILocale(locale) {
		handlers.WriteMessageError(w, r, http.StatusBadRequest, msg.New("invalid UI language"))
		return
	}
	messages := s.uiCatalog(locale)
	if messages == nil {
		messages = map[string]string{}
	}
	extensions := map[string]map[string]string{}
	if s.extensionsAPI != nil {
		extensions = s.extensionsAPI.Catalogs(locale)
	}
	handlers.WriteJSON(w, r, 0, uiCatalogResponse{Locale: locale, Messages: messages, Extensions: extensions})
}

// uiLocales is the UI languages the served asset tree has a catalogue for
// (webui.AvailableLocales): the embedded tree's, and under --assets-from-disk
// the on-disk tree's too, so a catalogue just added shows on reload.
func (s *Server) uiLocales() []string {
	trees := []fs.FS{web.Files}
	if s.assetsFromDisk {
		if staticDir, err := s.findStaticDir(); err == nil {
			trees = append(trees, os.DirFS(staticDir))
		}
	}
	return webui.AvailableLocales(trees...)
}

// uiLocalesResponse is GET /api/i18n/locales's body.
type uiLocalesResponse struct {
	// Locales are BCP 47 tags, sorted; never null.
	Locales []string `json:"locales"`
}

// handleUILocales serves GET /api/i18n/locales: the UI languages there is a
// catalogue for, which the Language picker in Settings → Appearance offers
// beside English. Adding web/i18n/<tag>.json adds the language; nothing else
// lists them.
func (s *Server) handleUILocales(w http.ResponseWriter, r *http.Request) {
	handlers.WriteJSON(w, r, 0, uiLocalesResponse{Locales: s.uiLocales()})
}
