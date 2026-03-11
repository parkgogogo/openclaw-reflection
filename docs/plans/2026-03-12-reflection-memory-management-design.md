# Reflection Memory Management Design

## Goal

Evolve Reflection from a log-centric plugin into a local memory management system that lets users:

- inspect what the plugin wrote into memory
- understand why a fact exists
- correct memory safely from inside OpenClaw commands
- preserve the full lifecycle of managed facts as future training and evaluation signal

## MVP Status

The March 12, 2026 MVP implementation follows this design with:

- managed regions in core memory files
- local managed-fact and proposal persistence
- `/reflection` file/fact/proposal/reconcile commands
- shared gateway methods for Reflection operations
- agent tools for inspection and proposal generation
- write-path persistence of established managed facts after successful `write_guardian` writes

## Primary Product Outcome

The first version should optimize for user control over memory files, not for backend analytics.

The most important user outcome is:

- a user can look at a memory file
- see the managed facts inside it
- inspect where a fact came from
- delete, edit, or move that fact through a safe proposal flow

Data retention is also important, but as a supporting product principle:

- every managed fact and every subsequent correction should be preserved as local signal
- no day of usage should be silently discarded if it could become useful future supervision data

## Problem

The current plugin keeps operational logs, but not a usable memory management model.

That leaves three gaps:

1. Users cannot inspect `memory_gate` decisions in a way that supports confident correction.
2. Users cannot meaningfully revisit `write_guardian` outcomes or change memory safely.
3. Reflection usage continuously produces valuable supervision signal, but the plugin does not treat that signal as a first-class asset.

## Product Principles

### File-first experience

Users think in terms of `MEMORY.md`, `USER.md`, `SOUL.md`, `IDENTITY.md`, and `TOOLS.md`, not in terms of raw decision logs.

The product should therefore use file-centered navigation and only expose decisions and conversations as supporting evidence.

### Facts as the management unit

Users should manage small memory facts, not whole-file diffs.

First-version fact actions:

- delete a fact
- edit a fact's wording
- move a fact to another managed file

### Safe change flow

Corrections should not directly rewrite memory on first contact.

All destructive or state-changing actions should follow:

1. inspect
2. generate proposal
3. review proposal and diff
4. explicitly apply

### Local-first by design

Reflection behavior is local. The design should assume local storage, local commands, and developer-friendly inspectability.

### Signal preservation

A managed fact is a signal from the moment it is written into managed memory, even if the user later changes or deletes it.

The system should preserve:

- fact creation
- accepted wording
- later edits
- moves across files
- deletions
- proposal acceptance or rejection

## Core Model

### Dual-layer model

The system should adopt a dual-layer model:

- visible layer: Markdown memory files
- managed layer: internal facts and their provenance

The Markdown files remain the user-facing memory artifacts. Internally, the system tracks managed facts as the unit of inspection and correction.

### Managed regions

Each core memory file should contain a clearly defined managed region.

The plugin only owns and rewrites content inside that region. Content outside that region remains free text and is not part of the strong consistency contract.

This keeps the product compatible with OpenClaw's existing free-form memory style while still enabling structured management.

### Consistency model

The system is only responsible for consistency between:

- managed facts
- the rendered managed region for a file

The system is not responsible for automatically structuring arbitrary user-authored free text outside the managed region.

## Drift Handling

Users may manually edit the managed region. The first version should support that reality without pretending it can guarantee silent two-way sync.

Drift should be treated as a detectable state, not a background error.

First-version behavior:

- drift is checked when a user enters a management flow through Reflection commands
- no background monitoring or intrusive notifications are required
- if drift is detected, the system should block further managed operations until the user chooses how to reconcile it

Recommended reconciliation actions:

- `overwrite`: regenerate the managed region from current managed facts
- `adopt`: treat the current edited region as the new managed baseline
- `detach`: stop managing that region until the user explicitly restores management

## Fact Lifecycle

A fact becomes established when the system successfully writes it into a managed region.

Later user actions do not erase the fact's historical existence. They become additional lifecycle events.

This allows the product to preserve both:

- current memory state
- historical supervision signal

The first version should treat facts as lifecycle-bearing objects, even if only three user-visible actions are exposed initially.

## Provenance Requirements

Every managed fact should be inspectable with enough context for user judgment.

At minimum, a user should be able to see:

- the current fact wording
- the file it currently belongs to
- the originating conversation snippet
- the associated `memory_gate` decision
- the write action that caused the fact to appear in managed memory
- subsequent user-visible changes to that fact

