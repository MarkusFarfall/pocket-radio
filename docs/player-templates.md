# Player templates — structural layouts

## Why this revision exists

The initial implementation reused essentially the same player with different
colors. This revision replaces the five non-classic full players with genuinely
different compositions. The classic player remains available unchanged.

Settings → Appearance → Style → Player templates (also under Appearance → Player).
Template IDs and the `pr.playerAppearance` key are stable for existing installs.

| Stored ID | Name | Actual composition |
| --- | --- | --- |
| classic | Классика | Existing focus, vinyl-artwork and compact arrangements |
| vinyl | Тёплый винил | Physical turntable, grooved record, tonearm; separate sleeve/title/transport; queue underneath |
| studio | Кассетник | Cassette label contains the title; two rotating reels; separate mechanical transport keys; tape info and queue |
| neon | Цифровая консоль | Terminal display and queue modules; wide command bar below; small artwork within the display |
| paper | Афиша | Oversized editorial typography; asymmetric poster artwork; printed track list; rectangular play control |
| aurora | Кинотеатр | Edge-to-edge artwork behind the title; floating transport dock; horizontally scrollable queue cards |

The phone and desktop layouts use **container queries**, not assumptions about
window width. For example, the receiver queue is alongside the display on a
wide player but below it on a phone. Settings cards also adapt to their actual
content-column width, including narrow three-panel desktop configurations.

## Architecture and retained behavior

`PlayerExperience.tsx` owns the structural layouts and decorative record/tape
parts. `PlayerUI.tsx` supplies live control slots connected to the existing player:

- play/pause, previous/next, podcast −15/+30 seconds and playback rates;
- seek for finite audio, truthful live/status/error/offline states;
- volume, favorite, add-to-playlist, equalizer;
- source-playlist return and playable upcoming tracks;
- More: save to catalog, available downloads, save identified track, share,
  QR, sleep timer, track history, source metadata/address copy and removal.

No player engine, audio context, EQ preset, streaming or cache behavior changes.
The decorative console bars are explicitly **not audio metering**. No fake audio
analysis is performed. Cover fallback still works for sources without artwork.
Mini-player/dock colors use the corresponding player palette; the major structural
changes are intentionally in the full player.

## Honest previews

The five new previews render **the same `PlayerExperience` component**, using
inert slots instead of controls. A ResizeObserver fits the real composition to a
thumbnail. Phone and desktop buttons change the preview's actual layout width.
Controls in previews are not focusable and are hidden from accessibility APIs;
outer selection buttons have accessible names, pressed state and keyboard support.
Example track names/times/art in previews are illustrative, not user playback.

## Preferences and motion

- Choosing a template atomically sets its player-only preferences; app colors,
  layout, EQ and media are untouched. Selection persists and syncs across tabs.
- Old settings without a valid skin retain `classic` and their existing layout.
- Focus/vinyl-artwork/compact fine tuning is specific to Classic; custom physical
  templates own their composition instead of offering controls that do nothing.
- Non-classic motion controls enable the template's own motion or disable it.
  The poster is intentionally static. Classic retains its previous motion options.
- Records/reels/light/decorative bars use CSS transform/opacity. They pause with
  playback, on closing the player and while the page is hidden. Pausing preserves
  animation phase. OS and app reduced-motion both override decorative movement.
- Preview loops run only on hover or focus. No RAF loop, canvas, remote font,
  external image asset or extra runtime dependency is needed for the templates.

## Verification

```sh
npm run typecheck
npm run build
npm test -- tests/player-appearance.spec.ts tests/player-navigation.spec.ts
npm test
```

Coverage includes normalization/migration, keyboard selection, persistence/reset,
setting isolation, all templates at 320×568 / 390×844 / 768×900 / 1280×800,
long titles, controls/overflow, pause/reduced motion, genuine structural geometry,
EQ/More access and real-layout previews inside narrow settings columns.
All six templates have real playlist-return/queue regression tests on mobile and
playlist-return tests on desktop. Physical Safari/iOS/Android listening and touch
checks remain outside the automated Chromium coverage.

Final verification: **104/104 tests passed**; TypeScript and production build
passed. A separate production smoke check selected all five new layouts through
settings, played a local file, paused/resumed, switched phone/desktop widths,
returned to the source playlist, and verified selection after reload, with no
page errors. The existing Vite large-chunk warning remains outside this scope.
