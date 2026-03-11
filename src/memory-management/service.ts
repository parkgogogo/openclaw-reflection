import path from "node:path";
import { ulid } from "ulid";

import type {
  FactProvenanceSummary,
  ManagedFactId,
  ManagedFileHealth,
  ManagedFileName,
  ProposalDetail,
  ReflectionProposalId,
} from "../types.js";
import { readFile, writeFileWithLock } from "../utils/file-utils.js";
import {
  detectManagedRegionDrift,
  parseManagedRegion,
  renderManagedRegion,
} from "./managed-region.js";
import {
  LocalMemoryManagementStore,
  type StoredFactEventRecord,
  type StoredFactRecord,
} from "./store.js";

type ReconcileMode = "overwrite" | "adopt" | "detach";

export interface ManagedFileSummary {
  fileName: ManagedFileName;
  health: ManagedFileHealth;
  factCount: number;
}

export interface ManagedFileView extends ManagedFileSummary {
  facts: StoredFactRecord[];
  renderedManagedBody: string;
  drift: {
    isDrifted: boolean;
    actualContent: string;
    expectedContent: string;
  };
}

export interface ManagedFactView {
  fact: StoredFactRecord;
  provenance: FactProvenanceSummary;
  events: StoredFactEventRecord[];
}

interface ReflectionMemoryManagementServiceConfig {
  workspaceDir: string;
  store?: LocalMemoryManagementStore;
}

interface RecordManagedWriteInput {
  fileName: ManagedFileName;
  text: string;
  provenance: FactProvenanceSummary;
}

const MANAGED_FILE_NAMES: ManagedFileName[] = [
  "MEMORY.md",
  "USER.md",
  "SOUL.md",
  "IDENTITY.md",
  "TOOLS.md",
];

const DEFAULT_HEADERS: Record<ManagedFileName, string> = {
  "MEMORY.md": "# MEMORY\n",
  "USER.md": "# USER\n",
  "SOUL.md": "# SOUL\n",
  "IDENTITY.md": "# IDENTITY\n",
  "TOOLS.md": "# TOOLS\n",
};

function normalizeFactText(text: string): string {
  return text.trim().replace(/^\-\s*/, "");
}

function renderFactList(facts: StoredFactRecord[]): string {
  return facts.map((fact) => `- ${normalizeFactText(fact.text)}`).join("\n");
}

function getDiff(before: string, after: string): string {
  return [
    "--- before",
    before === "" ? "(empty)" : before,
    "+++ after",
    after === "" ? "(empty)" : after,
  ].join("\n");
}

