# VXE-Dragonfly-Mouse-Battery-Script

A Stream Deck plugin that shows the battery percentage of a VXE/ATK Dragonfly
("Compx") wireless mouse on a key, with a configurable refresh rate. It reads the
mouse directly over HID (a reverse-engineered vendor protocol) — no ATK V HUB
required.

The plugin lives in **[`streamdeck-sdk/`](streamdeck-sdk/)** and is built on the
official `@elgato/streamdeck` SDK, so it's eligible for the free Elgato
Marketplace. See [`streamdeck-sdk/README.md`](streamdeck-sdk/README.md) to build,
install, or publish it. Requires the Stream Deck app 7.1+.

The HID protocol is documented in
[`streamdeck-sdk/src/mouse.ts`](streamdeck-sdk/src/mouse.ts).
