# Note Quiz Engine

Turn your Obsidian notes into quizzes. Answer multiple-choice and short-answer questions, get instant feedback, and keep your score history in Markdown.

**Open a note → Generate quiz → Start quiz → Track your progress.**

Note Quiz Engine handles questions, grading, and results. Claudian handles optional AI generation. You can also use Copilot, another AI tool, or write every question yourself.

## Get started

1. Install and enable Note Quiz Engine using the instructions below.
2. Open a knowledge note and click **Generate quiz** at the top. Automatic generation requires Claudian to be enabled and configured.
3. Wait for the new quiz note to open, then click **Start quiz**.

The plugin saves each generated quiz as a new Markdown file in your **Quiz folder** (`Quizzes` by default). Your source note stays unchanged. Complete all questions to save your score and history in the quiz note.

The interface is in English. Generated questions follow the language of your source note by default.

**Want to try it without AI?** Copy [the sample note](examples/Linux-study.md) into your vault, open it, and click **Start quiz**. It includes five ready-to-use questions.

## Install

Requires Obsidian **1.8.7 or later**. Community plugin listing is not yet available; use manual installation for now. Automatic Claudian generation requires desktop Obsidian. The core quiz engine uses mobile-compatible Obsidian APIs, but runtime testing so far has been on Windows.

1. Download `main.js`, `manifest.json`, and `styles.css` from [the latest release](https://github.com/port22-dev/note-quiz-engine/releases/latest), or build them from source.
2. Place the three files in `<your-vault>/.obsidian/plugins/note-quiz-engine/`.
3. Reload Obsidian and enable **Note Quiz Engine** in **Settings → Community plugins**.

To build from source, install Node.js 20.19 or later and pnpm, then run:

```sh
pnpm install
pnpm run check
pnpm run package
```

The installable files are written to `dist/note-quiz-engine/`. You do not need to copy the source code or `node_modules` into your vault.

## What you can do

- Answer multiple-choice questions and short text questions.
- Accept several exact answer strings for a text question.
- Review the correct answer and explanation after submitting.
- Move between questions, view the final score, and try again.
- Generate and save quizzes through Claudian with one button.
- Import AI output or write quizzes directly in Markdown.
- Store score history alongside each quiz, without a separate database.

## AI generation and privacy

Clicking **Generate quiz** sends the open note's content, excluding the plugin's results section, to your configured Claudian provider. It uses Claudian's account, model, and usage limits; provider charges may apply. Note Quiz Engine does not ask for an API key or call an LLM API directly. AI generation is optional, and handwritten quizzes do not send note content to an AI provider.

Automatic generation uses a dedicated new Claudian chat. The compatibility adapter was tested with **Claudian 2.3.0**, plugin ID `realclaudian`. It relies on Claudian's internal interface, so future Claudian changes may require an adapter update. Copilot and other tools use the manual prompt workflow.

While generation runs, the toolbar shows its status and lets you cancel. Only completed, valid quiz output is saved. If Claudian needs your attention, continue in its chat. Review AI-generated answers against your notes before relying on them.

See [the AI workflow guide](docs/ai-workflow.md) for manual imports, prompt customization, and troubleshooting.

## Write your own questions

Version 0.3.1 uses the dedicated `note-quiz` block language to avoid startup conflicts with other quiz plugins. Existing `quiz` blocks remain playable using **Start quiz** in the note toolbar. Change their opening fence to `note-quiz` to show inline quiz cards.

Add one `note-quiz` code block per question. A note can contain as many questions as you need, alongside ordinary Markdown.

````markdown
```note-quiz
quiz:
  type: choice
  question: "Which command shows memory usage?"
  options:
    - "df"
    - "free"
  answer: 2
  explanation: "free shows physical memory and swap usage."
```

```note-quiz
quiz:
  type: text
  question: "Name a command that shows memory usage."
  answers:
    - "free"
    - "free -h"
    - "free -m"
  explanation: "These forms of free show memory and swap usage."
```
````

`answer` is a **1-based** option number. Text answers use exact matching after trimming surrounding whitespace and normalizing line endings. Add each accepted spelling to `answers`; there is no AI grading or automatic synonym matching.

See [Markdown Quiz Format](docs/quiz-format.md) for all fields and examples.

## Settings

| Setting | Default | Purpose |
|---|---|---|
| Quiz folder | `Quizzes` | Where generated and imported quiz notes are saved |
| Case-sensitive answers | On | Turn off to accept both `FREE` and `free` |
| Question count | 10 | Target number of questions to request, from 1 to 100 |
| Prompt template | Built-in template | Customize topics, difficulty, and question style |

Upgrading from an earlier version preserves the previous quiz folder. Grading settings apply when you start a new quiz. **Try again** repeats the same questions; click **Generate quiz** on the source note to request a new set.

## Commands

You can use the toolbar for the main workflow. These commands are also available in the command palette under **Note Quiz Engine**:

| Command | Action |
|---|---|
| Generate quiz | Generate with Claudian, validate, save, and open a new quiz note |
| Start quiz | Start the questions in the current Markdown note |
| Generate quiz prompt | Preview and copy a prompt for Claudian, Copilot, or another AI tool |
| Import generated quiz from clipboard | Validate copied quiz output and save it in your quiz folder |
| Insert quiz template | Insert examples for writing questions by hand |

## Results stay in your notes

After the last answer, the plugin saves the score, accuracy, attempt time, and history in the quiz note. For example, eight correct answers out of ten gives **8 / 10 · 80%**.

Results use a managed section between `<!-- QUIZ_RESULTS_START -->` and `<!-- QUIZ_RESULTS_END -->`. Subsequent attempts update only that section. Keep your own text outside these markers and leave the generated result metadata intact.

If the questions change during an attempt, or the result section is damaged, saving stops and displays an error. Fix the issue and use the save retry button. An incomplete attempt is not saved or resumed.

## Development

```sh
pnpm run dev      # Watch and rebuild
pnpm run check    # TypeScript build, lint, and tests
pnpm run package  # Create the installable plugin folder
```

The parser, quiz session, grading, result storage, prompt builder, UI, and Claudian adapter are separate modules. The engine works without an AI plugin; new generation providers can implement the `QuizGenerator` interface.

See [the test guide](docs/testing.md) for coverage and manual checks. Multiple selection, shuffling, spaced repetition, AI answer grading, and a vault-wide dashboard are not implemented yet.

Report bugs or request features in [GitHub issues](https://github.com/port22-dev/note-quiz-engine/issues). Released under the [MIT license](LICENSE).
