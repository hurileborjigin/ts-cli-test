#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { AzureOpenAI } from "openai";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline/promises";
import * as readlineCore from "readline";
import { stdin as input, stdout as output } from "process";

type ChatRole = "system" | "user" | "assistant";
type ChatMessage = {
  role: ChatRole;
  content: string;
};

type SavedConversation = {
  version: 1;
  format: "thinker-chat";
  createdAt: string;
  messages: ChatMessage[];
};

const program = new Command();

const answersDir = path.join(process.cwd(), "answers");
fs.mkdirSync(answersDir, { recursive: true });

function createClient() {
  return new AzureOpenAI({
    endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
    apiKey: process.env.AZURE_OPENAI_API_KEY!,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION!,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
  });
}

function listChatFiles(): string[] {
  return fs
    .readdirSync(answersDir)
    .filter((file) => file.endsWith("-chat.json") || file.endsWith("-chat.md"))
    .sort((a, b) => {
      const aPath = path.join(answersDir, a);
      const bPath = path.join(answersDir, b);
      return fs.statSync(bPath).mtimeMs - fs.statSync(aPath).mtimeMs;
    });
}

function listConversationFilesForClear(): string[] {
  return fs
    .readdirSync(answersDir)
    .filter((file) => file.endsWith(".json") || file.endsWith(".md"))
    .sort((a, b) => {
      const aPath = path.join(answersDir, a);
      const bPath = path.join(answersDir, b);
      return fs.statSync(bPath).mtimeMs - fs.statSync(aPath).mtimeMs;
    });
}

function parseJsonChatFile(filepath: string): ChatMessage[] {
  const raw = fs.readFileSync(filepath, "utf-8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== "object") {
    return [];
  }

  const data = parsed as Partial<SavedConversation>;
  if (!Array.isArray(data.messages)) {
    return [];
  }

  const messages: ChatMessage[] = [];
  for (const message of data.messages) {
    if (
      message &&
      typeof message === "object" &&
      "role" in message &&
      "content" in message &&
      (message.role === "system" ||
        message.role === "user" ||
        message.role === "assistant") &&
      typeof message.content === "string"
    ) {
      messages.push({
        role: message.role,
        content: message.content,
      });
    }
  }

  return messages;
}

function parseMarkdownChatFile(filepath: string): ChatMessage[] {
  const raw = fs.readFileSync(filepath, "utf-8");

  const lines = raw.split("\n");
  const messages: ChatMessage[] = [];

  let currentRole: "user" | "assistant" | null = null;
  let buffer: string[] = [];

  function flushBuffer() {
    if (!currentRole) return;
    const content = buffer.join("\n").trim();
    if (content) {
      messages.push({
        role: currentRole,
        content,
      });
    }
    buffer = [];
  }

  for (const line of lines) {
    if (line.trim() === "## You") {
      flushBuffer();
      currentRole = "user";
      continue;
    }

    if (line.trim() === "## Assistant") {
      flushBuffer();
      currentRole = "assistant";
      continue;
    }

    if (currentRole) {
      buffer.push(line);
    }
  }

  flushBuffer();
  return messages;
}

function parseConversationFile(filepath: string): ChatMessage[] {
  if (filepath.endsWith(".json")) {
    return parseJsonChatFile(filepath);
  }
  return parseMarkdownChatFile(filepath);
}

function formatDateForList(filepath: string): string {
  const stats = fs.statSync(filepath);
  return new Date(stats.mtimeMs).toLocaleString();
}

