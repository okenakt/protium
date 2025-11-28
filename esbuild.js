const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * Copy templates directory to dist
 */
function copyTemplates() {
  const src = path.join(__dirname, "src", "templates");
  const dest = path.join(__dirname, "dist", "templates");

  // Remove existing templates directory
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true });
  }

  // Copy templates directory
  fs.cpSync(src, dest, { recursive: true });
  console.log("✓ Templates copied to dist/templates");
}

/**
 * @type {import('esbuild').Plugin}
 */
const copyTemplatesPlugin = {
  name: "copy-templates",
  setup(build) {
    build.onEnd(() => {
      copyTemplates();
    });
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: "dist/extension.js",
    external: ["vscode", "zeromq"],
    logLevel: "info",
    plugins: [copyTemplatesPlugin],
  });

  if (watch) {
    await ctx.watch();
    console.log("Watching for changes...");
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