This provenance is core product value, not optional diagnostics.

## Command Model

Reflection should continue to use OpenClaw's built-in command model rather than introducing a separate standalone CLI.

The first version should avoid depending on rich multi-step interactive command sessions. Instead it should use repeatable, stateless command steps that still feel like a guided workflow.

The command surface should stay intentionally small. Commands are the user-facing entry point, not the only system interface.

### Interaction surfaces

The first version should separate Reflection into three layers:

- commands for human-triggered inspection and approval
- agent tools for LLM-driven assistance
- internal gateway methods for reusable business operations

This keeps the product from overloading `/reflection` with every low-level action while still allowing the agent to help with fact inspection and proposal generation.

#### Commands

Commands should remain the primary user entry point inside OpenClaw.

They should be optimized for:

- file-first navigation
- fact inspection
- proposal review
- explicit approval

#### Agent tools

The plugin should expose fine-grained Reflection tools for agent-driven assistance rather than forcing the agent to issue chat commands.

These tools should support tasks such as:

- listing files and facts
- reading fact provenance
- checking file drift
- generating delete, edit, and move proposals

The agent may assist with analysis and proposal preparation, but it should not silently become the final authority over managed memory.

#### Gateway methods

Gateway methods should serve as the internal capability layer shared by commands, tools, and any future admin entry points.

They should hold the core operations, such as:

- file listing
- fact lookup
- provenance lookup
- proposal creation
- proposal retrieval
- proposal application
- drift reconciliation

This avoids duplicating business logic across command handlers and agent tools.

### Recommended commands

Primary navigation:

- `/reflection files`
- `/reflection file <file-name>`
- `/reflection fact <fact-id>`

Change proposal flow:

- `/reflection propose delete <fact-id>`
- `/reflection propose edit <fact-id> --text "..."`
- `/reflection propose move <fact-id> --to <file-name>`
- `/reflection proposal <proposal-id>`
- `/reflection apply <proposal-id>`
- `/reflection discard <proposal-id>`

Drift reconciliation:

- `/reflection reconcile <file-name> --mode overwrite`
- `/reflection reconcile <file-name> --mode adopt`
- `/reflection reconcile <file-name> --mode detach`

### Interaction model

The main workflow should look like this:

1. user opens a file view
2. system shows file status and managed facts
3. user inspects one fact
4. user generates a proposal to delete, edit, or move it
5. system shows the proposed managed-region diff
6. user explicitly applies or discards the proposal

### Approval boundary

The first version should draw a clear boundary between preparation and mutation.

- humans may inspect, review, and approve
- the agent may inspect and generate proposals
- proposal application should require an explicit user action

This keeps memory management auditable and prevents the correction system from becoming another opaque write path.

## Scope for Version One

### In scope

- full local retention of managed fact history and relevant conversation evidence
- file-centered inspection
- fact-centered inspection
- provenance for every managed fact
- minimal user-facing `/reflection` command surface
- fine-grained agent assistance through plugin tools
- reusable internal gateway methods for Reflection operations
- proposal-based delete, edit, and move actions
- managed-region drift detection during Reflection command flows
- preservation of fact lifecycle as local supervision signal

### Explicitly not required in version one

- automatic management of arbitrary free text outside managed regions
- background drift notifications
- rich interactive wizard-style command sessions
- advanced fact operations such as merge and expire
- automated data quality scoring
- automated promotion of user free text into managed facts
- agent-side autonomous apply without explicit user confirmation

## Data and Labeling Implications

The design should treat all managed facts as signal, not just explicit corrections.

Useful signal includes:

- the fact that a candidate was written at all
- the file assignment chosen by the system
- the wording accepted into managed memory
- later delete actions
- later edits
- later moves
- whether a proposal was applied or discarded

This means dataset generation should be framed as a downstream capability built on top of fact lifecycle capture, not as a separate product track.

## Risks

### Product complexity

If the first version tries to expose decisions, file history, proposal flows, reconciliation, and dataset workflows all at once, the command surface will become harder to learn than the current memory experience.

### Trust failure

If a user cannot see why a fact exists, proposal-based correction will still feel like a black box.

### Model overreach

If the plugin tries to automatically infer structure from all free-form Markdown, consistency will become fragile and user trust will drop.

## Recommendation

Build the first version as a file-first memory management layer with managed regions and managed facts.

Treat provenance and proposal review as product essentials. Treat data preservation as a built-in consequence of the management model, not as a separate analytics feature.

This keeps the product focused on user control while preserving the long-term value of local supervision data.
