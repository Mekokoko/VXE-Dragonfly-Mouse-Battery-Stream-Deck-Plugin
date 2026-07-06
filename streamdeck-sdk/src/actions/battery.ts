import {
	action,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	SingletonAction,
	streamDeck,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";

import { batterySvg } from "../battery-svg";
import { readBattery } from "../mouse";

type BatterySettings = {
	interval?: number;
};

/** Action instance as delivered on events (KeyAction for our Keypad controller). */
type BatteryAction = WillAppearEvent<BatterySettings>["action"];

const DEFAULT_INTERVAL = 60;
const MIN_INTERVAL = 5;
/** Static backoff between attempts while the mouse can't be read (asleep / unplugged / HUB busy). */
const RETRY_SECONDS = 5;

/**
 * Shows the VXE mouse battery percentage on a key.
 *
 * Each key runs a self-scheduling loop: after every attempt the next one is
 * scheduled for the poll interval (from the Property Inspector, on success) or
 * for a fixed {@link RETRY_SECONDS} backoff (on failure). So a failed read is
 * retried actively until the mouse responds, then normal polling resumes.
 *
 * A per-key "generation" token invalidates any in-flight loop when the key
 * re-appears, its settings change, or it is pressed — preventing overlapping timers.
 */
@action({ UUID: "com.mekokoko.vxebattery.status" })
export class BatteryStatus extends SingletonAction<BatterySettings> {
	private readonly timers = new Map<string, NodeJS.Timeout>();
	private readonly pollSeconds = new Map<string, number>();
	private readonly generation = new Map<string, number>();

	override onWillAppear(ev: WillAppearEvent<BatterySettings>): void {
		this.start(ev.action, ev.payload.settings);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<BatterySettings>): void {
		this.start(ev.action, ev.payload.settings);
	}

	override onKeyDown(ev: KeyDownEvent<BatterySettings>): void {
		// A press forces an immediate refresh (and resets the loop).
		this.start(ev.action, ev.payload.settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<BatterySettings>): void {
		this.stop(ev.action.id);
	}

	private pollSecondsFrom(settings: BatterySettings): number {
		const seconds = Number(settings?.interval);
		return Number.isFinite(seconds) ? Math.max(MIN_INTERVAL, seconds) : DEFAULT_INTERVAL;
	}

	/** (Re)start the refresh loop for an action, running an attempt immediately. */
	private start(action: BatteryAction, settings: BatterySettings): void {
		const id = action.id;
		this.pollSeconds.set(id, this.pollSecondsFrom(settings));

		// Bump the generation so any in-flight loop for this key stops rescheduling.
		const gen = (this.generation.get(id) ?? 0) + 1;
		this.generation.set(id, gen);

		const pending = this.timers.get(id);
		if (pending) {
			clearTimeout(pending);
		}
		void this.tick(action, gen);
	}

	/** Stop the loop for an action and forget its state. */
	private stop(id: string): void {
		const pending = this.timers.get(id);
		if (pending) {
			clearTimeout(pending);
		}
		this.timers.delete(id);
		this.pollSeconds.delete(id);
		this.generation.delete(id); // in-flight ticks see a changed generation and won't reschedule
	}

	/** One attempt: paint the key, then schedule the next tick based on the outcome. */
	private async tick(action: BatteryAction, gen: number): Promise<void> {
		const id = action.id;
		if (this.generation.get(id) !== gen) {
			return; // superseded before we ran
		}

		let nextSeconds: number;
		try {
			const info = readBattery();
			await action.setImage(batterySvg(info.level, info.charging));
			nextSeconds = this.pollSeconds.get(id) ?? DEFAULT_INTERVAL;
		} catch (err) {
			streamDeck.logger.warn(`Battery read failed; retrying in ${RETRY_SECONDS}s: ${String(err)}`);
			await action.setImage(batterySvg(0, false, false));
			nextSeconds = RETRY_SECONDS;
		}

		if (this.generation.get(id) !== gen) {
			return; // superseded while we awaited setImage
		}
		const timer = setTimeout(() => void this.tick(action, gen), nextSeconds * 1000);
		this.timers.set(id, timer);
	}
}
