# thinker

Terminal-first AI chat CLI built with TypeScript and Azure OpenAI.

## Features

- Interactive chat session in the terminal (`thinker chat`)
- Conversation resume with keyboard navigation
- Conversation cleanup with interactive checkbox multi-select (`thinker clear`)
- Model-friendly JSON conversation storage in `answers/`
- Backward-compatible resume support for legacy Markdown chat files

## Requirements

- Node.js 18+
- An Azure OpenAI resource with at least one deployed model

## Installation

```sh
npm install
npx tsc
npm link
```

After linking, the CLI command is available as:

```sh
thinker --help
```

## Configuration

Create a `.env` file in the project root:

```dotenv
AZURE_OPENAI_ENDPOINT=https://<your-resource>.openai.azure.com
AZURE_OPENAI_API_KEY=<your-api-key>
AZURE_OPENAI_API_VERSION=2024-12-01-preview
AZURE_OPENAI_DEPLOYMENT_NAME=<your-deployment-name>
```

Notes:

- `AZURE_OPENAI_DEPLOYMENT_NAME` must match your Azure deployment name, not just a base model family name.
- Some newer models may require preview API versions.

## Usage

### Start chat

```sh
thinker chat
```

Inside chat:

- Type a message and press Enter
- Type `stop`, `exit`, or `quit` to end the session
- Type `/resume` to append a previous conversation into current context

### Resume flow (`/resume`)

- Interactive mode (TTY): use `Up/Down`, `Enter`, `Esc`/`q`
- Fallback mode (non-TTY): select by number

### Clear saved histories

```sh
thinker clear
```

- Interactive mode (TTY): use `Up/Down`, `Space` to toggle, `Enter` to delete
- Fallback mode (non-TTY): enter comma-separated indexes

## Conversation Storage

Saved under `answers/` as `*-chat.json`.

Example:

```json
{
  "version": 1,
  "format": "thinker-chat",
  "createdAt": "2026-03-11T12:34:56.789Z",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant..." },
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi! How can I help?" }
  ]
}
```

Legacy Markdown files (`*-chat.md`) are still readable via `/resume`.

## Development

```sh
npx tsc
npx tsc -w
node dist/index.js --help
```

Main entrypoint:

- `src/index.ts`

## Roadmap

- Runtime model switching command (for example `/model`)
- Better command-level help and validation
- Optional import/export utilities for conversations

## Contributing

1. Fork the repo
2. Create a feature branch
3. Make changes with focused commits
4. Open a pull request with a clear summary and test notes

## License

ISC
