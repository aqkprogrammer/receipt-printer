# Receipt Printer

**Live demo:** https://receipt-printer-tau.vercel.app · **Source:** https://github.com/aqkprogrammer/receipt-printer

A three-step checkout that ends in a physical-feeling receipt: configure the
plan, pay with an animated card form, watch the bank authorise it, then print
the receipt and **drag it down to tear it off**.

Zero dependencies, zero build step, no framework — three files and a browser.

## Getting started

Clone the repo:

```bash
git clone https://github.com/aqkprogrammer/receipt-printer.git
cd receipt-printer
```

### Option 1 — just open it

```bash
open index.html
```

Everything runs client-side, so opening the file directly works. On Linux use
`xdg-open index.html`; on Windows, `start index.html`.

### Option 2 — serve it locally (recommended)

A local server avoids any `file://` quirks and lets you hard-reload cleanly.
Pick whichever runtime you already have:

```bash
python3 -m http.server 4599 --directory .
```

```bash
npx serve .
```

Then open http://localhost:4599 (or whichever port the server prints).

### Requirements

- Any modern browser (Chrome, Edge, Safari, or Firefox). The animations use CSS
  masks, `conic-gradient`, and WebAudio — all supported in current releases.
- Nothing else. No Node modules, no build step, no API keys, no backend.

## Try it in 60 seconds

1. Toggle **Annual** to see the 20% saving re-price live.
2. Bump the seat stepper to 3.
3. Enter the promo code `LAUNCH10` for another 10% off.
4. Hit **Continue**, then **Fill demo card** — it types `4242 4242 4242 4242`
   in character by character. Move your pointer over the card to tilt it, and
   click the CVC field to flip it.
5. Continue again and watch the authorisation checklist tick through.
6. Press **Print receipt**, then **grab the paper and drag it down** past ~70px
   to tear it off.
7. Click the speaker icon to unmute — the motor hum, step ticks and rip are all
   generated with WebAudio, no audio files.

> The card form is a demo. It never sends a request anywhere — use the demo
> number, never a real card.

## Deploying

The site is static, so any host works. It is deployed on Vercel:

```bash
npm i -g vercel
vercel deploy --prod
```

For GitHub Pages, push to `main` and enable Pages on the repository root — no
build command needed.

## The flow

1. **Plan** — billing cycle toggle (annual saves 20%), seat stepper, promo code
   (`LAUNCH10`). Every change re-prices live; the total counts up rather than
   snapping.
2. **Payment** — card form with live formatting, brand detection from the first
   digits (Visa / Mastercard / Amex / Discover, each with its own grouping and
   CVC length), Luhn + expiry validation, a 3D card that tilts toward the
   pointer and flips when the CVC field takes focus. "Fill demo card" types the
   demo number in character by character so you can watch the card fill.
3. **Receipt** — an authorisation checklist ticks through encrypt → bank →
   3-D Secure → authorise, the seal draws itself, and **Print receipt** feeds
   the paper out of the slot. The printed receipt carries the real order: your
   plan, seats, discounts, VAT, order number, auth code and timestamp.
4. **Tear off** — grab the paper, pull down past ~70px and it rips away with a
   ragged top edge, then the terminal resets for the next order.

Nothing leaves the page — no network calls, no storage. The form is a demo:
use the demo card, never a real one.

## Files

| File | What's in it |
| --- | --- |
| `index.html` | Terminal shell, three panes, receipt markup |
| `styles.css` | Dark UI, card, slot, paper texture, zigzag mask |
| `script.js` | Pricing, card logic, authorisation, feed, tear, sound |
| `.claude/launch.json` | Dev-server config for Claude Code's preview pane |

## How the animation works

**Paper feed** — the receipt lives inside `.paper__window`, a wrapper with
`overflow: hidden` and a JS-driven `height`. Growing that height reveals the
sheet from the top down, exactly like a thermal head laying down ink line by
line. Height is quantised to 3px steps (`STEP_PX`) so the motion reads as a
stepper motor rather than a smooth CSS slide, with a small `sin()` term folded
into the easing for stutter.

**Torn edge** — a two-layer CSS mask on `.receipt`: a solid rectangle for
everything above the last 9px, plus a repeating `conic-gradient` wedge for the
teeth. After a tear, a third layer adds teeth along the top too. No images, and
`filter: drop-shadow()` on the parent follows the real silhouette.

**Sway** — the sheet rotates around `transform-origin: top center`. While
feeding it trembles (`sin(t·26) · 0.35°`, fading out); when the feed stops it
settles with a damped oscillation, `1.1 · e^(-4.2t) · sin(15t)`.

**Card tilt and flip** — the card's transform is composed from three CSS custom
properties (`--tx`, `--ty` from the pointer, `--flip` from the CVC field), so
tilt and flip never fight each other.

**Pane transitions** — panes are absolutely positioned and cross-slide; the
screen animates its own height between them. It uses `overflow: clip` rather
than `hidden` so an off-screen pane can never become a scroll container and
nudge the layout sideways.

**Sound** — optional, generated with WebAudio (no assets): motor hum, per-step
ticks, keypad blips, an approval chime and a band-passed noise burst for the
rip. Off by default; the toggle click is what unlocks the AudioContext.

**Barcode** — bars are generated from a seeded LCG hashed off the order number
and auth code, so a given order always renders the same barcode.

## Tweaking

| Knob | Where | Effect |
| --- | --- | --- |
| `PRICE`, `SAVING`, `PROMOS`, `VAT` | `script.js` | Pricing model |
| `FEED_MS` | `script.js` | Total feed time (default 2600ms) |
| `STEP_PX` | `script.js` | Bigger = chunkier stepper motion |
| `TEAR_PX` | `script.js` | How far you must pull to rip the paper |
| `--tooth` | `styles.css` | Zigzag tooth size |
| `--paper-w` | `styles.css` | Receipt width (the slot follows it) |
| `--paper` / `--ink` | `styles.css` | Paper stock and ink colour |

`prefers-reduced-motion` is respected throughout: typing, feeding and settling
collapse to instant state changes.

## Hosting

Production runs on Vercel at https://receipt-printer-tau.vercel.app (project `receipt-printer`).
It is a static site: Vercel serves the repository root as-is, with no build
step.

```bash
npx vercel link --project receipt-printer   # once per checkout
npx vercel deploy --prod
```
