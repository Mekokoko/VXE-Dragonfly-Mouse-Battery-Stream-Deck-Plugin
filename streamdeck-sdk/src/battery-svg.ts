/**
 * Renders the battery key as an SVG data URI. Stream Deck's `setImage` accepts
 * SVG directly, so the gauge scales crisply and needs no image library.
 */
export function batterySvg(level: number, charging: boolean, ok = true): string {
	let color: string;
	let fillWidth: number;
	let label: string;

	if (!ok) {
		color = "#5a5a5e";
		fillWidth = 0;
		label = "!";
	} else {
		const clamped = Math.max(0, Math.min(100, Math.round(level)));
		color = clamped > 50 ? "#3ec850" : clamped >= 20 ? "#f2b134" : "#e5484d";
		fillWidth = (50 * clamped) / 100;
		label = `${clamped}%`;
	}

	const bolt =
		ok && charging
			? "<path d='M50 28 L38 51 L47 51 L44 66 L58 43 L49 43 Z' fill='#ffd23f' stroke='#1c1c1e' stroke-width='2' stroke-linejoin='round'/>"
			: "";

	const svg =
		"<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'>" +
		"<rect width='100' height='100' rx='16' fill='#1c1c1e'/>" +
		"<rect x='16' y='26' width='58' height='34' rx='7' fill='none' stroke='#e8e8e8' stroke-width='4'/>" +
		"<rect x='76' y='36' width='7' height='14' rx='2' fill='#e8e8e8'/>" +
		`<rect x='20' y='30' width='${fillWidth.toFixed(1)}' height='26' rx='3' fill='${color}'/>` +
		bolt +
		"<text x='50' y='89' font-family='Arial,Helvetica,sans-serif' font-size='26' font-weight='bold' " +
		`fill='#ffffff' text-anchor='middle'>${label}</text>` +
		"</svg>";

	return "data:image/svg+xml;base64," + Buffer.from(svg, "utf-8").toString("base64");
}
