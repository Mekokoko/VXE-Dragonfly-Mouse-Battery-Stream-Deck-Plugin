import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const isWatching = !!process.env.ROLLUP_WATCH;
const sdPlugin = "com.mekokoko.vxebattery.sdPlugin";

/**
 * Packages that must not be bundled by rollup and are instead copied into the
 * plugin's bin/node_modules to be required at runtime:
 *   - node-hid: a native addon (cannot be bundled).
 *   - ws: rollup's CommonJS interop breaks ws's client socket; Node's own
 *     CJS interop resolves it correctly, so we keep it external.
 * Both have no runtime dependencies of their own (node-hid loads its prebuilt
 * binary via pkg-prebuilds; ws's bufferutil/utf-8-validate are optional).
 */
const externalPackages = ["node-hid", "ws"];

function bundleNativeDeps() {
	return {
		name: "bundle-native-deps",
		writeBundle() {
			const binModules = path.resolve(sdPlugin, "bin", "node_modules");
			for (const pkg of [...externalPackages, "pkg-prebuilds"]) {
				const src = path.resolve("node_modules", pkg);
				const dest = path.resolve(binModules, pkg);
				fs.rmSync(dest, { recursive: true, force: true });
				fs.cpSync(src, dest, { recursive: true });
			}
			// Prune node-hid to the Windows runtime essentials.
			const nh = path.resolve(binModules, "node-hid");
			const prebuilds = path.resolve(nh, "prebuilds");
			for (const entry of fs.readdirSync(prebuilds)) {
				if (!entry.startsWith("HID-win32")) {
					fs.rmSync(path.join(prebuilds, entry), { recursive: true, force: true });
				}
			}
			for (const junk of ["src", "hidapi", "binding.gyp", "README.md", "LICENSE-bsd.txt"]) {
				fs.rmSync(path.join(nh, junk), { recursive: true, force: true });
			}
		},
	};
}

/**
 * @type {import('rollup').RollupOptions}
 */
const config = {
	input: "src/plugin.ts",
	// These are required at runtime from bin/node_modules (see bundleNativeDeps).
	external: externalPackages,
	output: {
		file: `${sdPlugin}/bin/plugin.js`,
		sourcemap: isWatching,
		sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
			return url.pathToFileURL(path.resolve(path.dirname(sourcemapPath), relativeSourcePath)).href;
		},
	},
	plugins: [
		{
			name: "watch-externals",
			buildStart: function () {
				this.addWatchFile(`${sdPlugin}/manifest.json`);
			},
		},
		typescript({
			mapRoot: isWatching ? "./" : undefined,
		}),
		nodeResolve({
			browser: false,
			exportConditions: ["node"],
			preferBuiltins: true,
		}),
		commonjs(),
		!isWatching && terser(),
		{
			name: "emit-module-package-file",
			generateBundle() {
				this.emitFile({ fileName: "package.json", source: `{ "type": "module" }`, type: "asset" });
			},
		},
		bundleNativeDeps(),
	],
};

export default config;
