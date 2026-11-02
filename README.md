# Astra AI Browser

Cross-platform Electron port. Development preview; Swift feature parity and real-site automation remain incomplete.

## Development

Requires Node.js 24. Run `npm ci`, `npm run prepare:tools`, then `npm start`. Media preparation downloads platform-specific yt-dlp, FFmpeg and a Node runtime, with their licenses. To create packages, run `npm run dist`. macOS targets DMG/ZIP, Windows NSIS/ZIP, and Linux DEB/RPM. Build on each target operating system. Linux packaging needs rpm.

The GitHub build workflow has read-only repository access and uploads build artifacts; it does not publish releases or hold signing credentials. Preview builds are unsigned. Apple notarization requires a local Developer ID certificate with its private key. Xcode account login and an app-specific password alone cannot supply that key.

## AI

Configure a ZenMux API key in Settings. A registration link and separate key/model tests are provided. Model tests incur one short request. Keys use Electron safeStorage and never belong in the repository.

## Translation and user dictionary

The toolbar offers immersive translation and a user dictionary. Translation runs paragraph by paragraph, retains original elements and links, and supports bilingual or translated-only views, independent target language, dynamic content, progress, cancellation, retry and restoration. Code blocks remain unchanged; inline parameters are included as context. Text in loaded frames is supported, but closed shadow roots, canvas, image text and PDF rendering are not covered.

Select webpage text and right-click to explain it in context. Saved dictionary entries contain the selected word, meaning, part of speech, explanation, original passage, passage translation and source. Settings provides JSON and Markdown exports through native save dialogs. Page text is sent to the configured ZenMux model after the user starts translation or requests a selected-word explanation. Dictionaries are stored locally.

The development build was tested on a BBC news article and the OpenAI streaming responses guide. Tests verified bilingual text, failed-block retry, original code preservation, contextual vocabulary, persistence after restart and both export formats. These checks do not guarantee compatibility with every website.

## Current limitations

X Guard remains incomplete. Automated browser actions require approval and real-site verification. A completion observer is an AI assessment, not guaranteed task success. Cross-process embedded frames require additional validation. Media summaries sample eight video frames and do not analyze audio.

## Licensing

Original Astra-derived application code follows GPL-3.0-only. Vendored components retain their own licenses. huashu-chrome content-script code is MIT licensed; attribution and license are preserved in `src/vendor/huashu`. Generated icons are in `assets/icons`. Bundled media binaries retain separate upstream licenses.
