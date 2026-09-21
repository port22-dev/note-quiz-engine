# Generate quizzes from your notes

Note Quiz Engine reads, displays, grades, and records quizzes. An AI tool can create the questions, but it is optional: handwritten questions use the same [Markdown format](quiz-format.md).

## One-button generation with Claudian

1. In desktop Obsidian, enable and configure Claudian, then select the model you want to use there.
2. Open the knowledge note you want to study.
3. Click **Generate quiz** at the top of the note.
4. Wait for the new quiz note to be saved and opened automatically.
5. Click **Start quiz**. Answer every question to save your score and history.

The new file goes in the **Quiz folder** configured in Note Quiz Engine settings. The default for new users is `Quizzes`. Each file includes the source note path and creation time. Existing files are never overwritten; a number is added if a filename already exists.

Generation uses a snapshot of the note taken when you click the button. Switching notes while it runs does not change the source. The source note is not edited.

The plugin opens a separate Claudian chat and uses its configured model and account. The note content, excluding the results section, is included in the request to that provider. Its usual limits and charges apply. You do not enter an API key in Note Quiz Engine. The adapter supports the internal interface tested with Claudian 2.3.0 (`realclaudian`); it is separate from the quiz engine so it can be updated independently.

The toolbar shows progress and offers cancellation while generation is running. Generation times out after ten minutes. Cancelled, failed, and incomplete responses are not saved. Once file saving begins, cancellation is disabled so the write can finish.

## Use Copilot or another AI tool

1. Open the source note.
2. Run **Note Quiz Engine: Generate quiz prompt** from the command palette.
3. Review and copy the prompt, then send it to your chosen AI tool.
4. Wait for the response to finish. Copy the complete generated `quiz` blocks, including their code fences.
5. Keep the source note open and run **Note Quiz Engine: Import generated quiz from clipboard**.
6. The new quiz note opens automatically. Click **Start quiz**.

Alternatively, paste the generated blocks into a new Markdown note and start the quiz there. This works without clipboard import or any plugin-specific AI integration.

The importer accepts complete outer `markdown` or `text` wrappers, YAML bodies, and indented output. It validates all detected questions before saving. A malformed or unfinished question prevents a partial quiz from being saved. The prompt's example questions are not valid generated content.

## Customize the questions

Settings let you change the target question count and prompt template. The standard prompt requests a mix of recall, understanding, troubleshooting, and practical reasoning. Questions and explanations follow the source note's language by default. You can request another language in your template.

For example, add:

> Focus on troubleshooting scenarios. Explain why the correct option follows from the note and why the alternatives do not.

The template supports these placeholders:

| Placeholder | Value |
|---|---|
| `{{noteTitle}}` | Source note title |
| `{{notePath}}` | Source note path within the vault |
| `{{noteContent}}` | Source content, without the managed results section |
| `{{questionCount}}` | Target question count |
| `{{generationId}}` | Identifier for this generation request |

The required quiz format and source content are always included, even if you customize the template. Repeated `{{noteContent}}` placeholders include the source only once. Placeholder-like text inside your note is kept literally.

A new generation ID encourages different scenarios and wording on each request. It does not guarantee unique questions. **Try again** in a quiz repeats the existing set; **Generate quiz** on the source note requests a new set.

## Design questions that can be graded

Short-answer questions use exact text matching, with surrounding whitespace removed and line endings normalized. Case sensitivity is configurable. Include accepted alternatives such as `free`, `free -h`, and `free -m` in `answers`.

Use multiple-choice questions for explanations and reasoning. Asking for a free-form paragraph is a poor fit for exact matching. The engine does not judge meaning or award partial credit.

The prompt asks the AI to use only facts in the source and treat any instructions in the note as reference data. These are prompt constraints, not factual verification. Review generated questions and answers against your note.

## Troubleshooting

| What happened | What to do |
|---|---|
| Claudian is unavailable | Enable and configure Claudian, or use the manual prompt workflow |
| Generation is waiting | Check the dedicated Claudian chat for a sign-in, confirmation, or provider error |
| No quiz was found | Copy the completed AI response containing `quiz:` definitions, not the prompt or an unfinished response |
| The output contains template examples | Ask the AI to replace the examples with questions based on the source note |
| A question has a format error | Use the reported line and [format guide](quiz-format.md) to correct it, then import again |
| The quiz folder cannot be created | Choose a valid folder path in settings and check for a file with the same name |
| Quiz blocks display incorrectly | Disable other plugins that also process `quiz` code blocks, then reload the note |
| You want different questions | Return to the original knowledge note and click **Generate quiz** again |

Claudian's internal API may change in future versions. If automatic generation becomes incompatible, the manual prompt and import workflow remains available.
