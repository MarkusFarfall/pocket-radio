# Player appearance templates

## Entry points

Settings → Appearance → Player → Player templates. The Style tab also links to
this collection. Settings search indexes the templates and their names.

Six templates ship in `PLAYER_TEMPLATES`:

| ID | UI name | Layout / motion |
| --- | --- | --- |
| classic | Классика | Focus / breathing artwork; inherits the app palette |
| aurora | Северное сияние | Focus / drifting violet and mint light |
| vinyl | Тёплый винил | Record / rotating artwork and warm amber tones |
| neon | Ночной эфир | Focus / radio waves, grid and mint accents |
| paper | Тихое утро | Focus / static paper surface and serif titles |
| studio | Студия FM | Compact / gentle motion and a decorative tuning scale |

The full player adapts at 768px; the existing mini-player/desktop dock switch
remains controlled by the app. Both compact players inherit template colors.
All existing playback, seek, volume, queue, EQ and playlist-return controls stay
connected to the original player engine. No new audio graph or analysis is used.
The decorative FM scale is **not** a frequency selector or an audio meter.

## Preference semantics

- Device-local key: `pr.playerAppearance`; adds a validated `skin` field.
- Existing layout/motion/color-wash settings are preserved on upgrade. Missing or
  invalid skin values use `classic`, not a forced reset of the user's choices.
- Choosing a template atomically sets skin, layout, motion and color wash.
- Further edits are allowed; the UI labels them as custom settings. The skin is
  still displayed, but no preset card falsely claims an exact match.
- The default action and Device → Reset appearance both reset the new field.
- Storage events keep open tabs consistent. Blocked storage does not break
  in-memory selection, but cannot persist it across reloads.
- Template application does not write app colors, app style preferences, EQ
  settings or user media. Phone/desktop preview mode is illustrative, not a
  forced device layout.

## Rendering and motion

`PlayerScene.tsx` is shared by live players and schematic previews. CSS variables
are scoped to `.player-skin`; light and dark player templates therefore remain
legible independently of the application's light/dark theme. Record artwork
shape wins over global cover-shape overrides, without changing other covers.

New motion uses transform/opacity, with no RAF loop, canvas, external fonts,
images or dependencies. Artwork/waves/light pause with playback, when the full
player closes, when its responsive variant is hidden, and when the page is
hidden. Pausing retains the animation phase. OS reduced-motion, the app's
reduced-motion setting and the player's no-motion option disable the effects.
Template cards animate only on hover or keyboard focus; preview controls are
presentational and excluded from the accessibility tree. Selection buttons
expose their names and pressed state and support keyboard activation.

## Verification

```sh
npm run typecheck
npm run build
npm test -- tests/player-appearance.spec.ts
npm test
```

The appearance suite covers normalization/migration, six template definitions,
keyboard selection, custom edits, persistence/reset, unrelated-setting isolation,
all six templates with long titles at 320×568, 390×844, 768×900 and 1280×800,
compact-player colors, accessible playback controls, horizontal overflow, pause/
resume and both reduced-motion preferences. Existing EQ and playlist navigation
tests remain in the full regression suite. Physical iOS/Android device testing
has not been performed.

Final local result: **92/92 tests passed** (including seven appearance tests),
TypeScript and production build passed. A separate built-app smoke check passed
selection/reload persistence, local-track playback, actual skin colors and
pause/resume with no page errors. Vite's existing large-chunk warning remains.
