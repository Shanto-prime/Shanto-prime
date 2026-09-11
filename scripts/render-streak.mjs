#!/usr/bin/env node
// Renders a GitHub-style contribution heatmap + streak summary from the
// contributionCalendar GraphQL response already fetched by the workflow
// (same query/auth pattern used elsewhere in this repo — extended to also
// request the daily calendar instead of just the total).
import { readFileSync, writeFileSync } from "node:fs";

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error("Usage: render-streak.mjs <calendar.json> <output-svg>");
  process.exit(1);
}

const data = JSON.parse(readFileSync(inputPath, "utf8"));
const calendar = data?.data?.user?.contributionsCollection?.contributionCalendar;
if (!calendar) {
  throw new Error(`Unexpected GraphQL response shape: ${JSON.stringify(data).slice(0, 500)}`);
}

const totalContributions = calendar.totalContributions;
const weeks = calendar.weeks;
const days = weeks.flatMap((w) => w.contributionDays);

// --- streaks ---
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

// --- layout ---
const CELL = 10;
const GAP = 3;
const GRID_LEFT = 30;
const GRID_TOP = 95;
const MONTH_LABEL_Y = GRID_TOP - 8;
const HEADER_H = 70;
const WIDTH = GRID_LEFT + weeks.length * (CELL + GAP) + 15;
const HEIGHT = GRID_TOP + 7 * (CELL + GAP) + 20;

const monthNames = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

let monthLabels = "";
let lastMonth = -1;
weeks.forEach((week, wi) => {
  const firstDay = week.contributionDays[0];
  if (!firstDay) return;
  const month = new Date(firstDay.date + "T00:00:00Z").getUTCMonth();
  if (month !== lastMonth) {
    lastMonth = month;
    const x = GRID_LEFT + wi * (CELL + GAP);
    monthLabels += `<text x="${x}" y="${MONTH_LABEL_Y}" class="cal-label">${monthNames[month]}</text>\n    `;
  }
});

const dayLabels = ["", "Mon", "", "Wed", "", "Fri", ""]
  .map((label, di) => {
    if (!label) return "";
    const y = GRID_TOP + di * (CELL + GAP) + CELL - 1;
    return `<text x="0" y="${y}" class="cal-label">${label}</text>`;
  })
  .join("\n    ");

const cells = weeks
  .map((week, wi) => {
    const x = GRID_LEFT + wi * (CELL + GAP);
    return week.contributionDays
      .map((day, di) => {
        const y = GRID_TOP + di * (CELL + GAP);
        return `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${day.color}"><title>${day.date}: ${day.contributionCount} contributions</title></rect>`;
      })
      .join("\n    ");
  })
  .join("\n    ");

const stat = (x, label, value) => `
    <g transform="translate(${x}, 18)">
      <text x="0" y="30" text-anchor="middle" class="stat-value">${value}</text>
      <text x="0" y="50" text-anchor="middle" class="stat-label">${label}</text>
    </g>`;

const col1 = WIDTH * 0.2;
const col2 = WIDTH * 0.5;
const col3 = WIDTH * 0.8;

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
  <desc id="descId">Total contributions (last 365 days): ${totalContributions}. Current streak: ${currentStreak} days. Longest streak: ${longestStreak} days.</desc>
  <style>
    .stat-value { font: 700 22px 'Segoe UI', Ubuntu, Sans-Serif; fill: #2f80ed; }
    .stat-label { font: 600 12px 'Segoe UI', Ubuntu, Sans-Serif; fill: #434d58; }
    .cal-label { font: 400 9px 'Segoe UI', Ubuntu, Sans-Serif; fill: #767676; }
  </style>
  <rect x="0.5" y="0.5" rx="4.5" width="${WIDTH - 1}" height="${HEIGHT - 1}" stroke="#e4e2e2" fill="#fffefe" stroke-opacity="1" />
  <line x1="${WIDTH / 3}" y1="10" x2="${WIDTH / 3}" y2="${HEADER_H - 5}" stroke="#e4e2e2" stroke-width="1" />
  <line x1="${(WIDTH / 3) * 2}" y1="10" x2="${(WIDTH / 3) * 2}" y2="${HEADER_H - 5}" stroke="#e4e2e2" stroke-width="1" />
  ${stat(col1, "Total Contributions (last 365 days)", totalContributions)}
  ${stat(col2, "Current Streak (days)", currentStreak)}
  ${stat(col3, "Longest Streak (days)", longestStreak)}
  <line x1="10" y1="${HEADER_H}" x2="${WIDTH - 10}" y2="${HEADER_H}" stroke="#e4e2e2" stroke-width="1" />
  <g>
    ${dayLabels}
  </g>
  <g>
    ${monthLabels}
  </g>
  <g>
    ${cells}
  </g>
</svg>
`;

writeFileSync(outputPath, out, "utf8");
console.log(
  `Wrote ${outputPath}: total=${totalContributions} current=${currentStreak} longest=${longestStreak}`,
);