async function pickFileInteractively(files: string[]): Promise<string | null> {
  if (!input.isTTY || !output.isTTY) {
    return null;
  }

  let selectedIndex = 0;
  const maxVisibleItems = 12;
  const wasRawMode = input.isRaw;

  return new Promise((resolve) => {
    const render = () => {
      readlineCore.cursorTo(output, 0, 0);
      readlineCore.clearScreenDown(output);
      output.write("Select a chat history to resume:\n\n");

      const windowStart = Math.max(
        0,
        Math.min(
          selectedIndex - Math.floor(maxVisibleItems / 2),
          Math.max(0, files.length - maxVisibleItems)
        )
      );
      const windowEnd = Math.min(files.length, windowStart + maxVisibleItems);

      for (let i = windowStart; i < windowEnd; i++) {
        const file = files[i];
        if (!file) {
          continue;
        }
        const prefix = i === selectedIndex ? ">" : " ";
        const filepath = path.join(answersDir, file);
        const updatedAt = formatDateForList(filepath);
        output.write(`${prefix} ${i + 1}. ${file} (${updatedAt})\n`);
      }

      output.write("\nUse Up/Down to move, Enter to select, Esc/q to cancel.\n");
    };

    const cleanup = () => {
      input.off("keypress", onKeypress);
      if (input.isTTY) {
        input.setRawMode(Boolean(wasRawMode));
      }
      if (!wasRawMode) {
        input.pause();
      }
      output.write("\n");
    };

    const onKeypress = (_: string, key: readlineCore.Key) => {
      if (key.name === "up") {
        selectedIndex = (selectedIndex - 1 + files.length) % files.length;
        render();
        return;
      }

      if (key.name === "down") {
        selectedIndex = (selectedIndex + 1) % files.length;
        render();
        return;
      }

      if (key.name === "return") {
        const selected = files[selectedIndex] ?? null;
        cleanup();
        resolve(selected);
        return;
      }

      if (key.name === "escape" || key.name === "q") {
        cleanup();
        resolve(null);
        return;
      }

      if (key.ctrl && key.name === "c") {
        cleanup();
        resolve(null);
      }
    };

    readlineCore.emitKeypressEvents(input);
    if (input.isTTY) {
      input.setRawMode(true);
    }
    input.on("keypress", onKeypress);
    render();
  });
}

async function pickFilesForDeletionInteractively(
  files: string[]
): Promise<string[] | null> {
  if (!input.isTTY || !output.isTTY) {
    return null;
  }

  let cursor = 0;
  const selected = new Set<number>();
  const maxVisibleItems = 14;
  const wasRawMode = input.isRaw;

  return new Promise((resolve) => {
    const render = () => {
      readlineCore.cursorTo(output, 0, 0);
      readlineCore.clearScreenDown(output);
      output.write("Select histories to delete:\n\n");

      const windowStart = Math.max(
        0,
        Math.min(
          cursor - Math.floor(maxVisibleItems / 2),
          Math.max(0, files.length - maxVisibleItems)
        )
      );
      const windowEnd = Math.min(files.length, windowStart + maxVisibleItems);

      for (let i = windowStart; i < windowEnd; i++) {
        const file = files[i];
        if (!file) {
          continue;
        }
        const pointer = i === cursor ? ">" : " ";
        const checkbox = selected.has(i) ? "[x]" : "[ ]";
        const filepath = path.join(answersDir, file);
        const updatedAt = formatDateForList(filepath);
        output.write(`${pointer} ${checkbox} ${i + 1}. ${file} (${updatedAt})\n`);
      }

      output.write(
        "\nUse Up/Down to move, Space to toggle, Enter to delete selected, Esc/q to cancel.\n"
      );
    };

    const cleanup = () => {
      input.off("keypress", onKeypress);
      if (input.isTTY) {
        input.setRawMode(Boolean(wasRawMode));
      }
      if (!wasRawMode) {
        input.pause();
      }
      output.write("\n");
    };

    const onKeypress = (_: string, key: readlineCore.Key) => {
      if (key.name === "up") {
        cursor = (cursor - 1 + files.length) % files.length;
        render();
        return;
      }

      if (key.name === "down") {
        cursor = (cursor + 1) % files.length;
        render();
        return;
      }

      if (key.name === "space") {
        if (selected.has(cursor)) {
          selected.delete(cursor);
        } else {
          selected.add(cursor);
        }
        render();
        return;
      }

      if (key.name === "return") {
        const result = [...selected]
          .sort((a, b) => a - b)
          .map((index) => files[index])
          .filter((file): file is string => Boolean(file));
        cleanup();
        resolve(result);
        return;
      }

      if (key.name === "escape" || key.name === "q") {
        cleanup();
        resolve(null);
        return;
      }

      if (key.ctrl && key.name === "c") {
        cleanup();
        resolve(null);
      }
    };

    readlineCore.emitKeypressEvents(input);
    if (input.isTTY) {
      input.setRawMode(true);
    }
    input.on("keypress", onKeypress);
    render();
  });
}

