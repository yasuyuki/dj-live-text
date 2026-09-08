# Remaining MVP acceptance

Goal: spontaneous text performance on one Windows output, including real Funkot integration.
Source: README, docs/DESIGN.md and docs/VERIFICATION.md. The supplied DJ Live Text MVP requirements
are the contract; this plan adds no feature scope or approval gate.

## A — native risk acceptance (open)

Executor: developer on actual Windows user desktop; repository root.
Prerequisites: Node 24 or generated Windows folder; actual capture software and display areas.
Run `npm ci`, `npx install-electron`, `npm start`; capture the output window only. Verify actual
Japanese IME, Unicode clusters, full screen/custom size, DPI and focus. Record capture and font
results in docs/VERIFICATION.md. Linux browser success does not close this phase.

Funkot producer editing additionally requires access to its declared working-set member or explicit
user authorization for the new clone. Do not change an unauthorized clone or existing Windows source.

## C — real integration and performance (open)

Executor: developer on authorized funkot-player source and actual Windows DJ/capture host.
Add the minimum optional producer described in docs/DESIGN.md, following that repo's build/tests.
No audio engine redesign or playback controls. The receiver already exists; fake data is not evidence
of integration. Confirm real A/manual-send/B semantics, disconnect and ordinary text independence.

Run `npm test`, `npm run test:ui`, `npm run package:win` from dj-live-text root. These commands exercise
source, local temporary saved settings and a fake HTTP server; the native test launches/closes test
windows with a separate temporary data directory. It does not operate the user's DJ or capture app.
Perform the actual 60-minute and improvised-stream trials specified in docs/VERIFICATION.md, including
comparison with the tool absent. No new features until required acceptance is resolved. Delete this
plan when accepted; keep permanent design and verification results in docs.
