# Rack Designer

Parametric designer for a bolted steel rack with drop-in boards. It gives a 3D view, a working
drawing, a cut list with a cutting plan, a fixings list, a drilling schedule and a set of checks.
It installs as an app (PWA) and works offline.

## How the rack is built

- **Corner posts** are L-angles with their flanges on the two outside faces.
- **Rails** are L-angles turned into a seat. The upright flange bolts to the inside of the post,
  the other flange points inwards. The board drops into the seat and sits flush with the rail top.
- **Centre supports** are flat bars on the outside face of the long rails, so nothing cuts the board.
- **Cross bearers** are angles that drop onto the rail seats under the board. No bolts.
- **Boards** are plain rectangles held by the rails on all four sides. No screws or bolts.
- Every steel joint is bolted. Posts, rails, centre bars and cross supports can each be slotted or plain.
- **It ships as a kit.** One bolt size, no welding. With "Snap sizes to the slots" on, length, depth and
  shelf heights move to the slot pitch so every bolt meets a punched slot and nothing is drilled on site.
- **Dispatch length.** Rails longer than "Longest piece to ship" are split at the centre supports; the
  flat bar is the splice plate. Short corner braces replace full-length diagonals.

## Using it

Tap any part of the rack in the 3D view. It lights up and a card explains what the part is and
shows only the settings that belong to it. The side panel holds every setting in one place.

## Run it

Needs Node.js 18 or newer.

```bash
npm install
npm run dev
```

`npm run build` writes the static site to `dist/`, including the service worker.

## Host on GitHub Pages

The build uses relative paths, so it works under any repository name. Push to `main` and set
Settings → Pages → Source to "GitHub Actions". The workflow in `.github/workflows/deploy.yml`
builds and publishes `dist/`.

## Code map

| File | What it does |
| --- | --- |
| `src/model.js` | Parameters, limits, presets and `buildModel()`: every plate, hole, bolt and board, plus the checks. |
| `src/bom.js` | Cut list, stock cutting plan, boards, fixings, drilling schedule, CSV export. |
| `src/view3d.js` | three.js scene with real slots, instanced bolts and liftable boards. |
| `src/draw2d.js` | Front, end, plan and board-seat detail as SVG, with click-to-edit dimensions. |
| `src/main.js` | Parameter form, views, menu, undo, share link, exports. |
| `src/sheet.js` | Bottom sheet for phones. |
| `src/units.js` | Unit formatting and parsing. Geometry is always millimetres. |
| `vite.config.js` | Build config and the generated service worker. |
| `scripts/make-icons.mjs` | Regenerates the app icons (`npm run icons`). |

To add a parameter: add it to `DEFAULTS` and `LIMITS` in `model.js`, use it in `buildModel()`,
and add one line to `GROUPS` in `main.js`.

Load and buckling figures are estimates for guidance, not a structural certificate.
