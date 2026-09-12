# Verification — 2026-09-08

This is an implementation preview, **not an accepted MVP**. Linux checks and cross-packaging
cannot establish Windows input, capture, actual DJ integration or live performance quality.

## Reproducible checks

From the repository root: `npm ci`, `npx install-electron`, `npm test`,
`npx playwright install chromium`, `npm run test:ui`, `npm run package:win`.
Windows CI runs the same commands on windows-latest and includes a native Electron test.
Browser tests route only application assets and inject a fake host bridge. They exercise the real
DOM/parser/controller, but not Electron IPC or real Windows IME. Node HTTP tests use a fake producer.

Observed locally: Node 24.19.0, Electron package 44.2.0, Playwright 1.63.0 Chromium.
12 Node tests passed; 10 browser tests passed; the Windows native test was skipped on Linux.
Windows x64 folder packaging succeeded locally.

Windows CI [34235731478](https://github.com/yasuyuki/dj-live-text/actions/runs/34235731478)
passed on source `1930c8c`: 11 Node tests and 10 Playwright tests, including the real Electron
2-window test, then Windows x64 packaging and artifact upload. This proves native application
startup/send/close/reopen/draft persistence/empty restart with the test profile, not actual IME,
physical DPI/capture, real DJ playback or the 60-minute performance trial.
Japanese Windows font coverage and real native input are unverified. Local browser checks use
Noto Sans CJK JP and Noto Color Emoji; they do not certify Windows font fallback. A private local library prefix supplied missing Chromium dependencies for Linux
checks; it is not a runtime dependency of the Windows artifact.

The UTF-8 response regression is covered by Windows CI
[34238900034](https://github.com/yasuyuki/dj-live-text/actions/runs/34238900034)
on source `e0d1031`: 12 Node and 10 Playwright tests passed, including native Electron.
Final Windows CI [34240578311](https://github.com/yasuyuki/dj-live-text/actions/runs/34240578311)
on source `aa4ecb4` passed 12 Node and 11 Playwright tests and uploaded the Windows preview artifact.
This includes the busy-button regression checking that clear cancels a pending introduction.

Funkot Windows CI [34238896155](https://github.com/yasuyuki/funkot-player/actions/runs/34238896155)
on code `4df64d9` passed 55 frontend tests, 319 Rust tests and one actual executable HTTP smoke test.
The smoke starts the built Windows player, verifies idle JSON, request restrictions and disconnection
on exit. NSIS and portable artifacts were uploaded. Commit `36edacc` adds only privacy documentation
on top of that tested code. This does not demonstrate music playback or the two apps together.

## Acceptance matrix

| ID | Automated evidence | Remaining acceptance |
|---|---|---|
| A01 | Browser manual-edit vs sent-snapshot test passes | Windows capture trial |
| A02 | DOM measurement, emphasis larger than normal, short Japanese text passes | Actual font/readability and ease of use |
| A03 | All six attributes agree across notation/GUI/keys; native browser Undo/focus tested | Windows native keyboard trial |
| A04 | Progress unit tests and unchanged layout offsets in browser pass | Native capture motion observation |
| A05 | Intl.Segmenter tests include family/skin-tone emoji, combining marks, cross-style clusters | Windows fallback glyph appearance |
| A06 | Synthetic composition start/end/cancel, clear fencing and live immediacy pass | Real Japanese IME conversion/cancel/paste |
| A07 | Pending prepare/IME clear tests pass; candidate receipt cannot publish | Real DJ and real IME concurrency |
| A08 | Revision cancellation, snapshots and replacement tests pass | Native rapid-operation stress |
| A09 | Fake candidate A send/B update and literal metadata test passes | Actual Funkot playback/read/manual send (native idle API passed) |
| A10 | HTTP disconnect/status/schema tests and text-only metadata rendering pass | Real producer disconnect/reconnect |
| A11 | 1920×1080, 1280×720, 1600×400, 800×800 browser geometry passes; tiny resize stays failed through heartbeat | Native fullscreen, monitor selection and Windows DPI |
| A12 | Minimum-font overflow rejects send and preserves old output | Capture readability and live long-text trial |
| A13 | Stored schema omits live/current; defaults always empty output | Windows CI native restart passed; user-installed run remains |
| A14 | No automated replacement for this condition | Real DJ playback + chosen capture method + comparison without tool |

Windows native test passed for two windows, manual send, focus, output closure/reopen,
custom background restoration, persisted draft and empty restart. Real capture and keyboard/IME
acceptance remain distinct from this automated native-host evidence.

## Required real-world trial (not executed)

### Windows rescue observation — 2026-09-12

Resumed from source `002f76c2f1499daf77b1bb40eec2a1f960801812` under
[issue #1](https://github.com/yasuyuki/dj-live-text/issues/1). The installed preview exposed
separate controller/output windows and the existing Funkot application was running.
Only window selection and observation were performed; no draft, output setting, playback,
capture setting or saved user data was changed. The user then explicitly deferred GUI testing
because the desktop was in use. A later personal improvised trial is possible once prepared;
that does not lift the current GUI hold.

Read-only identity evidence: Windows build `26200.9445`, display version `25H2`;
OBS executable `32.0.1` (not launched); installed Funkot package `0.7.1.0`;
DJ Live Text preview `0.1.0`, Electron `44.2.0`.
The preview executable SHA-256 is
`b845327b2df094721694bac4470bb415741729d65a0d572c487d1560a5aaa720`;
its `resources/app.asar` SHA-256 is
`d4fbf291ef5f2ba985e9c8dc206db42911bc68aba938494b0fc9a0487127c2dc`.
These identify the observed files; their correspondence to the source commit is not yet proven.
The controller displayed 200% for the selected monitor and an 800×800 logical size with fullscreen
enabled, but effective output geometry and the OBS capture region were not verified.

All remaining real-world conditions A01–A14 are **not run in this rescue attempt**.
The earlier automated results above are unchanged. There was no 60-minute DJ/capture trial,
comparison without this tool, latency/frame-rate measurement, real track A/B integration trial,
or personal usability evaluation. Phase A and C remain open. Resume with source/artifact identity,
producer API availability and the actual capture region, then execute the outstanding matrix
and the trial below when the desktop is available. No screenshots or private track data are
included in this public record.

The user selected OBS specified-region capture, with DJ Live Text used alongside funkot-player.
Use that arrangement on the actual Windows host. Record Windows and OBS versions, display scale,
output size, captured region, DJ version and this application's commit. Check the captured region
for clipped text/effects and unintended controller content while operating both apps. Confirm Japanese IME
conversion/commit/cancel, ordinary Enter/Space/Escape, shortcuts only in the controller,
focus retained by typing/DJ, complete Japanese/emoji glyphs, fullscreen and alternate aspect ratios.

Read real Funkot track A, introduce it manually, change to B without replacing output, pause,
disconnect/reconnect, use an invalid candidate, and clear while metadata updates. Verify ordinary
text remains usable. Producer semantics must follow Funkot's current-track definition.

Run for at least 60 minutes while repeatedly displaying/replacing/clearing with DJ and capture active.
Observe input/output stalls, memory trend and latency over time. Compare DJ/capture behavior to the
same session without this tool. Measure operation-to-visible change separately from intentional
character delay; about 100 ms and a smooth >=30fps capture are targets, not observed results here.

Finally improvise short messages without prepared scripts. Observe whether emphasis/automatic sizing
works without manual font adjustment, whether attention returns to music, and whether send/clear
happens at the intended time. Record failures; do not replace this judgment with test counts.
