import * as path from "path";
import * as url from "url";
import {
  createConfigLogSnapshot,
  parseConfig,
  resolveWorkspaceDir,
} from "./config.js";
import { ConsolidationScheduler } from "./consolidation/index.js";
import { LLMService as SharedLLMService } from "./llm/service.js";
import { FileLogger } from "./logger.js";
import { HeartbeatService, resolveHeartbeatIntervalMs } from "./heartbeat.js";
import { ReflectionMemoryManagementService } from "./memory-management/service.js";
import {
  MemoryGateAnalyzer,
} from "./memory-gate/index.js";
import { parseReflectionCommand } from "./reflection-command.js";
import { WriteGuardian } from "./write-guardian/index.js";
import {
  WriteGuardianAuditLog,
} from "./write-guardian/audit-log.js";
import {
  handleBeforeMessageWrite,
  handleMessageReceived,
} from "./message-handler.js";
import { OpenClawMessageReactionService } from "./message-reaction.js";
import { SessionBufferManager } from "./session-manager.js";
import type {
  LLMService,
  ManagedFileName,
  PluginConfig,
} from "./types.js";

type LoggerMethod = (message: string, ...args: unknown[]) => void;

export interface PluginLogger {
  debug: LoggerMethod;
  info: LoggerMethod;
  warn: LoggerMethod;
  error: LoggerMethod;
}

export interface PluginAPI {
  pluginConfig?: unknown;
  config?: {
    get?: (key: string) => unknown;
  };
  logger: PluginLogger;
  registerHook: (
    event: string,
    handler: (event: unknown, context?: unknown) => void,
    options?: { name?: string }
  ) => void;
  on?: (
    hookName: string,
    handler: (event: unknown, context?: unknown) => void,
    options?: { priority?: number }
  ) => void;
  registerCommand?: (
    command: {
      name: string;
      description: string;
      acceptsArgs?: boolean;
      handler: (args?: string | { args?: string }) => { text: string } | Promise<{ text: string }>;
    }
  ) => void;
  registerGatewayMethod?: (
    method: string,
    handler: (options: {
      params: Record<string, unknown>;
      respond: (
        ok: boolean,
        payload?: unknown,
        error?: unknown,
        meta?: Record<string, unknown>
      ) => void;
      req?: unknown;
      client?: unknown;
      context?: unknown;
      isWebchatConnect?: (params: unknown) => boolean;
    }) => void | Promise<void>
  ) => void;
  registerTool?: (tool: {
    name: string;
    label?: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (toolCallId: string, params: Record<string, unknown>) => Promise<unknown> | unknown;
  }) => void;
}

let bufferManager: SessionBufferManager | null = null;
let gatewayLogger: PluginLogger | null = null;
let fileLogger: FileLogger | null = null;
let heartbeatService: HeartbeatService | null = null;
let isRegistered = false;
const REFLECTION_COMMAND_NAME = "reflection";

function extractCommandArgs(input: string | { args?: string } | undefined): string {
  if (typeof input === "string") {
    return input;
  }

  return input?.args ?? "";
}

function formatReflectionFiles(
  files: Awaited<ReturnType<ReflectionMemoryManagementService["listFiles"]>>
): string {
  if (files.length === 0) {
    return "No managed memory files found.";
  }

  return files
    .map((file) => `${file.fileName} | ${file.health} | facts=${file.factCount}`)
    .join("\n");
}

function formatReflectionFile(
  file: Awaited<ReturnType<ReflectionMemoryManagementService["getFileView"]>>
): string {
  const factLines =
    file.facts.length === 0
      ? "No managed facts."
      : file.facts.map((fact) => `- ${fact.id}: ${fact.text}`).join("\n");

  return [
    `${file.fileName} | ${file.health} | facts=${file.factCount}`,
    `Drift: ${file.drift.isDrifted ? "yes" : "no"}`,
    factLines,
  ].join("\n");
}

function formatReflectionFact(
  factView: Awaited<ReturnType<ReflectionMemoryManagementService["getFactView"]>>
): string {
  return [
    `${factView.fact.id} | ${factView.fact.fileName} | ${factView.fact.status}`,
    factView.fact.text,
    `decision=${factView.provenance.decision}`,
    `reason=${factView.provenance.reason}`,
    `events=${factView.events.length}`,
  ].join("\n");
}

