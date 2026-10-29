# Local DOCX import

- `sax.mjs`: sax 1.6.1, the unchanged `lib/sax.js` distribution wrapped with an
  ES module export. Source: https://github.com/isaacs/sax-js. The upstream
  Blue Oak Model License 1.0.0 is preserved in `sax-LICENSE.md`.
- `pako.min.mjs`: pako 1.0.11, already used by PDF export. Used to inflate
  selected WordprocessingML parts locally. See `pako-LICENSE.txt`.

`docx-reader.js` reads ZIP entries into memory without extracting files to disk.
It accepts only document/header/footer XML parts, applies compressed/expanded
size and XML-depth limits, and rejects DTD/entity declarations. It does not
resolve external links, download embedded resources, or execute document macros.

Text runs are joined as stored by Word. Paragraphs, explicit breaks, list
markers, and row-wise table alignment are preserved. DOCX imports return no
PDF layout measurements: layout is measured only after PDF generation.
