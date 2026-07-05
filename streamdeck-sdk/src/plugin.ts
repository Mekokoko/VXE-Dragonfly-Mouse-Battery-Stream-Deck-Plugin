import { streamDeck } from "@elgato/streamdeck";

import { BatteryStatus } from "./actions/battery";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new BatteryStatus());

streamDeck.connect();