function formatReflectionProposal(
  proposal: Awaited<ReturnType<ReflectionMemoryManagementService["getProposal"]>>
): string {
  return [
    `${proposal.id} | ${proposal.action} | ${proposal.status}`,
    `fact=${proposal.factId}`,
    `file=${proposal.fileName}`,
    proposal.targetFileName ? `target=${proposal.targetFileName}` : undefined,
    proposal.proposedText ? `text=${proposal.proposedText}` : undefined,
    proposal.diff,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

async function executeReflectionIntent(
  reflectionService: ReflectionMemoryManagementService,
  args: string
): Promise<string> {
  const intent = parseReflectionCommand(args);

  if (intent.kind === "files") {
    return formatReflectionFiles(await reflectionService.listFiles());
  }

  if (intent.kind === "file") {
    return formatReflectionFile(await reflectionService.getFileView(intent.fileName));
  }

  if (intent.kind === "fact") {
    return formatReflectionFact(await reflectionService.getFactView(intent.factId));
  }

  if (intent.kind === "proposal") {
    return formatReflectionProposal(await reflectionService.getProposal(intent.proposalId));
  }

  if (intent.kind === "apply") {
    return formatReflectionProposal(await reflectionService.applyProposal(intent.proposalId));
  }

  if (intent.kind === "discard") {
    return formatReflectionProposal(await reflectionService.discardProposal(intent.proposalId));
  }

  if (intent.kind === "propose_delete") {
    return formatReflectionProposal(
      await reflectionService.createDeleteProposal(intent.factId)
    );
  }

  if (intent.kind === "propose_edit") {
    return formatReflectionProposal(
      await reflectionService.createEditProposal(intent.factId, intent.text)
    );
  }

  if (intent.kind === "propose_move") {
    return formatReflectionProposal(
      await reflectionService.createMoveProposal(intent.factId, intent.targetFileName)
    );
  }

  return formatReflectionFile(
    await reflectionService.reconcile(intent.fileName, intent.mode)
  );
}

function registerReflectionCommand(
  api: PluginAPI,
  logger: FileLogger,
  reflectionService?: ReflectionMemoryManagementService
): void {
  if (typeof api.registerCommand !== "function") {
    logger.info("PluginLifecycle", "registerCommand unavailable, skip command registration", {
      command: REFLECTION_COMMAND_NAME,
    });
    return;
  }

  api.registerCommand({
    name: REFLECTION_COMMAND_NAME,
    description: "Inspect and manage Reflection memory files and facts",
    acceptsArgs: true,
    handler: async (input) => {
      if (!reflectionService) {
        return {
          text: "Reflection memory management is unavailable: workspace is not configured.",
        };
      }

      try {
        return {
          text: await executeReflectionIntent(reflectionService, extractCommandArgs(input)),
        };
      } catch (error) {
        return {
          text: `Reflection command failed: ${getErrorMessage(error)}`,
        };
      }
    },
  });

  logger.info("PluginLifecycle", "Registered plugin command", {
    command: REFLECTION_COMMAND_NAME,
  });
}

function registerReflectionGatewayMethods(
  api: PluginAPI,
  logger: FileLogger,
  reflectionService?: ReflectionMemoryManagementService
): void {
  if (typeof api.registerGatewayMethod !== "function" || !reflectionService) {
    return;
  }

  api.registerGatewayMethod("reflection.files", async ({ respond }) => {
    respond(true, { files: await reflectionService.listFiles() });
  });
  api.registerGatewayMethod("reflection.file", async ({ params, respond }) => {
    respond(true, {
      file: await reflectionService.getFileView(params.fileName as ManagedFileName),
    });
  });
  api.registerGatewayMethod("reflection.fact", async ({ params, respond }) => {
    respond(true, { fact: await reflectionService.getFactView(String(params.factId ?? "")) });
  });
  api.registerGatewayMethod("reflection.proposal", async ({ params, respond }) => {
    respond(true, {
      proposal: await reflectionService.getProposal(String(params.proposalId ?? "")),
    });
  });
  api.registerGatewayMethod("reflection.propose.delete", async ({ params, respond }) => {
    respond(true, {
      proposal: await reflectionService.createDeleteProposal(String(params.factId ?? "")),
    });
  });
  api.registerGatewayMethod("reflection.propose.edit", async ({ params, respond }) => {
    respond(true, {
      proposal: await reflectionService.createEditProposal(
        String(params.factId ?? ""),
        String(params.text ?? "")
      ),
    });
  });
  api.registerGatewayMethod("reflection.propose.move", async ({ params, respond }) => {
    respond(true, {
      proposal: await reflectionService.createMoveProposal(
        String(params.factId ?? ""),
        params.targetFileName as ManagedFileName
      ),
    });
  });
  api.registerGatewayMethod("reflection.apply", async ({ params, respond }) => {
    respond(true, {
      proposal: await reflectionService.applyProposal(String(params.proposalId ?? "")),
    });
  });
  api.registerGatewayMethod("reflection.discard", async ({ params, respond }) => {
    respond(true, {
      proposal: await reflectionService.discardProposal(String(params.proposalId ?? "")),
    });
  });
  api.registerGatewayMethod("reflection.reconcile", async ({ params, respond }) => {
    respond(true, {
      file: await reflectionService.reconcile(
        params.fileName as ManagedFileName,
        params.mode as "overwrite" | "adopt" | "detach"
      ),
    });
  });

  logger.info("PluginLifecycle", "Registered reflection gateway methods");
}

function registerReflectionTools(
  api: PluginAPI,
  logger: FileLogger,
  reflectionService?: ReflectionMemoryManagementService
): void {
  if (typeof api.registerTool !== "function" || !reflectionService) {
    return;
  }

  const jsonResult = (payload: unknown) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    details: payload,
  });

  api.registerTool({
    name: "reflection_files",
    label: "Reflection Files",
    description: "List managed Reflection memory files and their health state.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    execute: async () => jsonResult({ files: await reflectionService.listFiles() }),
  });
  api.registerTool({
    name: "reflection_file_view",
    label: "Reflection File",
    description: "Read one managed Reflection memory file and its facts.",
    parameters: {
      type: "object",
      properties: {
        fileName: {
          type: "string",
          enum: ["MEMORY.md", "USER.md", "SOUL.md", "IDENTITY.md", "TOOLS.md"],
        },
      },
      required: ["fileName"],
      additionalProperties: false,
    },
    execute: async (_toolCallId, params) =>
      jsonResult({
        file: await reflectionService.getFileView(params.fileName as ManagedFileName),
      }),
  });
  api.registerTool({
    name: "reflection_fact_view",
    label: "Reflection Fact",
    description: "Read one managed Reflection fact with provenance and lifecycle.",
    parameters: {
      type: "object",
      properties: {
        factId: { type: "string" },
      },
      required: ["factId"],
      additionalProperties: false,
    },
    execute: async (_toolCallId, params) =>
      jsonResult({
        fact: await reflectionService.getFactView(String(params.factId ?? "")),
      }),
  });
  api.registerTool({
    name: "reflection_check_drift",
    label: "Reflection Drift",
    description: "Check whether a managed Reflection file has drifted from the store.",
    parameters: {
      type: "object",
      properties: {
        fileName: {
          type: "string",
          enum: ["MEMORY.md", "USER.md", "SOUL.md", "IDENTITY.md", "TOOLS.md"],
        },
      },
      required: ["fileName"],
      additionalProperties: false,
    },
    execute: async (_toolCallId, params) =>
      jsonResult({
        file: await reflectionService.getFileView(params.fileName as ManagedFileName),
      }),
  });
  api.registerTool({
    name: "reflection_propose",
    label: "Reflection Proposal",
    description: "Create a Reflection delete, edit, or move proposal without applying it.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["delete", "edit", "move"],
        },
        factId: { type: "string" },
        text: { type: "string" },
        targetFileName: {
          type: "string",
          enum: ["MEMORY.md", "USER.md", "SOUL.md", "IDENTITY.md", "TOOLS.md"],
        },
      },
      required: ["action", "factId"],
      additionalProperties: false,
    },
    execute: async (_toolCallId, params) => {
      const action = String(params.action ?? "");
      if (action === "delete") {
        return jsonResult({
          proposal: await reflectionService.createDeleteProposal(String(params.factId ?? "")),
        });
      }

      if (action === "edit") {
        return jsonResult({
          proposal: await reflectionService.createEditProposal(
            String(params.factId ?? ""),
            String(params.text ?? "")
          ),
        });
      }

      return jsonResult({
        proposal: await reflectionService.createMoveProposal(
          String(params.factId ?? ""),
          params.targetFileName as ManagedFileName
        ),
      });
    },
  });

  logger.info("PluginLifecycle", "Registered reflection tools");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function createLLMService(config: PluginConfig): LLMService {
  const { baseURL, apiKey, model } = config.llm;

  if (baseURL.trim() === "" || apiKey.trim() === "" || model.trim() === "") {
    throw new Error("LLM config requires non-empty llm.baseURL, llm.apiKey, and llm.model");
  }

  return new SharedLLMService({
    baseURL,
    apiKey,
    model,
  });
}

