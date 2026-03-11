# BorealTip

BorealTip is a minimal browser extension that adds watch-time tipping nudges on Rumble using the native wallet flow.

## Dev

- Install deps: `npm install`
- Build both: `npm run build`
- Build Chrome: `npm run build:chrome`
- Build Firefox: `npm run build:firefox`

Build outputs:
- `dist/chrome`
- `dist/firefox`

## Notes

This repo ships two manifests:
- `manifest.chrome.json` (MV3)
- `manifest.firefox.json` (MV3 with Firefox-specific settings)