# English spelling dictionaries

The English resources are unmodified Hunspell source files from the official
LibreOffice dictionaries repository, pinned to commit
`67032ee957631908098a72edf48dc81cac27e369`.

Source directory:
https://github.com/LibreOffice/dictionaries/tree/67032ee957631908098a72edf48dc81cac27e369/en

- `en_US.aff`, `en_US.dic`: American English, SCOWL-derived dictionary.
  The complete upstream attribution, copyright notices and permissive licence
  terms are retained in `README_en_US.txt`.
- `en_GB.aff`, `en_GB.dic`: British English, maintained by David Bartlett,
  Andrew Brown, Brian Kelk and Marco A.G.Pinto, based on Kevin Atkinson's
  original word list. The upstream LGPL declaration, history and credits
  are retained in `README_en_GB.txt` and the affix file.
- `en-LICENSE.txt`: the unchanged `en/license.txt` distributed by LibreOffice.
  Individual dictionary notices remain authoritative; the package-level
  licence file does not replace them.
- `en-COPYING-LGPL-2.1.txt`, `en-COPYING-LGPL-3.0.txt` and
  `en-COPYING-GPL-3.0.txt`: complete GNU licence texts obtained from
  https://www.gnu.org/licenses/old-licenses/lgpl-2.1.txt,
  https://www.gnu.org/licenses/lgpl-3.0.txt and
  https://www.gnu.org/licenses/gpl-3.0.txt.

The `.aff` and `.dic` files are the editable dictionary sources themselves.
They are served locally alongside the existing Portuguese dictionary and
processed by Typo.js in the browser worker. CV text never goes to these
upstream websites or any external proofreading service.

A word is accepted if it is present in Portuguese, American English or British
English. Common hyphenated compounds are also accepted when each component
is a recognised word. Smart apostrophes are normalised only for dictionary
lookup; the user's original text and correction offsets are preserved.

This is spelling assistance, not bilingual grammar or semantic understanding.
Names and specialist vocabulary can still need confirmation. If any required
dictionary fails to load or validate, the review reports unavailable rather
than treating English words as Portuguese misspellings.
