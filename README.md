# Writing Checker for Word

A Word add-in that opens in a side panel and checks your document for:

- **Grammar**
- **Punctuation**
- **Spelling and typos**
- **Repeated phrases**, grouped by phrase length (6-word phrases first, then 5, and so on)
- **Glue sentences**, meaning sentences stuffed with filler words like *the, of, that, was, it*
- **Pronoun streaks**, for when three or more sentences in a row open with the same pronoun ("She walked in. She sat down. She sighed.")

Click any result and Word jumps to that spot. Grammar and spelling results come with suggested fixes that you can apply in one click. If a phrase shows up more than once, keep clicking it to move from one use to the next.

## How it works

Grammar, punctuation and spelling come from [LanguageTool](https://languagetool.org), a free, open-source proofreader. **Your text gets sent to their server for those three checks.** If that bothers you, switch it off in Settings or point the add-in at a LanguageTool server you run yourself. (It's a single Java download or Docker image.)

Everything else (repeats, glue, pronouns) runs right in the panel. That text never leaves your computer.

The free LanguageTool server caps you at about 20 requests a minute, so the add-in sends long manuscripts in chunks with a short pause between each. A 100,000-word novel takes a minute or two. If you have LanguageTool Premium, put your username and API key in Settings and it'll go faster and catch more.

## Setup

You need [Node.js](https://nodejs.org) 18 or newer and desktop Word (Windows or Mac) or Word on the web.

```bash
npm install
npm run certs      # one time: trusts a localhost HTTPS certificate (it'll ask for permission)
npm start          # starts the local server and opens Word with the add-in loaded
```

Look on the **Home** tab for a **Check Writing** button.

For Word on the web, run `npm run dev-server`. Then, in Word online, go to **Home → Add-ins → More Add-ins → My Add-ins → Upload My Add-in** and choose `manifest.xml`.

When you're done, `npm stop` unloads it.

## Tweaking the checks

Open **Settings** at the bottom of the panel. You can change:

| Setting | Default | What it does |
|---|---|---|
| Shortest / longest phrase | 2 / 6 words | Phrase lengths the repeat finder looks at |
| Min. repeats (2 words) | 3 | Two-word phrases repeat naturally, so they need more hits before they count |
| Min. repeats (3+ words) | 2 | Longer phrases get flagged after showing up twice |
| Flag at glue % | 45 | How filler-heavy a sentence has to be before it's flagged |
| Min. sentence words | 8 | Short sentences get skipped, because "It was over." is fine |
| Pronoun run length | 3 | How many same-pronoun openers in a row it takes to flag a run |
| Count runs across paragraphs | on | Turn off if you only care about streaks inside one paragraph |
| Pronouns | I, you, he, she, it, we, they, my, your, his, her, its, our, their | Add or remove whatever you like |

"Add to dictionary" saves a word so it won't get flagged as a misspelling again. "Ignore rule" switches off that LanguageTool rule for good. You can undo either one in Settings.

A couple of details: the repeat finder skips phrases built entirely out of filler words ("it was in the"), since those would bury everything else. When a short phrase only ever appears inside a longer repeat, you'll just see the longer one. Contractions count for pronouns too, so "She'd" matches "She".

## Project layout

```
manifest.xml          tells Word about the add-in
src/taskpane.html     the panel
src/taskpane.js       UI and wiring
src/analyzers.js      repeats, glue, pronoun checks (plain JS, no Office code)
src/languagetool.js   grammar/spelling client
src/word.js           finding, selecting and replacing text in Word
scripts/serve.mjs     local HTTPS server
tests/                run with `npm test`
```

## Publishing it for real

Right now the manifest points at `https://localhost:3000`. To use it without running a server, host the `src` and `assets` folders somewhere with HTTPS (GitHub Pages, Netlify and Azure Static Web Apps all work). Then swap every `https://localhost:3000` in `manifest.xml` for that address and run `npm run validate` before sideloading or submitting.