async function handleResumeCommand(
  rl: readline.Interface,
  messages: ChatMessage[]
): Promise<void> {
  const files = listChatFiles();

  if (files.length === 0) {
    console.log("\nNo saved chat histories found.\n");
    return;
  }

  let selectedFile = await pickFileInteractively(files);
  if (!selectedFile) {
    console.log("\nAvailable chat histories:");
    files.forEach((file, index) => {
      console.log(`${index + 1}. ${file}`);
    });

    const choice = (
      await rl.question('\nEnter the number to resume, or press Enter to cancel: ')
    ).trim();

    if (!choice) {
      console.log("\nResume cancelled.\n");
      return;
    }

    const selectedIndex = Number(choice);
    if (
      Number.isNaN(selectedIndex) ||
      selectedIndex < 1 ||
      selectedIndex > files.length
    ) {
      console.log("\nInvalid selection.\n");
      return;
    }

    selectedFile = files[selectedIndex - 1] ?? null;
  }

  if (!selectedFile) {
    console.log("\nInvalid selection.\n");
    return;
  }

  const filepath = path.join(answersDir, selectedFile);

  const resumedMessages = parseConversationFile(filepath).filter(
    (message) => message.role === "user" || message.role === "assistant"
  );

  if (resumedMessages.length === 0) {
    console.log("\nSelected chat file was empty or could not be parsed.\n");
    return;
  }

  messages.push(...resumedMessages);

  console.log(`\nResumed ${selectedFile} into the current chat.\n`);
}

program
  .name("thinker")
  .description("A tiny interactive CLI assistant")
  .version("0.0.3");

program
  .command("clear")
  .description("Delete selected saved conversation files")
  .action(async () => {
    const files = listConversationFilesForClear();

    if (files.length === 0) {
      console.log("\nNo saved conversation files found in answers/.\n");
      return;
    }

    let selectedFiles = await pickFilesForDeletionInteractively(files);

    if (selectedFiles === null) {
      const rl = readline.createInterface({ input, output });
      try {
        console.log("\nAvailable conversation files:");
        files.forEach((file, index) => {
          console.log(`${index + 1}. ${file}`);
        });
        const rawChoice = (
          await rl.question(
            "\nEnter numbers to delete (comma-separated), or press Enter to cancel: "
          )
        ).trim();

        if (!rawChoice) {
          console.log("\nClear cancelled.\n");
          return;
        }

        const indexes = rawChoice
          .split(",")
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isInteger(value));

        selectedFiles = [
          ...new Set(
            indexes
              .filter((value) => value >= 1 && value <= files.length)
              .map((value) => files[value - 1])
              .filter((file): file is string => Boolean(file))
          ),
        ];
      } finally {
        rl.close();
      }
    }

    if (!selectedFiles || selectedFiles.length === 0) {
      console.log("\nNo files selected. Nothing deleted.\n");
      return;
    }

    let deletedCount = 0;
    for (const file of selectedFiles) {
      const filepath = path.join(answersDir, file);
      if (fs.existsSync(filepath)) {
        fs.rmSync(filepath, { force: true });
        deletedCount++;
      }
    }

    console.log(`\nDeleted ${deletedCount} file(s) from answers/.\n`);
  });

program
  .command("chat")
  .description("Start an interactive chat session")
  .action(async () => {
    const client = createClient();
    const rl = readline.createInterface({ input, output });

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: "You are a helpful assistant. Be clear, accurate, and natural.",
      },
    ];

    console.log("\nInteractive chat started.");
    console.log('Type your message and press Enter.');
    console.log('Type "stop", "exit", or "quit" to end the session.');
    console.log('Special commands: "/resume"\n');

    try {
      while (true) {
        const userInput = (await rl.question("You: ")).trim();

        if (!userInput) {
          continue;
        }

        if (["stop", "exit", "quit"].includes(userInput.toLowerCase())) {
          console.log("\nChat ended.\n");
          break;
        }

        if (userInput === "/resume") {
          await handleResumeCommand(rl, messages);
          continue;
        }

        messages.push({ role: "user", content: userInput });

        const response = await client.chat.completions.create({
          model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
          messages,
        });

        const answer =
          response.choices[0]?.message?.content ?? "No answer received.";

        console.log(`\nAssistant: ${answer}\n`);

        messages.push({ role: "assistant", content: answer });
      }
    } finally {
      rl.close();
    }

    const filename = `${Date.now()}-chat.json`;
    const filepath = path.join(answersDir, filename);
    const conversation: SavedConversation = {
      version: 1,
      format: "thinker-chat",
      createdAt: new Date().toISOString(),
      messages,
    };
    fs.writeFileSync(filepath, JSON.stringify(conversation, null, 2), "utf-8");

    console.log(`Saved chat to answers/${filename}`);
  });

program.parse(process.argv);
