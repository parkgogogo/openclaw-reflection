import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Logger, MessageReactionInput, MessageReactionService } from "./types.js";

const execFileAsync = promisify(execFile);

type CommandRunner = (command: string, args: string[]) => Promise<void>;

async function defaultCommandRunner(command: string, args: string[]): Promise<void> {
  await execFileAsync(command, args);
}

function getNonEmptyString(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export class OpenClawMessageReactionService implements MessageReactionService {
  private readonly logger: Logger;
  private readonly commandRunner: CommandRunner;

  constructor(
    logger: Logger,
    commandRunner: CommandRunner = defaultCommandRunner
  ) {
    this.logger = logger;
    this.commandRunner = commandRunner;
  }

  async reactToMessage(input: MessageReactionInput): Promise<boolean> {
    const channelId = getNonEmptyString(input.channelId);
    const accountId = getNonEmptyString(input.accountId);
    const target = getNonEmptyString(input.target);
    const messageId = getNonEmptyString(input.messageId);
    const emoji = getNonEmptyString(input.emoji);

    if (!channelId || !target || !messageId || !emoji) {
      this.logger.warn("MessageReaction", "Skipped reaction with incomplete target", {
        channelId,
        accountId,
        target,
        messageId,
        emoji,
      });
      return false;
    }

    const args = [
      "message",
      "react",
      "--channel",
      channelId,
      ...(accountId ? ["--account", accountId] : []),
      "--target",
      target,
      "--message-id",
      messageId,
      "--emoji",
      emoji,
    ];

    try {
      await this.commandRunner("openclaw", args);
      this.logger.info("MessageReaction", "Applied reaction to message", {
        channelId,
        accountId,
        target,
        messageId,
        emoji,
      });
      return true;
    } catch (error) {
      this.logger.warn("MessageReaction", "Failed to apply reaction to message", {
        channelId,
        accountId,
        target,
        messageId,
        emoji,
        reason: getErrorMessage(error),
      });
      return false;
    }
  }
}
