# Release Checklist

## Prep
- [ ] Update `package.json` version
- [ ] Update `RELEASE_NOTES.md`
- [ ] Update README if features changed
- [ ] Run `npm install` if dependencies changed
- [ ] Run `npm run lint`
- [ ] Smoke test: open PDF, create text + field + checkbox, add signature, export

## Build
- [ ] Run `npm run build`
- [ ] Launch Electron with `npm run start` and test exports

## GitHub Release
- [ ] Commit changes
- [ ] Tag the release (e.g. `v0.1.0`)
- [ ] Push commits + tags
- [ ] Create a GitHub release with notes
