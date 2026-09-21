# Note Quiz Engine

English: [README_EN.md](README_EN.md)

Obsidianのノートを、択一問題と記述問題の問題集に変えるプラグインです。問題の表示、採点、解説、正答率、成績履歴をMarkdownに保存します。AI連携は任意で、Claudianなどが作った問題も手書きの問題も同じ形式で使えます。

## 主な機能

- 択一問題と記述問題、複数の正答文字列
- 即時採点、解説、Score / Accuracy、再挑戦
- `quiz_source`、`quiz_created`、`Quiz Results`の保存
- Claudianなどへ渡す問題生成プロンプトと、1クリック生成
- 生成言語の選択（日本語、English、元ノートと同じ言語）

## インストール

1. [GitHub Releases](https://github.com/port22-dev/note-quiz-engine/releases/latest)から`note-quiz-engine.zip`をダウンロードします（Source codeではありません）。
2. ZIPを解凍します。
3. 中の`note-quiz-engine`フォルダをVaultの`.obsidian/plugins/`へコピーします。
4. Obsidianを再起動します。
5. 設定 → コミュニティプラグイン → Note Quiz Engineを有効にします。

ZIPには`note-quiz-engine/main.js`、`manifest.json`、`styles.css`だけが入っています。Node.jsやnpmは利用者には不要です。

## 使い方

ノートを開くと上部に**Generate quiz**と**Start quiz**が表示されます。Generate quizはAIで新しい問題ノートを作成し、Start quizは現在のノートの問題を開始します。全問回答すると問題ノートの末尾に成績が保存されます。

## AI / Claudianとの連携

Generate quizは現在のノートと設定したプロンプトをClaudianへ渡します。プラグインはLLM APIへ直接接続しません。Copilot、Codex、OpenCode、Ollamaなどを使う場合は、Generate quiz promptでプロンプトをコピーし、生成されたMarkdownをImport generated quiz from clipboardで取り込めます。

## クイズ生成言語

設定 → Note Quiz Engine → **Quiz generation language**で選びます。

- **日本語**: question、options、answers、explanationを日本語で生成します。
- **English**: すべて英語で生成します。
- **元ノートと同じ言語**: 元ノートの言語を使います。

選択した言語はLLMプロバイダーの初期言語より優先されます。コマンド、ファイル名、API名などの技術識別子は必要に応じて原文で保持されます。

## 問題フォーマット

1つのMarkdownファイルに複数の`note-quiz`ブロックを書けます。

````markdown
```note-quiz
quiz:
  type: choice
  question: "メモリ使用状況を確認するコマンドは？"
  options:
    - "df"
    - "free"
  answer: 2
  explanation: "freeはメモリとswapを表示します。"
```

```note-quiz
quiz:
  type: text
  question: "メモリ使用状況を確認するコマンドを答えてください。"
  answers:
    - "free"
    - "free -h"
  explanation: "freeコマンドで確認できます。"
```
````

既存の`quiz`ブロックもStart quizで利用できます。インライン表示を使う新しいノートでは`note-quiz`を使用してください。

## アンインストール

設定 → コミュニティプラグインでNote Quiz Engineを無効化し、Vaultの`.obsidian/plugins/note-quiz-engine`フォルダを削除します。生成済みのMarkdown問題と成績は自動では削除されません。

## 開発者向け

```sh
pnpm install
pnpm run check
pnpm run package
```

Release ZIPは`dist/note-quiz-engine.zip`に生成されます。
