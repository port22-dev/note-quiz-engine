# Testing

Automated tests use mocks for the required Obsidian APIs. Desktop integration needs a separate manual check in Obsidian.

For version 0.3.0, the production build, ESLint, and 221 automated tests passed on 2026-09-21. These include configurable folders, safe path validation, legacy folder migration, and multilingual content with English controls.

## Automated checks

```sh
pnpm install
pnpm run check
pnpm run package
```

`check` runs TypeScript validation, the production build, ESLint, and Vitest. Tests cover parsing, grading, sessions, result preservation, save retries, prompt construction, settings, imports, generation, the Claudian adapter, source resolution, and UI interactions.

Confirm the packaged folder contains `main.js`, `manifest.json`, and `styles.css`. Use a test vault for the manual checks below.

## Basic learning loop

- [ ] Install the packaged plugin and enable it in Obsidian.
- [ ] Copy `examples/Linux-study.md` into the test vault.
- [ ] Open the note and verify that the toolbar appears, including after restarting with background tabs that have not loaded yet.
- [ ] Verify that reading view displays question cards.
- [ ] Click **Start quiz** and check that it opens Question 1 / 5.
- [ ] Submit without selecting or entering an answer and check the validation message.
- [ ] Answer the five questions with: option 2, `free -h`, option 3, `ps`, option 2.
- [ ] Verify feedback and explanations after each answer.
- [ ] Move backward and forward; verify that drafts persist and graded answers cannot be changed within the attempt.
- [ ] Complete the quiz and check for 5 / 5, 100%, and a successful save message.
- [ ] Check that exactly one managed result section exists and the source text and question definitions are unchanged.
- [ ] Try again with one incorrect answer and verify that 4 / 5, 80% is added to history.

## Settings and incomplete attempts

- [ ] With case sensitivity enabled, start a new attempt and verify that `FREE` is incorrect.
- [ ] Disable case sensitivity, start a new attempt, and verify that ` FREE ` is correct.
- [ ] Verify that `free  -h` with two internal spaces does not match `free -h`.
- [ ] Close an incomplete quiz. Check that no score is saved and reopening starts a new attempt.
- [ ] Verify that **Insert quiz template** adds both question types at the editor selection.
- [ ] Change the quiz folder and verify that new generated and imported notes use it.
- [ ] Load settings from an earlier version and verify that the previous folder is retained.

## Result storage recovery

- [ ] Change a question definition while an attempt is open; finish the attempt and verify that saving stops.
- [ ] Restore the original definitions and retry saving.
- [ ] Retry the same attempt and verify that history is not duplicated.
- [ ] Edit ordinary note text outside the managed section and verify that saving preserves it.
- [ ] Damage markers or history metadata in a disposable copy and verify that saving reports an error without overwriting text.

## Automatic Claudian generation

- [ ] Enable and configure a compatible Claudian installation.
- [ ] Open a source note and click **Generate quiz** once.
- [ ] Verify that a dedicated new chat receives the source content and that existing chats remain intact.
- [ ] Verify that progress appears and repeated clicks do not start duplicate requests.
- [ ] Switch notes while generation runs; verify that the original source remains associated with the result.
- [ ] Verify that completed, valid output creates a new note in the configured quiz folder and opens it.
- [ ] Start the saved quiz from both the toolbar and a question card.
- [ ] Verify that cancellation, provider errors, and unfinished output do not create a partial quiz.
- [ ] Check an English and a non-English source note; verify the requested question language follows the source.
- [ ] Disable Claudian and verify that the error explains the requirement and the manual prompt workflow still works.

The automatic adapter was previously checked on Windows with Obsidian 1.13.7 and Claudian 2.3.0: a source note produced ten questions, the new quiz was saved and opened, and both start buttons opened the quiz. This is a compatibility baseline, not evidence that every later build or provider has passed desktop testing.

## Manual AI workflow

- [ ] Open a knowledge note and run **Generate quiz prompt**.
- [ ] Verify that the preview includes the source content and required output format.
- [ ] Verify copying, including manual text selection when clipboard access fails.
- [ ] Remove `{{noteContent}}` from a custom template and verify that the source is still included once.
- [ ] Repeat `{{noteContent}}` and verify that source content is not duplicated.
- [ ] Verify that managed quiz results are excluded from the source sent to AI.
- [ ] Generate questions with an AI tool, copy its complete response, and import it from the clipboard.
- [ ] Verify that valid wrapped output imports and malformed output produces an actionable error without saving a partial file.
- [ ] Generate a second prompt and verify that its generation ID changes. Unique question wording is not guaranteed.
