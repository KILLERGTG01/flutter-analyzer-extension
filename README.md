# Flutter Code Reviewer

Reviews `.dart` files on save using a locally-running [Ollama](https://ollama.com) model and shows results as native VS Code diagnostics.

## Requirements

- [Ollama](https://ollama.com) installed and running locally
- The `code-review-flutter` model loaded: `ollama pull code-review-flutter`

## Features

- Automatic review on save for `.dart` files
- Inline warning diagnostics with squiggly underlines
- **Copy fix prompt** — copies the full bug/fix block to clipboard for use with any AI assistant
- **View details** — shows context in a VS Code info message
- Status bar indicator: Ready / Reviewing… / issue found / Ollama not found

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `flutterCodeReviewer.ollamaUrl` | `http://localhost:11434` | Base URL for the Ollama API |
| `flutterCodeReviewer.modelName` | `code-review-flutter` | Ollama model name |

## Setup

1. Install Ollama: https://ollama.com
2. Pull the model: `ollama pull gtg07817/code-review-flutter`
3. Open a Flutter project and save any `.dart` file

## Building the model locally

```bash
ollama create code-review-flutter -f model/Modelfile.flutter
```
