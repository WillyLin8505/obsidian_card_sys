---
name: swot-analysis
description: Strategic positioning skill — maps internal capabilities against external environment across four quadrants to surface the highest-leverage strategic moves. Invoked by the Orchestrator after First Principles or Six Thinking Hats when the problem requires a go/no-go decision or resource prioritization.
license: MIT
compatibility: Standalone thinking model skill; receives input from First Principles (recomposed solution → test against O/T), Six Thinking Hats (White → S/W, Black → T, Yellow → O). Chains into Iceberg Model (root cause of W) or Game Theory (T quadrant competitive analysis).
metadata:
  author: team
  version: "1.0"
  updatedAt: "2026-04-26"
---

# Thinking Model Skill — SWOT Analysis

> **Orchestrator Routing Trigger (Logic Gate C):** Awaken this Skill when the task involves a go/no-go decision, market entry, product positioning, competitive assessment, or resource allocation under constraint.

---

## Layer 1: Core Definition

A strategic framework that classifies all relevant factors into four quadrants — **Strengths, Weaknesses, Opportunities, Threats** — across two axes: internal/external and positive/negative. The real power of SWOT is not in filling the quadrants, but in generating **SO / ST / WO / WT cross-strategies** that drive concrete action.

**Output feeds into**: Iceberg Model (to diagnose the root cause of persistent Weaknesses) or Game Theory (to model Threat responses as payoff matrices).

---

## Layer 2: Master's Mindset

**Origin**: Stanford Research Institute, Albert Humphrey, 1960s.

| Quadrant | Axis | Nature | Core Question |
|----------|------|--------|---------------|
| **S**trengths | Internal | Positive | What do we do better than anyone else right now? |
| **W**eaknesses | Internal | Negative | What prevents us from performing at our potential? |
| **O**pportunities | External | Positive | What external changes can we exploit? |
| **T**hreats | External | Negative | What external forces could damage us? |

**Key Insight**: The four quadrants are inputs, not outputs. The real output is the **four cross-strategies**:
- **SO** (Strengths × Opportunities): Use strengths to capture opportunities — *aggressive growth moves*
- **ST** (Strengths × Threats): Use strengths to neutralize threats — *defensive positioning*
- **WO** (Weaknesses × Opportunities): Address weaknesses to capture opportunities — *development priorities*
- **WT** (Weaknesses × Threats): Minimize weaknesses and avoid threats — *damage limitation*

---

## Layer 3: Step-by-Step Execution

**All four steps are mandatory. Cross-strategy generation in Step 4 is the deliverable — do not stop at Step 3.**

### Step 1: Internal Audit — Strengths

**Action**: List capabilities, resources, and advantages that are genuinely differentiated — not generic ("we have a good team"). Each item must pass the test: *Would a competitor explicitly envy this?*

**Self-Prompt**: *What do we own, know, or do that produces outcomes rivals cannot easily replicate?*

> Minimum 3 items. Each item must be specific and evidence-backed.

---

### Step 2: Internal Audit — Weaknesses

**Action**: List genuine internal limitations — not external problems. Each item must pass the test: *Does this directly reduce our performance or constrain our options today?*

**Self-Prompt**: *What internal gaps, resource deficits, or capability holes are currently limiting us?*

> Do not confuse "we haven't done X yet" (opportunity) with "we are structurally incapable of X" (weakness). Be precise.

---

### Step 3: External Scan — Opportunities & Threats

**Action**: Scan the environment across five domains: market trends, regulatory shifts, technology changes, competitor moves, and customer behavior shifts. Classify each as Opportunity or Threat.

**Self-Prompt**: *What is changing in the world outside our organization that creates either a window to exploit or a risk to manage?*

> Opportunities and Threats are external — they exist independent of our choices. We respond to them; we do not create them.

---

### Step 4: Cross-Strategy Generation (The Real Deliverable)

**Action**: For each of the four cross-strategy pairs, produce at least one concrete strategic move.

| Cross-Strategy | Formula | Example Move |
|---------------|---------|-------------|
| SO — Exploit | Best Strength + Best Opportunity | *(specific action)* |
| ST — Defend | Best Strength + Most Dangerous Threat | *(specific action)* |
| WO — Develop | Most Critical Weakness + Best Opportunity | *(specific action)* |
| WT — Minimize | Most Dangerous Weakness + Most Dangerous Threat | *(specific action)* |

> Each move must be actionable within the next 90 days. Abstract strategy statements ("improve our market position") are invalid outputs.

---

## Layer 4: Output Specification

All outputs **must** strictly follow these three mandatory formats.

### Mandatory Format 1 — SWOT Quadrant Table

| | Positive | Negative |
|---|---|---|
| **Internal** | **S**trengths: *(list, each ≤ 15 words)* | **W**eaknesses: *(list, each ≤ 15 words)* |
| **External** | **O**pportunities: *(list, each ≤ 15 words)* | **T**hreats: *(list, each ≤ 15 words)* |

### Mandatory Format 2 — Cross-Strategy Table

| Strategy Type | Strategic Move | Owner | Timeline |
|--------------|---------------|-------|---------|
| SO — Exploit | *(concrete action)* | *(role)* | *(date)* |
| ST — Defend | *(concrete action)* | *(role)* | *(date)* |
| WO — Develop | *(concrete action)* | *(role)* | *(date)* |
| WT — Minimize | *(concrete action)* | *(role)* | *(date)* |

### Mandatory Format 3 — Priority Stack

Rank the four strategies by urgency × impact. State which single strategy should receive resources first and why.

---

## Layer 5: Pitfall Guide & Iteration Log

*(Read by the Orchestrator to prevent errors. Dynamically updated after each review.)*

### Known Blind Spot 1 — Stopping at the Quadrants

The most common SWOT failure: teams fill the four boxes and consider the job done. The quadrants are data collection, not strategy. **Output is invalid without the cross-strategy table in Format 2.**

### Known Blind Spot 2 — Internal Factors Confused with External

Weaknesses that are "we don't have enough market share yet" are actually Threats/Opportunities. Strengths that are "the market is growing" are Opportunities. **Internal = within our direct control. External = not within our direct control.**

### Known Blind Spot 3 — Vanity Strengths

Listing generic items like "talented team" or "innovative culture" that every competitor would also claim. **Each Strength must answer: what specific, measurable outcome does this produce that rivals cannot match?**

---

### Iteration Log

| Date | Error | Prevention Mechanism |
|------|-------|----------------------|
| 2026-04-26 | Initial version. | — |
