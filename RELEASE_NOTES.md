# Release Notes

## 0.1.1 - Security hardening
- Enable Chromium sandboxing for renderer isolation
- Restrict external URL handling to http/https only
- Gate IPC calls to trusted app origins
- Allow PDF writes only to user-approved save paths
- Add payload size limits for PDF and certificate data
- Require a password when generating self-signed certificates

## 0.1.0 - Initial release
- Open existing PDFs or start from a blank document
- Draw form fields (text fields, checkboxes)
- Inline text editing with font, size, color, and styling
- Signature capture (drawn or typed)
- Digital signing with P12/PFX certificates
- Export final PDFs
- Windows installer via electron-builder
