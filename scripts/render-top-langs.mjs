#!/usr/bin/env node
// Parses the language name/color/percentage data already fetched and computed
// by the github-readme-stats-action's top-langs card (rendered to a staging
// SVG), then re-renders it as a thin donut ring with the legend on the left.
// This reuses that action's existing data-fetching/aggregation instead of
// re-implementing a second GitHub API client.
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error("Usage: render-top-langs.mjs <staging-svg> <output-svg>");
  process.exit(1);
}

const svg = readFileSync(inputPath, "utf8");

const entryRe =
  /<circle[^>]*fill=["']([^"']+)["'][^>]*\/>\s*<text[^>]*class=['"]lang-name['"][^>]*>\s*([^<]+?)\s+([\d.]+)%\s*<\/text>/g;

const langs = [];
for (const m of svg.matchAll(entryRe)) {
  langs.push({ color: m[1], name: m[2].trim(), percent: parseFloat(m[3]) });
}

if (langs.length === 0) {
  throw new Error("No language entries found in staging SVG — parser regex may be stale.");
}

unlinkSync(inputPath);

// ---- layout constants (match the stats card: 467x207, same border/bg) ----
const WIDTH = 467;
const HEIGHT = 207;
const PADDING_TOP = 30;
const ROW_HEIGHT = 30;
const LEGEND_X = 25;
const DONUT_CX = 350;
const DONUT_CY = HEIGHT / 2;
const DONUT_R = 68;
const RING_WIDTH = 4;

const circumference = 2 * Math.PI * DONUT_R;
let cumulativePercent = 0;
const ringSegments = langs
  .map((lang) => {
    const dash = (lang.percent / 100) * circumference;
    const gap = circumference - dash;
    const rotation = -90 + cumulativePercent * 3.6;
    cumulativePercent += lang.percent;
    return `<circle cx="${DONUT_CX}" cy="${DONUT_CY}" r="${DONUT_R}" fill="none" stroke="${lang.color}" stroke-width="${RING_WIDTH}" stroke-dasharray="${dash.toFixed(3)} ${gap.toFixed(3)}" transform="rotate(${rotation.toFixed(3)} ${DONUT_CX} ${DONUT_CY})" />`;
  })
  .join("\n    ");

const legendRows = langs
  .map((lang, i) => {
    const y = PADDING_TOP + i * ROW_HEIGHT;
    return `<g transform="translate(${LEGEND_X}, ${y})">
      <circle cx="5" cy="6" r="5" fill="${lang.color}" />
      <text x="16" y="10.5" class="lang-name">${lang.name} ${lang.percent.toFixed(2)}%</text>
    </g>`;
  })
  .join("\n    ");

const out = `<svg
  width="${WIDTH}"
  height="${HEIGHT}"
  viewBox="0 0 ${WIDTH} ${HEIGHT}"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  role="img"
  aria-labelledby="descId"
>
  <title id="titleId">Most Used Languages</title>
  <desc id="descId">${langs.map((l) => `${l.name}: ${l.percent.toFixed(2)}%`).join(", ")}</desc>
  <style>
    .lang-name {
      font: 600 14px 'Segoe UI', Ubuntu, "Helvetica Neue", Sans-Serif;
      fill: #434d58;
    }
  </style>
  <rect
    x="0.5" y="0.5" rx="4.5"
    width="${WIDTH - 1}" height="${HEIGHT - 1}"
    stroke="#e4e2e2" fill="#fffefe" stroke-opacity="1"
  />
  <g data-testid="lang-donut-ring">
    ${ringSegments}
  </g>
  <g data-testid="lang-legend">
    ${legendRows}
  </g>
</svg>
`;

writeFileSync(outputPath, out, "utf8");
console.log(`Wrote ${outputPath} with ${langs.length} languages.`);
