# PDF export assets

All resources are served from the same site. Creating a PDF does not upload
the CV or contact an external API.

- `pdf-lib.min.mjs`: pdf-lib 1.17.1 ES module distribution. MIT; see
  `pdf-lib-LICENSE.md`. Source: https://github.com/Hopding/pdf-lib.
- `fontkit.min.mjs`: @pdf-lib/fontkit 1.1.1 `dist/fontkit.es.min.js`, downloaded
  from https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.es.min.js.
  The sole change redirects its `pako` import to `./pako.min.mjs`.
  MIT; see `fontkit-LICENSE.txt` for the upstream license declaration and authors.
- `pako.min.mjs`: pako 1.0.11 bundled UMD distribution, wrapped with local `module`
  and `exports` variables and an ES default export. The library body is unmodified.
  Licenses: `pako-LICENSE.txt`. Source: https://github.com/nodeca/pako.
- `LiberationSans-Regular.ttf`, `LiberationSans-Bold.ttf`: Liberation Sans.
  Font license and upstream notices: `LiberationSans-LICENSE.txt`.
- `LiberationSerif-Regular.ttf`, `LiberationSerif-Bold.ttf`,
  `LiberationSerif-Italic.ttf`: Liberation Serif 2.1.5, used by the Rumo template.
  SIL Open Font License 1.1; see `LiberationSerif-LICENSE.txt`.
  Official release: https://github.com/liberationfonts/liberation-fonts/releases/tag/2.1.5.
  Archive: https://github.com/liberationfonts/liberation-fonts/files/7261482/liberation-fonts-ttf-2.1.5.tar.gz.

The single template follows the supplied reference's Letter page, 36-point
margins, serif typography, underlined headings, and aligned dates and places.
Liberation Serif is a metric-compatible substitute for Times New Roman; this
is a reusable recreation, not a pixel-identical Word renderer. It adjusts
spacing before body type (12 down to 10 points), preserves all supplied text,
and uses additional pages at 12 points if a readable one-page layout cannot fit.

The export validates every character against the embedded font before writing
the PDF. Unsupported characters cause an explicit error rather than silently
discarding names or replacing text with empty glyphs.