function isConfigOnlyModeEnabled(): boolean {
  const value = process.env.OPENCLAW_REFLECTION_CONFIG_ONLY;
  if (typeof value !== "string") {
    return false;
  }

  const normalizedValue = value.trim().toLowerCase();
  return (
    normalizedValue === "1" ||
    normalizedValue === "true" ||
    normalizedValue === "yes" ||
    normalizedValue === "on"
  );
}

function runHookSafely(
  logger: FileLogger,
  hookName: string,
  handler: () => void
): void {
  try {
    handler();
  } catch (error) {
    logger.error("PluginLifecycle", "Hook handler execution failed", {
      hookName,
      reason: getErrorMessage(error),
    });
  }
}

function registerMessageHook(
  api: PluginAPI,
  hookName: "message_received",
  handler: (event: unknown, context?: unknown) => unknown
): void {
  if (typeof api.on === "function") {
    api.on(hookName, handler);
    return;
  }

  api.registerHook("message:received", handler, {
    name: `reflection-${hookName}`,
  });
}

export default function activate(api: PluginAPI): void {
  if (isRegistered) {
    gatewayLogger?.warn(
      "[Reflection] register called more than once, skipping duplicate registration"
    );
    fileLogger?.warn(
      "PluginLifecycle",
      "Register called more than once, skipping duplicate registration"
    );
    return;
  }

  gatewayLogger = api.logger;

  try {
    const config: PluginConfig = parseConfig(api);
    const configSnapshot = createConfigLogSnapshot(config);
    const configOnlyMode = isConfigOnlyModeEnabled();

    const __filename = url.fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const pluginRootDir = path.resolve(__dirname, "..");

    const logger = new FileLogger(pluginRootDir, config.logLevel);
    fileLogger = logger;

    gatewayLogger.info("[Reflection] Plugin starting...");
    logger.info("PluginLifecycle", "Plugin starting");

    gatewayLogger.info(
      "[Reflection] Configuration loaded",
      configSnapshot as Record<string, unknown>
    );
    logger.info(
      "PluginLifecycle",
      "Configuration loaded",
      configSnapshot as Record<string, unknown>
    );

    gatewayLogger.info("[Reflection] File logger initialized");
    logger.info("PluginLifecycle", "File logger initialized");

    if (configOnlyMode) {
      gatewayLogger.info(
        "[Reflection] Config-only mode enabled, skipping hooks and side effects",
        configSnapshot as Record<string, unknown>
      );
      logger.info(
        "PluginLifecycle",
        "Config-only mode enabled, skipping hooks and side effects",
        configSnapshot as Record<string, unknown>
      );
      isRegistered = true;
      return;
    }

    bufferManager = new SessionBufferManager(config.bufferSize, logger);

    gatewayLogger.info("[Reflection] SessionBufferManager initialized");
    logger.info("PluginLifecycle", "SessionBufferManager initialized", {
      bufferSize: config.bufferSize,
    });

    const workspaceResolution = resolveWorkspaceDir(api);
    const workspaceDir = workspaceResolution.workspaceDir;
    const reflectionService = workspaceDir
      ? new ReflectionMemoryManagementService({ workspaceDir })
      : undefined;
    heartbeatService = new HeartbeatService({
      logger,
      workspaceDir,
      getBufferedSessions: () => bufferManager?.getSessionCount() ?? 0,
      intervalMs: resolveHeartbeatIntervalMs(),
    });

    if (workspaceDir) {
      logger.info("PluginLifecycle", "Workspace resolved", {
        workspaceDir,
        source: workspaceResolution.source,
      });
    } else {
      logger.error("PluginLifecycle", "Workspace unavailable", {
        source: workspaceResolution.source,
        reason: workspaceResolution.reason,
      });
    }

    const llmService =
      config.memoryGate.enabled || config.consolidation.enabled
        ? createLLMService(config)
        : undefined;

    let memoryGate: MemoryGateAnalyzer | undefined;
    let writeGuardian: WriteGuardian | undefined;
    let writeGuardianAuditLog: WriteGuardianAuditLog | undefined;
    const reactionService = new OpenClawMessageReactionService(logger);

    if (config.memoryGate.enabled && llmService) {
      memoryGate = new MemoryGateAnalyzer(llmService, logger);
      logger.info("PluginLifecycle", "memory_gate initialized", {
        model: config.llm.model,
      });
    } else {
      logger.info("PluginLifecycle", "memory_gate disabled");
    }

    if (llmService && workspaceDir) {
      writeGuardianAuditLog = new WriteGuardianAuditLog(workspaceDir);
      writeGuardian = new WriteGuardian(
        { workspaceDir },
        logger,
        llmService,
        writeGuardianAuditLog
      );
      logger.info("PluginLifecycle", "write_guardian initialized", {
        workspaceDir,
      });
    } else if (llmService) {
      logger.warn("PluginLifecycle", "write_guardian disabled: workspace unavailable", {
        source: workspaceResolution.source,
        reason: workspaceResolution.reason,
      });
    }

    if (config.consolidation.enabled && llmService && workspaceDir) {
      const consolidationScheduler = new ConsolidationScheduler(
        {
          workspaceDir,
          schedule: config.consolidation.schedule,
        },
        logger,
        llmService
      );

      consolidationScheduler.start();

      logger.info(
        "PluginLifecycle",
        "ConsolidationScheduler initialized and started",
        {
          schedule: config.consolidation.schedule,
        }
      );
    } else if (config.consolidation.enabled && llmService) {
      logger.warn("PluginLifecycle", "ConsolidationScheduler disabled: workspace unavailable", {
        source: workspaceResolution.source,
        reason: workspaceResolution.reason,
      });
    } else {
      logger.info("PluginLifecycle", "ConsolidationScheduler disabled");
    }

    if (typeof api.on === "function") {
      api.on("before_message_write", (event: unknown, context?: unknown) => {
        runHookSafely(logger, "before_message_write", () => {
          if (bufferManager) {
            handleBeforeMessageWrite(
              event,
              bufferManager,
              logger,
              context,
              memoryGate,
              writeGuardian,
              config.memoryGate.windowSize,
              reactionService,
              () => heartbeatService?.markBeforeMessageWrite(),
              reflectionService
            );
          } else {
            logger.warn("PluginLifecycle", "Callback skipped: buffer manager missing", {
              hook: "before_message_write",
            });
          }
        });
      });
    }

    registerMessageHook(
      api,
      "message_received",
      (event: unknown, context?: unknown) => {
        runHookSafely(logger, "message_received", () => {
          logger.writeLatestDebugPayload("message_received", event, context);

          logger.debug("PluginLifecycle", "Callback invoked", {
            hook: "message_received",
            hasContext: context !== undefined,
            hasBufferManager: Boolean(bufferManager),
          });

          if (bufferManager) {
            handleMessageReceived(
              event,
              bufferManager,
              logger,
              context,
              () => heartbeatService?.markMessageReceived()
            );
            logger.debug("PluginLifecycle", "Callback dispatched", {
              hook: "message_received",
            });
          } else {
            logger.warn("PluginLifecycle", "Callback skipped: buffer manager missing", {
              hook: "message_received",
            });
          }
        });
      }
    );

    registerReflectionCommand(api, logger, reflectionService);
    registerReflectionGatewayMethods(api, logger, reflectionService);
    registerReflectionTools(api, logger, reflectionService);
    heartbeatService.start();

    gatewayLogger.info("[Reflection] Message hooks registered");
    logger.info("PluginLifecycle", "Message hooks registered");

    isRegistered = true;
    gatewayLogger.info(
      "[Reflection] Plugin registered successfully, all hooks active"
    );
    logger.info(
      "PluginLifecycle",
      "Plugin registered successfully, all hooks active"
    );
  } catch (error) {
    const reason = getErrorMessage(error);
    gatewayLogger.error("[Reflection] Plugin activation failed", { reason });
    fileLogger?.error("PluginLifecycle", "Plugin activation failed", { reason });
    throw error;
  }
}
