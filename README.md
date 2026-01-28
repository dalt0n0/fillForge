# FillForge

Create, fill, and sign PDFs on desktop with an inline, modern editing experience.

## Highlights
- Open existing PDFs or start from a blank document
- Draw form fields (text fields, checkboxes)
- Edit text in-place with font, size, color, and styling controls
- Capture signatures (drawn or typed)
- Digitally sign with P12/PFX certificates
- Export clean, final PDFs

## Tech Stack
- Electron + Vite + React
- pdf-lib and pdfjs
- @signpdf for digital signatures

## Quick Start
Prerequisites:
- Node.js 20+
- npm

Install dependencies:
```bash
npm install
```

Run the desktop app:
```bash
npm run dev
```

## Usage Flow
1. Open a PDF or create a blank document.
2. Choose a tool and place elements on the page.
3. Edit text directly in the document using the on-page toolbar.
4. Create a signature and (optionally) load or create a certificate.
5. Export the final PDF.

## Scripts
- `npm run dev` - Vite dev server + Electron
- `npm run build` - Build the renderer
- `npm run start` - Launch Electron (expects renderer to be built)
- `npm run lint` - Lint the project
- `npm run dist` - Build a packaged release
- `npm run dist:win` - Build a Windows installer (.exe)

## Notes
- Editing is locked after applying a digital signature.
- Certificate creation is available inside the app.

## Project Structure
- `electron/` - Electron main process + preload
- `src/` - React UI, PDF rendering, and tools
- `scripts/` - Helper scripts to launch Electron

## License
MIT License. See `LICENSE`.
