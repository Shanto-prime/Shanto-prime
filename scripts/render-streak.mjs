#!/usr/bin/env node
// Renders a single bottom bar: the rank grade circle (parsed from the stats
// card's own output — same data-fetching the old stats card used, just the
// grade fragment reused instead of the whole card) alongside the
// total-contributions / current-streak / longest-streak numbers computed
// from the contributionCalendar GraphQL response. No day-by-day calendar
// grid — just the grade + the three summary numbers, in one line.
import { readFileSync, writeFileSync } from "node:fs";

const [, , statsRawPath, calendarPath, outputPath] = process.argv;
if (!statsRawPath || !calendarPath || !outputPath) {
  console.error(
    "Usage: render-streak.mjs <stats-raw-svg> <calendar.json> <output-svg>",
  );
  process.exit(1);
}

// ---- parse the rank grade circle out of the staged stats card ----
const statsRaw = readFileSync(statsRawPath, "utf8");

const rimStroke = statsRaw.match(
  /\.rank-circle-rim\s*\{[^}]*stroke:\s*([^;]+);/,
)?.[1]?.trim();
const ringStroke = statsRaw.match(
  /\.rank-circle\s*\{[^}]*stroke:\s*([^;]+);/,
)?.[1]?.trim();
const strokeWidth = statsRaw.match(
  /\.rank-circle-rim\s*\{[^}]*stroke-width:\s*([^;]+);/,
)?.[1]?.trim();
const dashArray = statsRaw.match(
  /\.rank-circle\s*\{[^}]*stroke-dasharray:\s*([^;]+);/,
)?.[1]?.trim();
const dashOffset = statsRaw.match(
  /@keyframes rankAnimation\s*\{[\s\S]*?to\s*\{\s*stroke-dashoffset:\s*([^;]+);/,
)?.[1]?.trim();
const grade = statsRaw
  .match(/data-testid="level-rank-icon">\s*([^<]+?)\s*</)?.[1]
  ?.trim();

if (!rimStroke || !ringStroke || !strokeWidth || !dashArray || !dashOffset || !grade) {
  throw new Error(
    "Could not parse the rank circle out of the staged stats SVG — its markup may have changed.",
  );
}

// ---- streak numbers from the contribution calendar ----
const data = JSON.parse(readFileSync(calendarPath, "utf8"));
const calendar = data?.data?.user?.contributionsCollection?.contributionCalendar;
if (!calendar) {
  throw new Error(`Unexpected GraphQL response shape: ${JSON.stringify(data).slice(0, 500)}`);
}

const totalContributions = calendar.totalContributions;
const days = calendar.weeks.flatMap((w) => w.contributionDays);

let longestStreak = 0;
let run = 0;
for (const day of days) {
  if (day.contributionCount > 0) {
    run += 1;
    longestStreak = Math.max(longestStreak, run);
  } else {
    run = 0;
  }
}

let currentStreak = 0;
{
  let i = days.length - 1;
  const today = new Date().toISOString().slice(0, 10);
  if (days[i].date === today && days[i].contributionCount === 0) {
    i -= 1; // today isn't over yet — don't let a still-zero today break the streak
  }
  for (; i >= 0 && days[i].contributionCount > 0; i -= 1) {
    currentStreak += 1;
  }
}

// ---- layout: grade circle on the left, 3 stat columns on the right ----
const WIDTH = 734;
const HEIGHT = 140;
const CY = HEIGHT / 2;
const GRADE_CX = 75;
const GRADE_R = 40;
const DIVIDER_X = 150;

const statsAreaWidth = WIDTH - DIVIDER_X;
const colCenters = [0, 1, 2].map(
  (i) => DIVIDER_X + statsAreaWidth * ((i + 0.5) / 3),
);

const stat = (x, label, value) => `
    <g transform="translate(${x}, ${CY - 30})">
      <text x="0" y="30" text-anchor="middle" class="stat-value">${value}</text>
      <text x="0" y="50" text-anchor="middle" class="stat-label">${label}</text>
    </g>`;

const out = `<svg
  width="${WIDTH}"
  height="${HEIGHT}"
  viewBox="0 0 ${WIDTH} ${HEIGHT}"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  role="img"
  aria-labelledby="descId"
>
  <title id="titleId">GitHub Contribution Streak</title>
  <desc id="descId">Grade: ${grade}. Total contributions (last 365 days): ${totalContributions}. Current streak: ${currentStreak} days. Longest streak: ${longestStreak} days.</desc>
  <style>
    .stat-value { font: 700 22px 'Segoe UI', Ubuntu, Sans-Serif; fill: #2f80ed; }
    .stat-label { font: 600 12px 'Segoe UI', Ubuntu, Sans-Serif; fill: #434d58; }
    .rank-text { font: 800 24px 'Segoe UI', Ubuntu, Sans-Serif; fill: #434d58; }
  </style>
  <rect x="0.5" y="0.5" rx="4.5" width="${WIDTH - 1}" height="${HEIGHT - 1}" stroke="#e4e2e2" fill="#fffefe" stroke-opacity="1" />

  <g data-testid="rank-circle">
    <circle cx="${GRADE_CX}" cy="${CY}" r="${GRADE_R}" stroke="${rimStroke}" stroke-width="${strokeWidth}" fill="none" opacity="0.2" />
    <circle cx="${GRADE_CX}" cy="${CY}" r="${GRADE_R}" stroke="${ringStroke}" stroke-width="${strokeWidth}" stroke-linecap="round" fill="none" opacity="0.8"
      stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}"
      transform="rotate(-90 ${GRADE_CX} ${CY})" />
    <text x="${GRADE_CX}" y="${CY + 1}" text-anchor="middle" alignment-baseline="central" dominant-baseline="central" class="rank-text">${grade}</text>
  </g>

  <line x1="${DIVIDER_X}" y1="15" x2="${DIVIDER_X}" y2="${HEIGHT - 15}" stroke="#e4e2e2" stroke-width="1" />
  <line x1="${colCenters[0] + statsAreaWidth / 6}" y1="25" x2="${colCenters[0] + statsAreaWidth / 6}" y2="${HEIGHT - 25}" stroke="#e4e2e2" stroke-width="1" />
  <line x1="${colCenters[1] + statsAreaWidth / 6}" y1="25" x2="${colCenters[1] + statsAreaWidth / 6}" y2="${HEIGHT - 25}" stroke="#e4e2e2" stroke-width="1" />

  ${stat(colCenters[0], "Total Contributions (365d)", totalContributions)}
  ${stat(colCenters[1], "Current Streak (days)", currentStreak)}
  ${stat(colCenters[2], "Longest Streak (days)", longestStreak)}
</svg>
`;

writeFileSync(outputPath, out, "utf8");
console.log(
  `Wrote ${outputPath}: grade=${grade} total=${totalContributions} current=${currentStreak} longest=${longestStreak}`,
);
