# Writing Checker for Word

Writing Checker adds a side panel to Microsoft Word that looks over your document for:

- grammar mistakes
- punctuation problems
- typos and misspelled words
- repeated phrases, grouped by how many words long they are
- glue sentences, meaning sentences padded out with filler words like *the, of, that, was*
- three or more sentences in a row that open with the same pronoun ("She walked in. She sat down. She sighed.")

Click any result and Word jumps right to it. Grammar and spelling results come with suggested fixes that you can apply with one click.

**Jump to:** [Install on Windows](#install-on-windows) · [Mac](#install-on-a-mac) · [Word on the web](#install-in-word-on-the-web) · [Troubleshooting](#troubleshooting) · [Using it](#using-the-checker)

---

## Before you start

Word add-ins don't have an installer. You won't find an .msi or .exe here. The add-in is a small web page hosted free on GitHub Pages, and one file, `manifest.xml`, tells Word where to find it. All you ever install is that one file.

**Check that the web page is up.** Open this link in your browser:

https://ciwstudy.github.io/word-writing-checker/src/taskpane.html

If you see a blue **Check document** button, you're good. The page will also say to open it inside Word. That's normal. If you get a 404 error instead, GitHub Pages isn't switched on yet. Go to **Settings → Pages** in the repo, set **Source** to **Deploy from a branch**, pick **main** and **/ (root)**, click **Save**, and give it a few minutes.

**Download the manifest.** Right-click this link and choose **Save link as**:

https://raw.githubusercontent.com/ciwstudy/word-writing-checker/main/manifest.xml

---

## Install on Windows

You need Word 2016 or newer, or Microsoft 365.

### 1. Put the manifest in its own folder

1. Open File Explorer and go to your **C:** drive. Make a new folder called `WordAddins`.
2. Move `manifest.xml` into that folder.

Some browsers quietly save the file as `manifest.xml.txt`. To check, click **View → Show → File name extensions** in File Explorer. If the name ends in `.txt`, rename it to plain `manifest.xml`.

### 2. Share the folder with yourself

Word only reads add-ins from a shared folder, even when you're the only one who uses it.

1. Right-click `WordAddins` and choose **Properties**.
2. Open the **Sharing** tab and click **Share...**
3. Your own name should be listed already. Click **Share**, then **Done**.
4. Back on the Sharing tab, find the **Network Path**. It looks something like `\\DESKTOP-4KJ82\WordAddins`. Copy it exactly.

### 3. Tell Word to trust that folder

1. Open Word and start a blank document.
2. Go to **File → Options**. It sits at the bottom left, sometimes tucked under **More...**
3. Click **Trust Center**, then the **Trust Center Settings...** button.
4. Pick **Trusted Add-in Catalogs** on the left.
5. Paste the network path into the **Catalog Url** box and click **Add catalog**.
6. Tick the **Show in Menu** box beside it. Easy to miss, and nothing shows up without it.
7. Click **OK**, then **OK** again.
8. Close Word completely. Every Word window, not just this one.

### 4. Add the checker

1. Reopen Word.
2. On the **Home** tab, click **Add-ins**, then **More Add-ins**. In older versions, look under **Insert → My Add-ins** instead.
3. Click the **SHARED FOLDER** tab at the top of the window that pops up.
4. Select **Writing Checker** and click **Add**.

A **Check Writing** button now shows up at the right end of the Home tab.

---

## Install on a Mac

1. Close Word.
2. In Finder, press **Cmd + Shift + G** and paste in:
   `~/Library/Containers/com.microsoft.Word/Data/Documents/wef`
   If the `wef` folder doesn't exist, create it.
3. Drop `manifest.xml` into that folder.
4. Open Word. The checker shows up under **Home → Add-ins**.

## Install in Word on the web

1. Open any document at office.com.
2. Go to **Home → Add-ins → More Add-ins → My Add-ins → Upload My Add-in**.
3. Choose `manifest.xml` and click **Upload**.

---

## Troubleshooting

**The Shared Folder tab is empty.**
Click **Refresh** in that window. If it's still empty, either the network path got mistyped or **Show in Menu** wasn't ticked. Go back to step 3 and check both.

**The panel opens but stays blank, or shows a 404.**
GitHub Pages isn't serving the page yet. Try the link in [Before you start](#before-you-start). If it doesn't load in your browser either, Pages is off or still starting up.

**The button disappeared after restarting Word.**
Word sometimes forgets add-ins loaded from a shared folder. Repeat step 4. The first three steps stay done.

**Grammar, Punctuation and Spelling all say they couldn't reach LanguageTool.**
Those three checks rely on LanguageTool's free online service. Check your internet connection. If you just ran a huge document, you may have hit their limit of about 20 requests a minute, so wait a minute and try again. The other three tabs keep working no matter what.

---

## Using the checker

1. Click **Check Writing** on the Home tab.
2. Click **Check document** at the top of the panel.
3. Flip between the tabs. Each shows how many things it found.

| Tab | What clicking does |
|---|---|
| Grammar / Punctuation / Spelling | Jumps to the problem. Click a suggestion button to fix it. **Ignore** hides that one result, **Add to dictionary** stops a word from being flagged, and **Ignore rule** turns off that kind of check entirely. |
| Repeats | Each click steps to the next place the phrase shows up ("Showing 2 of 5"). |
| Glue | Jumps to the sentence. The highlighted words are the filler you could trim. |
| Pronouns | Jumps to the first sentence in the run. Click any single sentence to go straight to it. |

**Settings** at the bottom of the panel let you change the phrase lengths, how many repeats count, the glue percentage that triggers a flag, how long a pronoun run has to be, and which pronouns to watch. They're saved between sessions.

### About your privacy

Grammar, punctuation and spelling are checked by [LanguageTool](https://languagetool.org), so your text goes to their server for those three checks. You can switch that off in Settings. Repeats, glue and pronoun checks run entirely inside Word, and that text never leaves your computer.

### Updates

You never have to reinstall. When the code on GitHub changes, Word loads the new version the next time you open the panel.
