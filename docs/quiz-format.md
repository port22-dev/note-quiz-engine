# Markdown Quiz Format

Use one `quiz` code block per question. Multiple blocks can share a note with ordinary Markdown. AI-generated and handwritten questions use the same format.

Each block contains YAML with one root key: `quiz:`. Use spaces for indentation and quote text values, especially values containing colons, `#`, numbers, or words such as `true`.

## Multiple choice

````markdown
```quiz
quiz:
  id: "memory-check"
  type: choice
  question: "Which Linux command shows memory usage?"
  options:
    - "df"
    - "free"
    - "ls"
    - "ps"
  answer: 2
  explanation: "free shows physical memory and swap usage."
```
````

`answer` is a **1-based integer**: `2` means the second option, `free`. Provide at least two options and exactly one correct answer.

## Short answer

````markdown
```quiz
quiz:
  type: text
  question: "Name a Linux command that shows memory usage."
  answers:
    - "free"
    - "free -h"
    - "free -m"
  explanation: |
    free shows physical memory and swap usage.
    These listed options are also accepted.
```
````

`answers` contains one or more accepted strings. Before comparison, the engine trims whitespace from both ends and normalizes CRLF and CR line endings to LF. Matching is then exact. **Case-sensitive answers** can be turned off in settings.

Internal whitespace is preserved: `free  -h` with two spaces does not match `free -h`. There is no semantic, partial, or automatic synonym matching. List each accepted alternative explicitly. Quote numeric or boolean-looking answers as strings, for example `"42"` and `"true"`.

Ask for short, unambiguous terms or commands. Use multiple choice when the learner needs to explain a cause, compare approaches, or reason through a scenario.

## Fields

| Field | Required | Meaning |
|---|---|---|
| `type` | Yes | `choice` or `text` |
| `question` | Yes | Nonempty question string |
| `explanation` | Yes | Nonempty explanation string; use `|` for multiple lines |
| `options` | For `choice` | Array of at least two option strings |
| `answer` | For `choice` | Correct option number, starting at 1 |
| `answers` | For `text` | Array of one or more accepted answer strings |
| `id` | No | Unique string within the note; generated when omitted |
| `difficulty` | No | Difficulty label |
| `tags` | No | Array of tag strings |

`difficulty` and `tags` are stored as metadata for future extensions. They do not currently filter questions or change scoring. Multiple selection, timers, shuffling, and spaced repetition are not implemented.

YAML aliases and custom tags are not supported. Invalid question definitions produce errors with line numbers and prevent the quiz from starting.

## Compatible input

The parser also accepts `yaml` and `yml` code blocks containing `quiz:`, and bare YAML beginning with `quiz:` at the start of a line. For new notes and AI output, use `quiz` fences to keep the question boundaries clear.

Unrelated Markdown and code blocks are not questions. Put one question in each code block.

## Scores and history

After every question has an answer, the engine calculates the score and accuracy and saves them in the same quiz note. The first attempt adds a managed section at the end; later attempts update that section.

```markdown
<!-- QUIZ_RESULTS_START -->
## Quiz Results
...latest score, history table, and metadata managed by the plugin...
<!-- QUIZ_RESULTS_END -->
```

This illustrates the boundary, not content to paste into a note. The plugin creates the complete section, including the internal history data it needs. Keep your text and question definitions outside the markers and do not edit the generated section by hand.

If markers or history are damaged, saving stops rather than replacing surrounding text. To start a fresh history, first preserve the old results in a separate note, then remove the entire old managed section.

If a question changes while you are answering, saving also stops. Restore the definitions used for that attempt and retry saving, or close the quiz and start a new attempt with the updated questions. Normal edits outside the question definitions and result section are preserved by the storage update.

Try the complete [Linux sample](../examples/Linux-study.md), or run **Insert quiz template** to add editable examples to a note.
