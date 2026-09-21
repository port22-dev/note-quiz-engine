# Note Quiz Engine 0.3.1

Fix startup failure when another plugin has registered the `quiz` code block language.
New quiz notes use `note-quiz` blocks. Existing `quiz` notes remain playable through
the **Start quiz** toolbar button. Change their opening fence to `note-quiz` for inline cards.

Validation: build, lint, 222 tests, and bundled startup smoke test with `quiz` already registered.

Turn your notes into quizzes, practise, and keep your results in Markdown.

- A simple English interface: **Generate quiz** and **Start quiz**.
- Optional one-click generation through Claudian, with automatic validation and saving.
- Multiple-choice and exact-match text questions, explanations, scores, and attempt history.
- A configurable quiz folder, defaulting to `Quizzes` for new users.
- Questions follow the language of the source note. Existing Japanese notes remain supported.
- Existing installations keep their `過去問題集` folder.
- Handwritten questions and prompts for other AI tools work without Claudian.

Automatic generation was tested with desktop Claudian 2.3.0 (`realclaudian`)
and uses its configured provider and account. The integration uses internal
Claudian interfaces and may need updates for future versions. Provider charges
may apply. Manual quizzes and scoring work locally without an AI account.

Download `note-quiz-engine.zip`, extract it, and place the `note-quiz-engine`
folder in your vault's `.obsidian/plugins/` directory. Reload Obsidian, then
enable **Note Quiz Engine** in Community plugins.
