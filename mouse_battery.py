#!/usr/bin/env python3
"""Read the battery level of an ATK/VXE "Compx" wireless mouse (e.g. Dragonfly R1 Pro Max).

Talks to the mouse's 2.4 GHz dongle directly over HID, using the same protocol the
ATK V HUB app uses (reverse-engineered from its WebHID code). No need for the HUB.

Protocol summary
----------------
* Device       : VID 0x3554, PID 0xF58A ("VXE NordicMouse 1K Dongle" / Compx).
* Transport    : the vendor collection whose report descriptor has an OUTPUT *and*
                 INPUT report with id 8 and 16 data bytes (usage page 0xFF02, usage 2).
* Request      : 16-byte packet, report id 8:
                   byte 0    = command id (4 = GetBatteryLevel)
                   bytes 1-14= 0
                   byte 15   = checksum = (85 - ((8 + sum(bytes[0:15])) & 0xFF)) & 0xFF
                 (the constant 8 in the checksum is the report id itself)
* Response     : input report, report id 8. After the report id byte:
                   byte 0 = command id echo (4)
                   byte 5 = battery level (%)          <- baseOffset (5) + 0
                   byte 6 = charging flag (0/1)        <- baseOffset + 1
                   bytes 7-8 = battery voltage in mV, big-endian
"""

import sys
import time

import hid

VENDOR_ID = 0x3554
PRODUCT_ID = 0xF58A
REPORT_ID = 8
PACKET_SIZE = 16
CMD_GET_BATTERY = 4

# The vendor collection that carries the request/response protocol.
TRANSPORT_USAGE_PAGE = 0xFF02
TRANSPORT_USAGE = 0x02

# Offset of the response byte 0 (command echo) once the report-id byte is included.
RESP_CMD_INDEX = 1
# baseOffset (5) of the payload, shifted by +1 for the leading report-id byte.
RESP_BATTERY_INDEX = 6
RESP_CHARGE_INDEX = 7
RESP_VOLTAGE_INDEX = 8  # big-endian uint16 at [8], [9]


def build_packet(command_id: int) -> list[int]:
    """Build the 16-byte command packet (without the leading report-id byte)."""
    pkt = [0] * PACKET_SIZE
    pkt[0] = command_id
    checksum = (85 - ((REPORT_ID + sum(pkt[0:15])) & 0xFF)) & 0xFF
    pkt[15] = checksum
    return pkt


def find_transport_path():
    """Locate the HID path of the vendor protocol collection."""
    for dev in hid.enumerate(VENDOR_ID, PRODUCT_ID):
        if (dev["usage_page"] == TRANSPORT_USAGE_PAGE
                and dev["usage"] == TRANSPORT_USAGE):
            return dev["path"]
    return None


def read_battery(timeout_s: float = 3.0) -> dict:
    """Query the mouse and return {'level', 'charging', 'voltage_mv'}."""
    path = find_transport_path()
    if path is None:
        raise RuntimeError(
            "Mouse dongle not found. Is the receiver plugged in and the mouse on? "
            f"(looking for VID={VENDOR_ID:#06x} PID={PRODUCT_ID:#06x})"
        )

    dev = hid.device()
    dev.open_path(path)
    try:
        dev.set_nonblocking(1)
        # Drain any stale/unsolicited input reports.
        for _ in range(16):
            dev.read(64)

        dev.write([REPORT_ID] + build_packet(CMD_GET_BATTERY))

        deadline = time.time() + timeout_s
        while time.time() < deadline:
            report = dev.read(64)
            if report and len(report) > RESP_VOLTAGE_INDEX + 1 \
                    and report[RESP_CMD_INDEX] == CMD_GET_BATTERY:
                return {
                    "level": report[RESP_BATTERY_INDEX],
                    "charging": bool(report[RESP_CHARGE_INDEX]),
                    "voltage_mv": (report[RESP_VOLTAGE_INDEX] << 8)
                    | report[RESP_VOLTAGE_INDEX + 1],
                }
            time.sleep(0.01)

        raise TimeoutError(
            "No battery response from the mouse. The mouse may be asleep "
            "(move it) or the ATK V HUB may be interfering."
        )
    finally:
        dev.close()


def main() -> int:
    try:
        info = read_battery()
    except Exception as exc:  # noqa: BLE001 - top-level CLI handler
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    status = "charging" if info["charging"] else "on battery"
    print(f"Battery: {info['level']}%  ({status}, {info['voltage_mv']} mV)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
