# Remaining MVP acceptance

Goal: spontaneous text performance on one Windows output, including real Funkot integration.
Source: README, docs/DESIGN.md and docs/VERIFICATION.md. The supplied DJ Live Text MVP requirements
are the contract; this plan adds no feature scope or approval gate.

## A — native risk acceptance (open)

Executor: developer on actual Windows user desktop; repository root.
Prerequisites: Node 24 or generated Windows folder; OBS specified-region capture with DJ Live Text alongside funkot-player.
Run `npm ci`, `npx install-electron`, `npm start`; use the selected OBS capture region. Verify actual
Japanese IME, Unicode clusters, full screen/custom size, DPI and focus. Record capture and font
results in docs/VERIFICATION.md. Linux browser success does not close this phase.

## C — real integration and performance (open)

Executor: developer on authorized funkot-player source and actual Windows DJ/capture host.
Use the producer and receiver described in docs/DESIGN.md, following the existing Windows build
and launch instructions. Their implementation is complete; fake data and an idle native producer
are not evidence of actual DJ playback integration. Confirm real A/manual-send/B semantics,
disconnect and ordinary text independence.

Run `npm test`, `npm run test:ui`, `npm run package:win` from dj-live-text root. These commands exercise
source, local temporary saved settings and a fake HTTP server; the native test launches/closes test
windows with a separate temporary data directory. It does not operate the user's DJ or capture app.
Perform the actual 60-minute and improvised-stream trials specified in docs/VERIFICATION.md, including
comparison with the tool absent. No new features until required acceptance is resolved. Delete this
plan when accepted; keep permanent design and verification results in docs.
