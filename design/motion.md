# BBC Club — Motion
Principle: motion explains a change of state; it never decorates. Nothing bounces or springs. Screen **push/pop** may slide horizontally (navigation between screens). No element *inside* a screen enters from the side.

| Moment | Spec |
|---|---|
| Welcome entrance | photo fades from black 1.2s; then logo, label, headline block, subline, button at the **150ms default** between elements; **200ms between the two serif headline lines** (exception: sequential reading needs more air). Each beat fade + 12px rise, ease-out; last beat starts at 1.6s and finishes by 2.5s. Ken Burns on the cabin photo (20s) is approved on Welcome only — the one screen seen once |
| Entry panel appearance | panel rises with the keyboard in one movement, ease-out 300ms; photo dims/blurs over the same duration |
| Auth step change | headline crossfade 200ms; field group fade + 12px rise |
| Success (sign in / password set) | panel releases upward 300ms ease-in; light feed fades in 200ms — the "threshold" |
| Screen push / pop | 300ms slide-left ease-out / slide-right ease-in; tabs: instant |
| Proposal detail | parallax hero at 0.5× scroll, slight scale on pull-down; CTA bar slides up 300ms after mount (delay 300ms); header with serif title fades in as the hero scrolls away |
| Responded state | confirmation crossfades 250ms; no confetti, no checkmark animation beyond a 150ms fade |
| Press | 120ms scale to 0.98; arrow drifts 4px right; release 160ms |
| Reduced motion | all movement replaced by opacity-only transitions of the same duration |

Implementation: Reanimated 4 (New Architecture). Welcome entrance timing lives in `src/components/animated-entrance.tsx`.
