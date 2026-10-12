//     ▄▄ ▄▄ ▄▄  ▄▄▄▄  ▄▄▄▄ ▄▄    ▄▄▄▄▄ ▄▄▄▄
//     ██ ██ ██ ██ ▄▄ ██ ▄▄ ██    ██▄▄  ██▄█▄   Copyright (c) 2026 Julian Storer
//   ▄▄█▀ ▀███▀ ▀███▀ ▀███▀ ██▄▄▄ ██▄▄▄ ██ ██   AGPL-3.0-or-later - see LICENSE

package server

import (
	"encoding/json"
	"testing"

	"juggler/cmd/juggler/core"
)

// TestSettingsLanguageReadsTheStoredChoice pins the one thing the pre-paint
// injection must get right: the language is a stored preference passed through
// verbatim, and anything that is not a JSON string reads as "unset" so the
// client follows the system rather than being handed a locale it cannot resolve.
func TestSettingsLanguageReadsTheStoredChoice(t *testing.T) {
	cases := []struct {
		name string
		ui   map[string]json.RawMessage
		want string
	}{
		{"no ui section", nil, ""},
		{"no language key", map[string]json.RawMessage{"theme": json.RawMessage(`"dark"`)}, ""},
		{"a chosen language", map[string]json.RawMessage{"language": json.RawMessage(`"zh-CN"`)}, "zh-CN"},
		{"the system sentinel", map[string]json.RawMessage{"language": json.RawMessage(`"system"`)}, "system"},
		{"a non-string value", map[string]json.RawMessage{"language": json.RawMessage(`3`)}, ""},
		{"malformed json", map[string]json.RawMessage{"language": json.RawMessage(`{`)}, ""},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := settingsLanguage(core.GlobalSettings{UI: c.ui}); got != c.want {
				t.Errorf("settingsLanguage() = %q, want %q", got, c.want)
			}
		})
	}
}