function getDecisionForFile(fileName: ManagedFileName): FactProvenanceSummary["decision"] {
  switch (fileName) {
    case "MEMORY.md":
      return "UPDATE_MEMORY";
    case "USER.md":
      return "UPDATE_USER";
    case "SOUL.md":
      return "UPDATE_SOUL";
    case "IDENTITY.md":
      return "UPDATE_IDENTITY";
    case "TOOLS.md":
      return "UPDATE_TOOLS";
  }
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function extractFactTexts(managedBody: string): string[] {
  return uniqueStrings(
    managedBody
      .split("\n")
      .map((line) => normalizeFactText(line))
      .filter((line) => line.length > 0)
  );
}

export class ReflectionMemoryManagementService {
  private readonly workspaceDir: string;
  private readonly store: LocalMemoryManagementStore;

  constructor(config: ReflectionMemoryManagementServiceConfig) {
    this.workspaceDir = config.workspaceDir;
    this.store =
      config.store ??
      new LocalMemoryManagementStore({
        workspaceDir: config.workspaceDir,
      });
  }

  async listFiles(): Promise<ManagedFileSummary[]> {
    const pendingProposals = await this.store.listProposals();
    const summaries: ManagedFileSummary[] = [];

    for (const fileName of MANAGED_FILE_NAMES) {
      const fileView = await this.getFileView(fileName);
      const hasPendingProposal = pendingProposals.some(
        (proposal) =>
          proposal.status === "pending" &&
          (proposal.fileName === fileName || proposal.targetFileName === fileName)
      );

      summaries.push({
        fileName,
        health: fileView.drift.isDrifted
          ? "drifted"
          : hasPendingProposal
            ? "has_pending_proposal"
            : "healthy",
        factCount: fileView.facts.length,
      });
    }

    return summaries;
  }

  async getFileView(fileName: ManagedFileName): Promise<ManagedFileView> {
    const [content, facts, pendingProposals] = await Promise.all([
      this.readManagedFile(fileName),
      this.store.listFacts(fileName),
      this.store.listProposals(),
    ]);
    const expectedManagedBody = renderFactList(facts);
    const drift = detectManagedRegionDrift(content, expectedManagedBody);
    const hasPendingProposal = pendingProposals.some(
      (proposal) =>
        proposal.status === "pending" &&
        (proposal.fileName === fileName || proposal.targetFileName === fileName)
    );

    return {
      fileName,
      facts,
      renderedManagedBody: expectedManagedBody,
      health: drift.isDrifted
        ? "drifted"
        : hasPendingProposal
          ? "has_pending_proposal"
          : "healthy",
      factCount: facts.length,
      drift,
    };
  }

  async getFactView(factId: ManagedFactId): Promise<ManagedFactView> {
    const fact = await this.store.getFact(factId);
    if (!fact) {
      throw new Error(`Unknown fact: ${factId}`);
    }

    return {
      fact,
      provenance: fact.provenance,
      events: await this.store.listFactEvents(factId),
    };
  }

  async recordManagedWrite(input: RecordManagedWriteInput): Promise<StoredFactRecord> {
    const normalizedText = normalizeFactText(input.text);
    const existingFacts = await this.store.listFacts(input.fileName);
    const duplicate = existingFacts.find(
      (fact) => normalizeFactText(fact.text) === normalizedText
    );

    if (!duplicate) {
      await this.store.appendFactEvent({
        factId: `fact_${ulid()}`,
        type: "established",
        fileName: input.fileName,
        text: normalizedText,
        provenance: input.provenance,
        timestamp: input.provenance.recordedAt,
      });
    }

    await this.renderFileFromStore(input.fileName);
    const nextFacts = await this.store.listFacts(input.fileName);
    const establishedFact =
      nextFacts.find((fact) => normalizeFactText(fact.text) === normalizedText) ?? null;

    if (!establishedFact) {
      throw new Error(`Failed to establish managed fact for ${input.fileName}`);
    }

    return establishedFact;
  }

  async createDeleteProposal(factId: ManagedFactId): Promise<ProposalDetail> {
    const fact = await this.requireFact(factId);
    await this.assertNoDrift(fact.fileName);

    const currentFacts = await this.store.listFacts(fact.fileName);
    const nextFacts = currentFacts.filter((entry) => entry.id !== factId);

    return this.store.createProposal({
      action: "delete",
      factId,
      fileName: fact.fileName,
      diff: getDiff(renderFactList(currentFacts), renderFactList(nextFacts)),
    });
  }

  async createEditProposal(
    factId: ManagedFactId,
    text: string
  ): Promise<ProposalDetail> {
    const fact = await this.requireFact(factId);
    await this.assertNoDrift(fact.fileName);

    const nextText = normalizeFactText(text);
    const currentFacts = await this.store.listFacts(fact.fileName);
    const nextFacts = currentFacts.map((entry) =>
      entry.id === factId
        ? {
            ...entry,
            text: nextText,
          }
        : entry
    );

    return this.store.createProposal({
      action: "edit",
      factId,
      fileName: fact.fileName,
      proposedText: nextText,
      diff: getDiff(renderFactList(currentFacts), renderFactList(nextFacts)),
    });
  }

  async createMoveProposal(
    factId: ManagedFactId,
    targetFileName: ManagedFileName
  ): Promise<ProposalDetail> {
    const fact = await this.requireFact(factId);
    await this.assertNoDrift(fact.fileName);
    await this.assertNoDrift(targetFileName);

    const currentSourceFacts = await this.store.listFacts(fact.fileName);
    const currentTargetFacts = await this.store.listFacts(targetFileName);
    const nextSourceFacts = currentSourceFacts.filter((entry) => entry.id !== factId);
    const nextTargetFacts = [
      ...currentTargetFacts,
      {
        ...fact,
        fileName: targetFileName,
      },
    ];

    return this.store.createProposal({
      action: "move",
      factId,
      fileName: fact.fileName,
      targetFileName,
      diff: [
        `Move ${factId} from ${fact.fileName} to ${targetFileName}`,
        getDiff(renderFactList(currentSourceFacts), renderFactList(nextSourceFacts)),
        getDiff(renderFactList(currentTargetFacts), renderFactList(nextTargetFacts)),
      ].join("\n"),
    });
  }

  async getProposal(proposalId: ReflectionProposalId): Promise<ProposalDetail> {
    const proposal = await this.store.getProposal(proposalId);
    if (!proposal) {
      throw new Error(`Unknown proposal: ${proposalId}`);
    }

    return proposal;
  }

  async applyProposal(proposalId: ReflectionProposalId): Promise<ProposalDetail> {
    const proposal = await this.getProposal(proposalId);
    if (proposal.status !== "pending") {
      return proposal;
    }

    if (proposal.action === "delete") {
      await this.store.appendFactEvent({
        factId: proposal.factId,
        type: "deleted",
        fileName: proposal.fileName,
        proposalId: proposal.id,
      });
      await this.renderFileFromStore(proposal.fileName);
    } else if (proposal.action === "edit") {
      await this.store.appendFactEvent({
        factId: proposal.factId,
        type: "edited",
        fileName: proposal.fileName,
        text: proposal.proposedText,
        proposalId: proposal.id,
      });
      await this.renderFileFromStore(proposal.fileName);
    } else {
      await this.store.appendFactEvent({
        factId: proposal.factId,
        type: "moved",
        fileName: proposal.targetFileName,
        proposalId: proposal.id,
      });
      await this.renderFileFromStore(proposal.fileName);
      if (proposal.targetFileName) {
        await this.renderFileFromStore(proposal.targetFileName);
      }
    }

    await this.store.applyProposalStateTransition(proposal.id);
    return this.getProposal(proposal.id);
  }

  async discardProposal(proposalId: ReflectionProposalId): Promise<ProposalDetail> {
    await this.store.discardProposalStateTransition(proposalId);
    return this.getProposal(proposalId);
  }

  async reconcile(
    fileName: ManagedFileName,
    mode: ReconcileMode
  ): Promise<ManagedFileView> {
    if (mode === "overwrite") {
      await this.renderFileFromStore(fileName);
      return this.getFileView(fileName);
    }

    if (mode === "detach") {
      const content = await this.readManagedFile(fileName);
      const parsed = parseManagedRegion(content);
      const detachedContent =
        parsed.hasManagedRegion
          ? `${parsed.beforeManaged}${parsed.afterManaged}`
          : content;
      await writeFileWithLock(this.getFilePath(fileName), detachedContent);
      return this.getFileView(fileName);
    }

    const content = await this.readManagedFile(fileName);
    const parsed = parseManagedRegion(content);
    const nextTexts = extractFactTexts(parsed.managedBody);
    const currentFacts = await this.store.listFacts(fileName);

    for (const fact of currentFacts) {
      if (!nextTexts.includes(normalizeFactText(fact.text))) {
        await this.store.appendFactEvent({
          factId: fact.id,
          type: "deleted",
          fileName,
          timestamp: new Date().toISOString(),
        });
      }
    }

    const survivingTexts = new Set(
      (await this.store.listFacts(fileName)).map((fact) => normalizeFactText(fact.text))
    );

    for (const text of nextTexts) {
      if (!survivingTexts.has(text)) {
        await this.store.appendFactEvent({
          factId: `fact_${ulid()}`,
          type: "established",
          fileName,
          text,
          provenance: {
            decision: getDecisionForFile(fileName),
            reason: "adopted managed region baseline",
            recordedAt: new Date().toISOString(),
          },
          timestamp: new Date().toISOString(),
        });
      }
    }

    await this.renderFileFromStore(fileName);
    return this.getFileView(fileName);
  }

  private async requireFact(factId: ManagedFactId): Promise<StoredFactRecord> {
    const fact = await this.store.getFact(factId);
    if (!fact || fact.status !== "active") {
      throw new Error(`Unknown active fact: ${factId}`);
    }

    return fact;
  }

  private async assertNoDrift(fileName: ManagedFileName): Promise<void> {
    const fileView = await this.getFileView(fileName);
    if (fileView.drift.isDrifted) {
      throw new Error(`Managed region drift detected for ${fileName}`);
    }
  }

  private async renderFileFromStore(fileName: ManagedFileName): Promise<void> {
    const currentContent = await this.readManagedFile(fileName);
    const facts = await this.store.listFacts(fileName);
    const managedBody = renderFactList(facts);
    const nextContent = renderManagedRegion(currentContent, managedBody);
    await writeFileWithLock(this.getFilePath(fileName), nextContent);
  }

  private getFilePath(fileName: ManagedFileName): string {
    return path.join(this.workspaceDir, fileName);
  }

  private async readManagedFile(fileName: ManagedFileName): Promise<string> {
    const filePath = this.getFilePath(fileName);
    return (await readFile(filePath)) ?? DEFAULT_HEADERS[fileName];
  }
}
