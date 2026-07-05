import * as hid from "node-hid";

/**
 * Reads the battery of a VXE/ATK "Compx" R1 mouse over the vendor HID protocol
 * (reverse-engineered from the ATK V HUB). Works wired (PID 0xF58C) or on the
 * 2.4 GHz dongle (PID 0xF58A), auto-detected.
 *
 * Protocol: on the vendor collection (HID usage page 0xFF02, usage 2) send a
 * 16-byte report id 8 packet — byte 0 = command (4 = GetBattery), byte 15 =
 * checksum (85 - ((8 + sum(bytes[0..14])) & 0xFF)) & 0xFF. The input report
 * (report id byte included) carries: [1] command echo, [6] level %, [7] charging
 * flag, [8..9] voltage mV (big-endian).
 */

const VENDOR_ID = 0x3554;
const REPORT_ID = 8;
const PACKET_SIZE = 16;
const CMD_GET_BATTERY = 4;

const TRANSPORT_USAGE_PAGE = 0xff02;
const TRANSPORT_USAGE = 0x02;

const KNOWN_DEVICES: Record<number, string> = {
	0xf58c: "wired",
	0xf58a: "wireless (2.4GHz dongle)",
};

// Response byte indices (report-id byte included, as hidapi returns it).
const RESP_CMD_INDEX = 1;
const RESP_BATTERY_INDEX = 6;
const RESP_CHARGE_INDEX = 7;
const RESP_VOLTAGE_INDEX = 8; // big-endian uint16 at [8], [9]

export interface BatteryInfo {
	level: number;
	charging: boolean;
	voltageMv: number;
	connection: string;
	product?: string;
}

function buildPacket(commandId: number): number[] {
	const pkt = new Array<number>(PACKET_SIZE).fill(0);
	pkt[0] = commandId;
	let sum = 0;
	for (let i = 0; i < 15; i++) {
		sum += pkt[i];
	}
	pkt[15] = (85 - ((REPORT_ID + sum) & 0xff)) & 0xff;
	return pkt;
}

function findTransport(): hid.Device | undefined {
	return hid.devices().find(
		(d) =>
			d.vendorId === VENDOR_ID &&
			d.usagePage === TRANSPORT_USAGE_PAGE &&
			d.usage === TRANSPORT_USAGE &&
			d.productId in KNOWN_DEVICES,
	);
}

/**
 * Queries the mouse and returns its battery state. Throws if no supported mouse
 * is found or it does not respond within {@link timeoutMs} (e.g. asleep).
 */
export function readBattery(timeoutMs = 2000): BatteryInfo {
	const info = findTransport();
	if (!info?.path) {
		throw new Error(
			"No supported mouse found. Plug in the cable or the 2.4GHz receiver and wake the mouse.",
		);
	}

	const device = new hid.HID(info.path);
	try {
		// Drain stale / unsolicited input reports.
		for (let i = 0; i < 16; i++) {
			try {
				device.readTimeout(2);
			} catch {
				break;
			}
		}

		device.write([REPORT_ID, ...buildPacket(CMD_GET_BATTERY)]);

		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			const report = device.readTimeout(50);
			if (
				report &&
				report.length > RESP_VOLTAGE_INDEX + 1 &&
				report[RESP_CMD_INDEX] === CMD_GET_BATTERY
			) {
				return {
					level: report[RESP_BATTERY_INDEX],
					charging: Boolean(report[RESP_CHARGE_INDEX]),
					voltageMv: (report[RESP_VOLTAGE_INDEX] << 8) | report[RESP_VOLTAGE_INDEX + 1],
					connection: KNOWN_DEVICES[info.productId] ?? "unknown",
					product: info.product,
				};
			}
		}

		throw new Error(
			"No battery response. The mouse may be asleep (move it) or the ATK V HUB may be interfering.",
		);
	} finally {
		device.close();
	}
}
