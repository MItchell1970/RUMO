# Local spelling dependencies

These original source files are bundled locally. No CV text is sent to a spelling service.

## Typo.js

- Project: https://github.com/cfinke/Typo.js
- Pinned commit: `1d594ebd9a12f922fa4884324cfb67ae569e4095`
- Source: https://github.com/cfinke/Typo.js/blob/1d594ebd9a12f922fa4884324cfb67ae569e4095/typo/typo.js
- Files: `typo.js`, `typo-LICENSE.txt` (unmodified upstream files).
- License: Modified BSD, copyright Christopher Finke. See the included complete notice.

## Portuguese (Portugal) dictionary

- Upstream distributor: https://github.com/LibreOffice/dictionaries
- Authors: Projecto Natura, Universidade do Minho; José João de Almeida, Rui Vilela, Alberto Simões.
- Pinned commit: `67032ee957631908098a72edf48dc81cac27e369`
- Source: https://github.com/LibreOffice/dictionaries/tree/67032ee957631908098a72edf48dc81cac27e369/pt_PT
- Local `pt-PT.aff` and `pt-PT.dic` are unmodified copies of upstream `pt_PT.aff` and `pt_PT.dic` (only filenames differ).
- Locale: `pt_PT`; this is **not** the `pt_BR` dictionary.
- Original upstream notices are preserved as `pt-PT-README.txt` and `pt-PT-LICENSES.txt`, including their original encodings. The spellchecker README lists GPL 2 / LGPL 2.1 / MPL 1.1; the extension notices also mention GPL/BSD. The dictionary is redistributed here under GPL version 2, with the full text in `pt-PT-COPYING-GPL-2.txt`; the `.aff` and `.dic` files are the corresponding source.
- Official Portuguese documentation: https://pt.libreoffice.org/descarregar/dicionarios/

Retrieved 2026-10-13. Dictionary files are UTF-8. This checker is a bounded spelling aid with simple punctuation checks; it is not a complete grammar checker, a layout analyser, or a guarantee of error-free Portuguese.

The local application limits input to 30,000 characters and results to 40 issues. It ignores URLs, email addresses, acronyms, common CV software terms, user-confirmed words, and likely proper names. Suggestions are limited to nearby dictionary words (one edit) for up to 10 flagged words; an empty suggestion list does not mean the spelling is correct. No original upstream dictionary entries are modified.
