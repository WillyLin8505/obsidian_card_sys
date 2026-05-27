---
name: five-whys
description: Root cause drilling skill — repeatedly asks "Why?" to pierce through symptomatic explanations and reach the single actionable root cause. Invoked by the Orchestrator when a problem recurs despite fixes, or when a team is treating symptoms rather than causes.
license: MIT
compatibility: Standalone thinking model skill; chains from Iceberg Model (Pattern layer → drill to Structure), or feeds into First Principles (root cause becomes the assumption to deconstruct). Pairs with SWOT (Weakness root cause) and Matrix Analysis (prioritize root causes by impact).
metadata:
  author: team
  version: "1.0"
  updatedAt: "2026-04-26"
---

# Thinking Model Skill — Five Whys (5 Whys)

> **Orchestrator Routing Trigger (Logic Gate E):** Awaken this Skill when a stated problem description is clearly a symptom, when a fix has been applied before but the problem returned, or when stakeholders disagree on root cause because they are each describing a different layer of the same causal chain.

---

## Layer 1: Core Definition

A causal chain drilling technique invented by Sakichi Toyoda and systematized at Toyota. By asking "Why?" five or more consecutive times — each time targeting the answer to the previous question — the method forces practitioners to move past symptoms and proximate causes to reach the single structural root cause that, if addressed, prevents recurrence.

**Output feeds into**: First Principles (the root cause becomes the assumption set to deconstruct and rebuild from), or Matrix Analysis (multiple root causes → prioritize by frequency × impact).

---

## Layer 2: Master's Mindset

**Chief Practitioner**: Sakichi Toyoda; systematized by Taiichi Ohno (Toyota Production System).

| Principle | Description |
|-----------|-------------|
| One causal chain at a time | Do not branch into multiple "why" threads simultaneously. Complete one chain to root cause before starting another. |
| Facts over opinions | Each "Why?" answer must be a verifiable fact, not a hypothesis. If unverified, mark it and validate before continuing. |
| Stop at the actionable root | The chain ends when the answer points to a process, system, or structural element that a person or team can directly change. |
| Five is a guideline, not a rule | Root cause may be reached at Why 3 or Why 7. "Five" signals depth — do not stop prematurely at Why 2 because the answer feels satisfying. |

---

## Layer 3: Step-by-Step Execution

**All steps are mandatory. Do not skip the verification step (Step 4).**

### Step 1: State the Problem Precisely

**Action**: Write a single, specific problem statement. Include what happened, when, how often, and the measurable impact.

**Self-Prompt**: *Is this statement describing an observable event (correct) or a hypothesis about cause (incorrect)?*

> Bad: "Our deployment process is bad."
> Good: "Production deployments fail 30% of the time on Fridays, causing 2-hour rollback delays."

---

### Step 2: Drill the Causal Chain

**Action**: Ask "Why did this happen?" and record the answer. Then ask "Why did *that* happen?" targeting the previous answer. Continue until you reach a root cause.

**Format for each level**:
```
Why 1: [Problem statement] → Because: [Answer 1]
Why 2: [Answer 1] → Because: [Answer 2]
Why 3: [Answer 2] → Because: [Answer 3]
Why 4: [Answer 3] → Because: [Answer 4]
Why 5: [Answer 4] → Because: [Answer 5 = Root Cause]
```

**Self-Prompt at each level**: *Is this answer a verifiable fact? Does it point to a human decision, a process gap, or a system design failure — or is it still a symptom?*

---

### Step 3: Identify the Root Cause Type

**Action**: Classify the root cause into one of three categories:

| Type | Description | Intervention |
|------|-------------|-------------|
| **Process gap** | A step is missing or undefined | Add/redesign the process |
| **System/tool failure** | Infrastructure or tooling does not support the desired behavior | Fix or replace the system |
| **Knowledge/training gap** | People lack information or skill to perform correctly | Training, documentation, or role redesign |

> A root cause that is "human error" or "someone didn't do their job" is almost always a sign the chain has stopped too early. Humans make predictable errors in poorly designed systems. Drill one more level.

---

### Step 4: Verify the Chain (Reverse Test)

**Action**: Read the causal chain backwards using "Therefore": Root Cause → Therefore → [Answer 4] → Therefore → [Answer 3] → ... → Therefore → [Problem].

**Self-Prompt**: *Does each "therefore" statement hold logically? If any link breaks, the chain has a gap — return to that level and re-examine.*

---

### Step 5: Define the Corrective Action

**Action**: Propose one specific corrective action that addresses the root cause. Define: what changes, who owns it, and by when.

**Constraint**: The corrective action must target the root cause level, not a symptom level. A symptom-level fix that works is still wrong — it will not prevent recurrence.

---

## Layer 4: Output Specification

All outputs **must** strictly follow these three mandatory formats.

### Mandatory Format 1 — Five Whys Chain

| Level | Question | Answer | Verified? |
|-------|---------|--------|---------|
| Problem | — | *(precise problem statement)* | ✓ |
| Why 1 | Why did this happen? | *(answer)* | ✓ / ✗ |
| Why 2 | Why did [Answer 1] happen? | *(answer)* | ✓ / ✗ |
| Why 3 | Why did [Answer 2] happen? | *(answer)* | ✓ / ✗ |
| Why 4 | Why did [Answer 3] happen? | *(answer)* | ✓ / ✗ |
| Why 5 | Why did [Answer 4] happen? | **Root Cause** | ✓ / ✗ |

### Mandatory Format 2 — Root Cause Classification

One sentence: root cause type (Process / System / Knowledge), specific element involved, and why this is the deepest actionable level.

### Mandatory Format 3 — Corrective Action Card

| Field | Content |
|-------|---------|
| Root Cause | *(restate from chain)* |
| Corrective Action | *(specific change — verb + object + scope)* |
| Owner | *(role or person)* |
| Deadline | *(date)* |
| Success Signal | *(what observable event confirms the root cause is eliminated)* |

---

## Layer 5: Pitfall Guide & Iteration Log

### Known Blind Spot 1 — Stopping at Human Error

"The engineer made a mistake" is never a root cause — it is Why 2 at most. The root cause is always the system that made the error easy to make and hard to catch. **Always ask one more Why after "someone did something wrong."**

### Known Blind Spot 2 — Branching Too Early

When Why 2 has multiple valid answers, analysts split into parallel threads and never finish either. **Complete one chain to root cause first. Then return and explore alternative branches if needed.**

### Known Blind Spot 3 — Unverified Answers

Chains built on unverified assumptions produce confident-sounding but wrong root causes. **Mark every unverified answer with ✗ and validate before treating the chain as complete.**

---

### Iteration Log

| Date | Error | Prevention Mechanism |
|------|-------|----------------------|
| 2026-04-26 | Initial version. | — |
