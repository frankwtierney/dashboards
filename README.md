# LN QR Code Logs Dashboard

A clean, minimalist React dashboard for UB late-night lounge attendance, designed for Microsoft Lists / SharePoint CSV exports.

## Features

- Attendance by building (sorted for quick comparisons)
- Trends by day of week
- Peak hours and quick peak insights
- Filters by date range, building, and day of week
- KPI cards (total attendance, average per building)
- **Latest upload tracking**: remembers your latest CSV upload in-browser with timestamp
- Optional committed fallback dataset from `/uploads`

## Data format expected

CSV columns from your export:

- `Building`
- `Timestamp`
- `DayOfWeek`
- `TimeOnly`

## How to use

1. Open the dashboard in a browser.
2. Upload your latest SharePoint export CSV in the **Data Source** panel.
3. The app stores this upload in local browser storage and auto-loads it on next visit.

## Team sharing via GitHub Pages

This repository is static and deployable directly to GitHub Pages.

### Option A (recommended for shared baseline)

Commit a fresh CSV into `uploads/` and update `uploads/index.json`:

```json
{
  "latestFile": "your-latest-export.csv",
  "uploadedAt": "2026-03-03T23:45:00.000Z"
}
```

Everyone sees that baseline file; each user can still upload their own local latest copy.

### Option B

Use local upload only (no repo updates needed), best for personal use.

## Deploy to GitHub Pages (no build step)

- Push this repo to GitHub.
- In repository settings → **Pages**:
  - Source: **Deploy from a branch**
  - Branch: `main` (or your chosen default), folder: `/ (root)`

Because this is a static React-in-browser build, Pages serves it directly.
