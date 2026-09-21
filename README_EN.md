# Note Quiz Engine

日本語: [README.md](README.md)

Note Quiz Engine turns Obsidian notes into quizzes. It displays multiple-choice and text questions, grades answers, shows explanations, and stores scores and attempt history in Markdown. AI is optional: AI-generated and handwritten questions use the same format.

## Features

- Multiple-choice and text questions with several accepted answers
- Instant grading, explanations, Score / Accuracy, and retry
- Markdown metadata for `quiz_source`, `quiz_created`, and `Quiz Results`
- Prompt generation and one-click generation through Claudian
- Selectable generation language: Japanese, English, or source note language

## Install

1. Download `note-quiz-engine.zip` from [GitHub Releases](https://github.com/port22-dev/note-quiz-engine/releases/latest) (do not download Source code).
2. Extract the ZIP.
3. Copy the `note-quiz-engine` folder into your vault's `.obsidian/plugins/` folder.
4. Restart Obsidian.
5. Open Settings → Community plugins and enable Note Quiz Engine.

The ZIP contains only `note-quiz-engine/main.js`, `manifest.json`, and `styles.css`. Users do not need Node.js, npm, or a build environment.

## Use it

Open a note and click **Generate quiz** or **Start quiz** at the top. Generate quiz asks Claudian for a new quiz note. Start quiz opens the questions in the current note. After the last answer, the score and attempt history are saved at the bottom of the quiz note.

## AI / Claudian

Generate quiz sends the current note and the configured prompt to Claudian. Note Quiz Engine does not connect directly to an LLM API. With Copilot, Codex, OpenCode, Ollama, or another tool, use Generate quiz prompt, paste it into the tool, then use Import generated quiz from clipboard to validate and save the Markdown output.

## Quiz generation language

Choose **Quiz generation language** in Settings → Note Quiz Engine:

- **Japanese**: question, options, answers, and explanation are written in Japanese.
- **English**: all generated quiz text is written in English.
- **Same as source note**: use the source note's language.

The selected language is included directly in the prompt and takes priority over the provider's default language. Commands, file names, API names, and other technical identifiers can remain in their original form.

## Quiz format

Use one `note-quiz` block for each question. A Markdown file can contain any number of blocks.

````markdown
```note-quiz
quiz:
  type: choice
  question: "Which command shows memory usage?"
  options:
    - "df"
    - "free"
  answer: 2
  explanation: "free shows memory and swap usage."
```

```note-quiz
quiz:
  type: text
  question: "Name a command that shows memory usage."
  answers:
    - "free"
    - "free -h"
  explanation: "The free command shows memory usage."
```
````

Existing `quiz` blocks remain playable with Start quiz. Use `note-quiz` for inline cards in new notes.

## Uninstall

Disable Note Quiz Engine in Settings → Community plugins, then delete `.obsidian/plugins/note-quiz-engine` from the vault. Generated quiz notes and result history are not deleted automatically.

## Development

```sh
pnpm install
pnpm run check
pnpm run package
```

The release ZIP is written to `dist/note-quiz-engine.zip`.
