# Design and display contract

Electron is the proposed Windows host: one controller window, one opaque frameless output
window, no renderer Node access, sandbox/context isolation, fixed local assets, denied navigation,
new windows and permissions. Host choice remains provisional until Windows IME/DPI/capture trials.
The renderer uses DOM measurement and native font fallback instead of a custom layout engine.
Japanese font preference is Yu Gothic, Meiryo, Noto Sans CJK JP, Segoe UI, sans-serif. Actual
Japanese/emoji coverage must be checked on the user's Windows installation.

`document.js` owns notation and grapheme segmentation; `controller.js` owns the draft, immutable
sent document and progress. `layout.js`/`display.css` are shared by preview and output. Native
windows, persistence and local HTTP polling live in `main.js`/`host-services.js`.

Every replace request gets a revision. Output-host measurement happens before publication.
Clear, replacement, live OFF and IME start invalidate older preparation results. The output
also ignores old transport sequence numbers. Full text is laid out before staged visibility;
hidden glyphs reserve space. Live input reveals all glyphs without entrance animation.
Resize recomputes the full document without restarting progress. If resize is too small,
output becomes background-only and reports failure to the controller; enlarging restores the
same progress. Settings apply deliberately clears rather than implicitly resending.

24 CSS px is the initial readability floor chosen to satisfy the requirement to reject unreadably
small output. It is a product choice awaiting the capture trial, not a measured universal readability
threshold. Padding reserves room for outline/shadow and impact movement. Layout uses actual DOM
scroll dimensions and binary search for font size; no character-count fit guarantee is used.

The editor is a textarea. GUI and keys edit the same notation through Chromium `insertText`, which
preserves native undo; this deprecated API is intentionally isolated in `control.js` and covered by
browser/native tests. There is no separate rich-text state. Performance goals from the request
(about 100 ms and 30 fps capture) are acceptance targets, not claims established by unit tests.

## Funkot protocol proposal / implementation dependency

The receiver requests `http://127.0.0.1:<configured-port>/now-playing` from the main process.
Port 0 disables it. Only this literal loopback host and fixed route are accepted. Polls are serial,
500 ms after completion; timeout is 1 second and the IPC output health deadline is 2.5 seconds.
These are failure-detection choices, not measured performance results. Metadata responses are
bounded at 64 KiB as an untrusted HTTP input boundary; no title is silently truncated.

Expected JSON (no file paths or control commands):

```json
{"version":1,"title":"Track A","artist":"Artist","playing":true}
```

Unknown versions/malformed required fields or unsuccessful responses cannot become a sendable candidate. The candidate
is invalidated on disconnect, stop or malformed data. A title is required; missing artist is shown
as アーティスト不明 in the operator UI. The receiver retains only the latest candidate; a received
update never writes the output. Metadata is constructed as literal runs, never parsed as notation.

Public funkot-player source inspected at `b2ec415`: `NOW.now` defines current track, switching at
transition end. `cached_tags_for` and `session_metadata_for` provide embedded title/artist and the
filename fallback. No external current-track endpoint was found. The minimal proposed addition is
an opt-in Windows loopback listener, `FUNKOT_CURRENT_TRACK_PORT`, independent of the audio callback,
using NOW truth, suppressing audition/preparation, and setting playing=false when paused/stopped.
It must not expose file paths, control playback, bind LAN, or alter existing playback truth.

**Producer API not yet added.** The player's AGENTS.md limits writes to the declared working-set
member. That member is unavailable in this environment; using the new public clone for edits needs
an explicit scope exception. Receiver tests use a local fake server and do not establish real integration.
