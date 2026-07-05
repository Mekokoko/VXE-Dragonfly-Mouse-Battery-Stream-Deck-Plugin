#!/usr/bin/env python3
"""Read battery level + charging status of a VXE/ATK "Compx" R1 mouse.

Works in BOTH connection modes and auto-detects which one is active:
  * wired      -> the mouse enumerates directly as PID 0xF58C ("VXE R1 PRO MAX")
  * wireless   -> the 2.4 GHz receiver enumerates as PID 0xF58A ("... 1K Dongle")

Same vendor HID protocol in both cases (reverse-engineered from the ATK V HUB
WebHID code); only the USB product id differs.

Protocol
--------
* Vendor id    : 0x3554
* Transport    : the vendor collection with an OUTPUT *and* INPUT report id 8,
                 16 data bytes (HID usage page 0xFF02, usage 2).
* Request      : 16-byte packet sent as report id 8:
                   byte 0     = command id (4 = GetBatteryLevel)
                   bytes 1-14 = 0
                   byte 15    = checksum = (85 - ((8 + sum(bytes[0:15])) & 0xFF)) & 0xFF
* Response     : input report, report id 8. Including the leading report-id byte:
                   [1] = command id echo (4)
                   [6] = battery level (%)
                   [7] = charging flag (0 = on battery, 1 = charging)
                   [8..9] = battery voltage in mV, big-endian
"""

import argparse
import sys
import time

import hid

VENDOR_ID = 0x3554
REPORT_ID = 8
PACKET_SIZE = 16
CMD_GET_BATTERY = 4

TRANSPORT_USAGE_PAGE = 0xFF02
TRANSPORT_USAGE = 0x02

# Known product ids -> human-readable connection type.
KNOWN_DEVICES = {
    0xF58C: "wired",
    0xF58A: "wireless (2.4GHz dongle)",
}

# Response byte indices (report-id byte included, as hidapi returns it).
RESP_CMD_INDEX = 1
RESP_BATTERY_INDEX = 6
RESP_CHARGE_INDEX = 7
RESP_VOLTAGE_INDEX = 8  # big-endian uint16 at [8], [9]


def build_packet(command_id: int) -> list[int]:
    """Build the 16-byte command packet (without the leading report-id byte)."""
    pkt = [0] * PACKET_SIZE
    pkt[0] = command_id
    pkt[15] = (85 - ((REPORT_ID + sum(pkt[0:15])) & 0xFF)) & 0xFF
    return pkt


def find_transport(pids=None):
    """Return (path, product_id, product_string) of the first matching mouse.

    Searches for the vendor protocol collection under VENDOR_ID. If *pids* is
    given, only those product ids are considered; otherwise any known device.
    """
    for dev in hid.enumerate(VENDOR_ID, 0):
        if dev["usage_page"] != TRANSPORT_USAGE_PAGE or dev["usage"] != TRANSPORT_USAGE:
            continue
        pid = dev["product_id"]
        if pids is not None and pid not in pids:
            continue
        if pids is None and pid not in KNOWN_DEVICES:
            continue
        return dev["path"], pid, dev.get("product_string")
    return None, None, None


def read_battery(timeout_s: float = 3.0, pids=None) -> dict:
    """Query the mouse; returns level / charging / voltage / connection info."""
    path, pid, product = find_transport(pids)
    if path is None:
        raise RuntimeError(
            "No supported mouse found. Plug in the cable or the 2.4GHz receiver "
            "and make sure the mouse is awake."
        )

    dev = hid.device()
    dev.open_path(path)
    try:
        dev.set_nonblocking(1)
        for _ in range(16):  # drain stale/unsolicited input reports
            dev.read(64)

        dev.write([REPORT_ID] + build_packet(CMD_GET_BATTERY))

        deadline = time.time() + timeout_s
        while time.time() < deadline:
            report = dev.read(64)
            if (report and len(report) > RESP_VOLTAGE_INDEX + 1
                    and report[RESP_CMD_INDEX] == CMD_GET_BATTERY):
                return {
                    "level": report[RESP_BATTERY_INDEX],
                    "charging": bool(report[RESP_CHARGE_INDEX]),
                    "voltage_mv": (report[RESP_VOLTAGE_INDEX] << 8)
                    | report[RESP_VOLTAGE_INDEX + 1],
                    "product_id": pid,
                    "product": product,
                    "connection": KNOWN_DEVICES.get(pid, "unknown"),
                }
            time.sleep(0.01)

        raise TimeoutError(
            "No battery response. The mouse may be asleep (move it) or the "
            "ATK V HUB may be interfering."
        )
    finally:
        dev.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Read VXE/ATK R1 mouse battery.")
    parser.add_argument("--json", action="store_true", help="print raw JSON")
    parser.add_argument("--watch", type=float, metavar="SECONDS", default=None,
                        help="poll continuously every SECONDS")
    args = parser.parse_args()

    def once() -> int:
        try:
            info = read_battery()
        except Exception as exc:  # noqa: BLE001 - top-level CLI handler
            print(f"Error: {exc}", file=sys.stderr)
            return 1
        if args.json:
            import json
            print(json.dumps(info))
        else:
            state = "charging" if info["charging"] else "on battery"
            print(f"{info['product']} [{info['connection']}]: "
                  f"{info['level']}%  ({state}, {info['voltage_mv']} mV)")
        return 0

    if args.watch is None:
        return once()

    try:
        while True:
            once()
            time.sleep(args.watch)
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
