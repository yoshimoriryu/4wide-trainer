# 4wide-trainer

A 4-wide (4×25) Tetris combo trainer with an AI coach. Zero dependencies — open `index.html` in a browser and play.

![board](https://img.shields.io/badge/board-4%C3%9725-blue) ![deps](https://img.shields.io/badge/dependencies-none-green)

## Why

4-wide combo practice tools barely exist. This mocks the tetr.io feel (7-bag, hold, 5 previews, SRS kicks + 180, DAS/ARR) on a pure 4-wide board and adds an AI that shows you the combo-preserving placement every step.

## Features

- **AI hint** — pulsing gold shadow on the recommended placement, plus the input path (`HOLD ↻ ← ↓ ⤓`). A `↓` mid-path means a tuck or spin is required.
- **Never-break assist** — an exact set-based DP tracks *every* combo-surviving line through the whole known queue and follows one. New bags are order-vetted so a surviving line always exists. Verified 5000+ combo with zero breaks.
- **Auto-play** — watch the AI chain indefinitely and copy its patterns.
- **Fair mode** — untick assist for a beam-search AI limited to the 5 visible previews (~2% forced breaks, matching the information-theoretic limit).
- tetr.io-style scoring feel: combo counter, best combo, PPS, sounds (WebAudio synth; drop real `.ogg` files into `sfx/` to override).

## Controls

| Key | Action |
|-----|--------|
| ← / → | move |
| ↓ | sonic drop |
| space | hard drop |
| ↑ / x | rotate CW |
| z | rotate CCW |
| a | rotate 180 |
| c / shift | hold |
| h | toggle hint |
| p | auto-play |
| r | retry |

## The math bit

An adversarial fixpoint over all 3- and 7-cell residues × hold × remaining-bag states (~70M states) proves the safe set is **empty**: no 4-wide state guarantees an infinite combo without preview knowledge — some 7-bag draws force a break. With 5 previews, ~2% of placements are informationally forced breaks. With ~2 bags of lookahead, nearly every random bag order is survivable, which is what the assist mode exploits.

## Files

- `engine.js` — pure game/AI logic (SRS, BFS placement enumeration incl. tucks/spins, beam search, survival DP). Node-testable.
- `index.html` — canvas UI.
