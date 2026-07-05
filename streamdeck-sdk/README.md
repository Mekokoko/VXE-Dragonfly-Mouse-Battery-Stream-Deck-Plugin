# VXE Mouse Battery — Stream Deck plugin

Shows the battery percentage of a VXE/ATK Dragonfly ("Compx") mouse on a Stream
Deck key, with a configurable refresh rate. Built on the **official Stream Deck
Node.js SDK** (`@elgato/streamdeck`). Reads the mouse over HID directly (via `node-hid`) using a
reverse-engineered vendor protocol (documented in `src/mouse.ts`) — no ATK V
HUB required.

- Green / amber / red gauge by level, lightning bolt while charging, percentage label.
- Works wired (PID 0xF58C) or on the 2.4 GHz dongle (PID 0xF58A), auto-detected.
- Refresh interval chosen in the Property Inspector; pressing the key refreshes now.
- **tested on Windows only.**

## Requirements

- **Stream Deck app 7.1 or higher** (the Node.js plugin runtime; end-users need
  nothing else installed — Stream Deck ships its own Node 24 runtime).
- For development: **Node.js 24+** and the Elgato CLI (`npm i -g @elgato/cli`).

## Install (from the packaged file)

Double-click **`com.mekokoko.vxebattery.streamDeckPlugin`** — Stream Deck runs
its own installer. Then add **VXE Mouse Battery → Battery** to a key and pick a
refresh rate.

## Develop

```bash
npm install
npm run build      # compile src → com.mekokoko.vxebattery.sdPlugin/bin/plugin.js
npm run watch      # rebuild + restart the plugin in Stream Deck on change
```

To load the working copy into Stream Deck during development:

```bash
streamdeck link com.mekokoko.vxebattery.sdPlugin
streamdeck restart com.mekokoko.vxebattery
```

## Package

```bash
npm run build
streamdeck pack com.mekokoko.vxebattery.sdPlugin --force
```

This validates the plugin and produces `com.mekokoko.vxebattery.streamDeckPlugin`.

## How it works

| Path | Purpose |
| --- | --- |
| `src/plugin.ts` | Entry point: registers the action and connects to Stream Deck |
| `src/actions/battery.ts` | `SingletonAction` — per-key refresh timer, key rendering, PI settings |
| `src/mouse.ts` | Reads the mouse battery over HID via `node-hid` |
| `src/battery-svg.ts` | Renders the key as an SVG data URI (no image library needed) |
| `com.mekokoko.vxebattery.sdPlugin/manifest.json` | Plugin manifest (SDKVersion 3, Node 24, Windows) |
| `com.mekokoko.vxebattery.sdPlugin/ui/battery.html` | Property Inspector (refresh-rate selector) |
| `com.mekokoko.vxebattery.sdPlugin/imgs/` | Plugin/action/key/marketplace PNG icons |
| `rollup.config.mjs` | Build config; keeps `node-hid` + `ws` external and copies them into `bin/node_modules` |

**Native modules:** `node-hid` (a native addon) and `ws` cannot be safely
inlined by rollup, so they are marked `external` and copied into
`bin/node_modules` at build time. `node-hid` ships an ABI-stable N-API prebuilt
binary; only the Windows prebuilds are kept.

## Troubleshooting

- **Key shows a grey `!`** — no mouse found or it is asleep. Move the mouse and
  check the cable/dongle. The **ATK V HUB can grab the HID interface** and block
  reads; close it if the key stays grey.
- **Logs** — the plugin writes to `com.mekokoko.vxebattery.sdPlugin/logs/`.
