import path from "node:path";
import { ulid } from "ulid";

import type {
  FactProvenanceSummary,
  ManagedFactId,
  ManagedFileName,
  ProposalDetail,
  ReflectionProposalAction,
  ReflectionProposalId,
  ReflectionProposalStatus,
} from "../types.js";
import { readFile, writeFileWithLock } from "../utils/file-utils.js";

type ManagedFactStatus = "active" | "deleted";
type FactLifecycleEventType = "established" | "edited" | "moved" | "deleted";

interface StoreState {
  facts: StoredFactRecord[];
  factEvents: StoredFactEventRecord[];
  proposals: StoredProposalRecord[];
}

export interface StoredFactRecord {
  id: ManagedFactId;
  fileName: ManagedFileName;
  text: string;
  status: ManagedFactStatus;
  createdAt: string;
  updatedAt: string;
  provenance: FactProvenanceSummary;
}

export interface AppendFactEventInput {
  factId: ManagedFactId;
  type: FactLifecycleEventType;
  fileName?: ManagedFileName;
  text?: string;
  provenance?: FactProvenanceSummary;
  proposalId?: ReflectionProposalId;
  timestamp?: string;
}

export interface StoredFactEventRecord {
  id: string;
  factId: ManagedFactId;
  type: FactLifecycleEventType;
  fileName: ManagedFileName;
  text?: string;
  proposalId?: ReflectionProposalId;
  timestamp: string;
}

export interface CreateProposalInput {
  action: ReflectionProposalAction;
  factId: ManagedFactId;
  fileName: ManagedFileName;
  proposedText?: string;
  targetFileName?: ManagedFileName;
  diff: string;
  createdAt?: string;
}

export interface StoredProposalRecord extends ProposalDetail {
  status: ReflectionProposalStatus;
  appliedAt?: string;
  discardedAt?: string;
}

interface MemoryManagementStoreConfig {
  workspaceDir: string;
}

const EMPTY_STATE: StoreState = {
  facts: [],
  factEvents: [],
  proposals: [],
};

function cloneEmptyState(): StoreState {
  return {
    facts: [],
    factEvents: [],
    proposals: [],
  };
}

function sortByTimestamp<T extends { timestamp?: string; createdAt?: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const leftValue = left.timestamp ?? left.createdAt ?? "";
    const rightValue = right.timestamp ?? right.createdAt ?? "";
    return leftValue.localeCompare(rightValue);
  });
}

function getStoreFilePath(workspaceDir: string): string {
  return path.join(
    workspaceDir,
    ".openclaw-reflection",
    "memory-management-store.json"
  );
}

function getTimestamp(value?: string): string {
  return value ?? new Date().toISOString();
}

function requireFact(
  facts: StoredFactRecord[],
  factId: ManagedFactId
): StoredFactRecord {
  const fact = facts.find((candidate) => candidate.id === factId);
  if (!fact) {
    throw new Error(`Unknown fact: ${factId}`);
  }

  return fact;
}

export class LocalMemoryManagementStore {
  private readonly storeFilePath: string;

  constructor(config: MemoryManagementStoreConfig) {
    this.storeFilePath = getStoreFilePath(config.workspaceDir);
  }

  async listFiles(): Promise<ManagedFileName[]> {
    const state = await this.readState();
    return Array.from(
      new Set(
        state.facts
          .filter((fact) => fact.status === "active")
          .map((fact) => fact.fileName)
      )
    ).sort();
  }

