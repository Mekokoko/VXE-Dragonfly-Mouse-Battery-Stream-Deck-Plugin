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

/**
 * Shows the VXE mouse battery percentage on a key, refreshed on a per-key timer
 * whose interval comes from the Property Inspector (`settings.interval`, seconds).
 */
@action({ UUID: "com.mekokoko.vxebattery.status" })
export class BatteryStatus extends SingletonAction<BatterySettings> {
	private readonly timers = new Map<string, NodeJS.Timeout>();

	override onWillAppear(ev: WillAppearEvent<BatterySettings>): Promise<void> {
		this.schedule(ev.action, ev.payload.settings);
		return this.refresh(ev.action);
	}

	override onWillDisappear(ev: WillDisappearEvent<BatterySettings>): void {
		const timer = this.timers.get(ev.action.id);
		if (timer) {
			clearInterval(timer);
			this.timers.delete(ev.action.id);
		}
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<BatterySettings>): Promise<void> {
		this.schedule(ev.action, ev.payload.settings);
		return this.refresh(ev.action);
	}

	override onKeyDown(ev: KeyDownEvent<BatterySettings>): Promise<void> {
		// A press forces an immediate refresh.
		return this.refresh(ev.action);
	}

	private intervalMs(settings: BatterySettings): number {
		const seconds = Number(settings?.interval);
		const effective = Number.isFinite(seconds) ? Math.max(MIN_INTERVAL, seconds) : DEFAULT_INTERVAL;
		return effective * 1000;
	}

	private schedule(action: BatteryAction, settings: BatterySettings): void {
		const existing = this.timers.get(action.id);
		if (existing) {
			clearInterval(existing);
		}
		const timer = setInterval(() => {
			void this.refresh(action);
		}, this.intervalMs(settings));
		this.timers.set(action.id, timer);
	}

	private async refresh(action: BatteryAction): Promise<void> {
		try {
			const info = readBattery();
			await action.setImage(batterySvg(info.level, info.charging));
		} catch (err) {
			streamDeck.logger.warn(`Battery read failed: ${String(err)}`);
			await action.setImage(batterySvg(0, false, false));
		}
	}
}