  async listFacts(fileName: ManagedFileName): Promise<StoredFactRecord[]> {
    const state = await this.readState();
    return state.facts
      .filter((fact) => fact.status === "active" && fact.fileName === fileName)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async getFact(factId: ManagedFactId): Promise<StoredFactRecord | null> {
    const state = await this.readState();
    return state.facts.find((fact) => fact.id === factId) ?? null;
  }

  async listFactEvents(factId: ManagedFactId): Promise<StoredFactEventRecord[]> {
    const state = await this.readState();
    return sortByTimestamp(
      state.factEvents.filter((event) => event.factId === factId)
    );
  }

  async appendFactEvent(input: AppendFactEventInput): Promise<StoredFactEventRecord> {
    const state = await this.readState();
    const timestamp = getTimestamp(input.timestamp);
    const eventId = `factevt_${ulid()}`;

    let eventFileName: ManagedFileName;
    let eventText = input.text;

    if (input.type === "established") {
      if (!input.fileName || !input.text || !input.provenance) {
        throw new Error("Established fact events require fileName, text, and provenance");
      }

      state.facts = state.facts.filter((fact) => fact.id !== input.factId);
      state.facts.push({
        id: input.factId,
        fileName: input.fileName,
        text: input.text,
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
        provenance: input.provenance,
      });
      eventFileName = input.fileName;
    } else {
      const existingFact = requireFact(state.facts, input.factId);

      if (input.type === "edited") {
        if (!input.text) {
          throw new Error("Edited fact events require text");
        }

        existingFact.text = input.text;
        existingFact.updatedAt = timestamp;
        existingFact.status = "active";
        eventFileName = input.fileName ?? existingFact.fileName;
        existingFact.fileName = eventFileName;
        eventText = input.text;
      } else if (input.type === "moved") {
        if (!input.fileName) {
          throw new Error("Moved fact events require fileName");
        }

        existingFact.fileName = input.fileName;
        existingFact.updatedAt = timestamp;
        existingFact.status = "active";
        eventFileName = input.fileName;
        eventText = existingFact.text;
      } else {
        existingFact.status = "deleted";
        existingFact.updatedAt = timestamp;
        eventFileName = input.fileName ?? existingFact.fileName;
      }
    }

    const event: StoredFactEventRecord = {
      id: eventId,
      factId: input.factId,
      type: input.type,
      fileName: eventFileName,
      text: eventText,
      proposalId: input.proposalId,
      timestamp,
    };

    state.factEvents.push(event);
    await this.writeState(state);

    return event;
  }

  async createProposal(input: CreateProposalInput): Promise<StoredProposalRecord> {
    const state = await this.readState();
    const proposal: StoredProposalRecord = {
      id: `proposal_${ulid()}`,
      action: input.action,
      status: "pending",
      factId: input.factId,
      fileName: input.fileName,
      diff: input.diff,
      createdAt: getTimestamp(input.createdAt),
    };

    if (input.proposedText !== undefined) {
      proposal.proposedText = input.proposedText;
    }

    if (input.targetFileName !== undefined) {
      proposal.targetFileName = input.targetFileName;
    }

    state.proposals.push(proposal);
    await this.writeState(state);

    return proposal;
  }

  async getProposal(
    proposalId: ReflectionProposalId
  ): Promise<StoredProposalRecord | null> {
    const state = await this.readState();
    return state.proposals.find((proposal) => proposal.id === proposalId) ?? null;
  }

  async listProposals(): Promise<StoredProposalRecord[]> {
    const state = await this.readState();
    return [...state.proposals].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    );
  }

  async applyProposalStateTransition(
    proposalId: ReflectionProposalId,
    appliedAt?: string
  ): Promise<StoredProposalRecord> {
    return this.transitionProposal(proposalId, "applied", getTimestamp(appliedAt));
  }

  async discardProposalStateTransition(
    proposalId: ReflectionProposalId,
    discardedAt?: string
  ): Promise<StoredProposalRecord> {
    return this.transitionProposal(
      proposalId,
      "discarded",
      getTimestamp(discardedAt)
    );
  }

  private async transitionProposal(
    proposalId: ReflectionProposalId,
    status: Extract<ReflectionProposalStatus, "applied" | "discarded">,
    timestamp: string
  ): Promise<StoredProposalRecord> {
    const state = await this.readState();
    const proposal = state.proposals.find((candidate) => candidate.id === proposalId);

    if (!proposal) {
      throw new Error(`Unknown proposal: ${proposalId}`);
    }

    proposal.status = status;
    if (status === "applied") {
      proposal.appliedAt = timestamp;
      delete proposal.discardedAt;
    } else {
      proposal.discardedAt = timestamp;
      delete proposal.appliedAt;
    }

    await this.writeState(state);
    return proposal;
  }

  private async readState(): Promise<StoreState> {
    const raw = await readFile(this.storeFilePath);
    if (!raw) {
      return cloneEmptyState();
    }

    const parsed = JSON.parse(raw) as Partial<StoreState>;
    return {
      facts: Array.isArray(parsed.facts) ? parsed.facts : EMPTY_STATE.facts,
      factEvents: Array.isArray(parsed.factEvents)
        ? parsed.factEvents
        : EMPTY_STATE.factEvents,
      proposals: Array.isArray(parsed.proposals)
        ? parsed.proposals
        : EMPTY_STATE.proposals,
    };
  }

  private async writeState(state: StoreState): Promise<void> {
    await writeFileWithLock(this.storeFilePath, `${JSON.stringify(state, null, 2)}\n`);
  }
}
