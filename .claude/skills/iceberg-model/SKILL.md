---
name: iceberg-model
description: Systems thinking skill — reveals the invisible structural drivers and mental models beneath surface-level events and patterns. Invoked by the Orchestrator when a problem keeps recurring despite repeated fixes, or when root-cause analysis has stalled at the symptomatic level.
license: MIT
compatibility: Standalone thinking model skill; receives diagnostic input from SWOT (persistent Weaknesses) or Six Thinking Hats (Black hat recurring risks). Chains into First Principles (deconstruct the mental model layer) or 5 Whys (drill down from pattern to structure).
metadata:
  author: team
  version: "1.0"
  updatedAt: "2026-04-26"
---

# Thinking Model Skill — Iceberg Model

> **Orchestrator Routing Trigger (Logic Gate D):** Awaken this Skill when a problem is recurring despite surface-level interventions, when "we've fixed this before but it came back," or when team members disagree on root cause because they are describing the same iceberg from different depths.

---

## Layer 1: Core Definition

A systems thinking framework from Peter Senge's *The Fifth Discipline* that decomposes any situation into four layers of increasing depth and invisibility. The visible tip — events — is only 10% of what drives outcomes. The 90% below the waterline — patterns, structures, and mental models — contains the leverage for lasting change.

**Output feeds into**: First Principles (to deconstruct the Mental Model layer as an assumption set), or 5 Whys (to drill systematically from Pattern → Structure → Mental Model).

---

## Layer 2: Master's Mindset

**Chief Practitioner**: Peter Senge (*The Fifth Discipline*, 1990).

| Layer | Depth | Visibility | Intervention Type | Leverage |
|-------|-------|-----------|-------------------|---------|
| **Events** | Surface | Fully visible | React (firefighting) | Lowest |
| **Patterns** | Shallow | Partially visible | Anticipate (trend response) | Low |
| **Structures** | Deep | Mostly invisible | Design (system redesign) | High |
| **Mental Models** | Deepest | Invisible | Transform (belief revision) | Highest |

**Key Insight**: Most organizations operate exclusively at the Event layer — they react to crises and believe they are solving problems. Permanent change only comes from intervening at the Structure and Mental Model layers.

---

## Layer 3: Step-by-Step Execution

**All four layers are mandatory. Reaching the Mental Model layer is the only valid completion state.**

### Step 1: Surface the Events Layer

**Action**: Describe the specific, observable incidents that triggered this analysis. What happened? When? What was the immediate impact?

**Self-Prompt**: *What is the visible symptom? What did people actually see, measure, or experience?*

> Events are facts, not interpretations. State them as precisely as a journalist would: who, what, when, where, how much.

---

### Step 2: Identify the Patterns Layer

**Action**: Look back over time. Are these events recurring? What is the trend line? When did it start? Has it accelerated or decelerated?

**Self-Prompt**: *Is this a one-time incident or part of a repeating cycle? What does the pattern look like over 3 months / 1 year / 5 years?*

> A pattern is a recurring event sequence. Identifying the pattern shifts the question from "what happened?" to "why does this keep happening?"

---

### Step 3: Expose the Structures Layer

**Action**: Identify the systemic structures — incentives, processes, org design, feedback loops, resource constraints, information flows — that predictably generate the pattern identified in Step 2.

**Self-Prompt**: *What is the system design that makes this pattern the natural output? What feedback loop is reinforcing the behavior? What incentive makes rational actors produce this irrational collective outcome?*

> Structures include: incentive systems, reporting hierarchies, budget allocation rules, information silos, physical constraints, and reinforcing/balancing feedback loops.

**Key Tool — Causal Loop Diagram (simplified)**:

```
[Structure A] → reinforces → [Behavior B] → produces → [Event C]
      ↑                                                      |
      └────────────────── loop closes ──────────────────────┘
```

Sketch even a rough causal loop — it forces precision about which structural element is the actual driver.

---

### Step 4: Surface the Mental Models Layer

**Action**: Identify the deeply held beliefs, assumptions, and values held by decision-makers that caused them to design and maintain the structures identified in Step 3.

**Self-Prompt**: *What did the people who designed this system believe to be true? What assumption, if changed, would make them design it completely differently? What belief is being protected even at the cost of poor outcomes?*

> Mental models are invisible precisely because they feel like "common sense" or "just how things work." The test for a mental model: *What would have to be true for this structure to seem like the right design?*

---

## Layer 4: Output Specification

All outputs **must** strictly follow these three mandatory formats.

### Mandatory Format 1 — Four-Layer Iceberg Table

| Layer | Content |
|-------|---------|
| **Events** (visible tip) | *(describe the observable incidents — specific, dated if possible)* |
| **Patterns** | *(describe the recurring trend — timeframe, frequency, direction)* |
| **Structures** | *(identify 2–3 systemic drivers: incentives, feedback loops, process constraints)* |
| **Mental Models** | *(state 1–2 core beliefs that make the structures feel "correct" to those who maintain them)* |

### Mandatory Format 2 — Leverage Point Identification

State the single highest-leverage intervention point — the structure or mental model whose change would break the pattern with the least resistance.

> Example: *"The highest leverage point is the incentive structure that rewards individual throughput over system throughput. Changing the bonus metric from 'tasks closed' to 'cycle time reduced' would break the queue-building pattern."*

### Mandatory Format 3 — Intervention Proposal

One concrete change at the Structure level and one at the Mental Model level. State: what changes, who changes it, and what observable event at Layer 1 would confirm the intervention worked.

---

## Layer 5: Pitfall Guide & Iteration Log

*(Read by the Orchestrator to prevent errors. Dynamically updated after each review.)*

### Known Blind Spot 1 — Stopping at Patterns

Pattern analysis without structural diagnosis produces only better predictions of failure — not prevention. **An Iceberg analysis that ends at Layer 2 is incomplete. Structures are the minimum required output.**

### Known Blind Spot 2 — Blaming Individuals

The Iceberg Model assumes that bad outcomes in well-intentioned systems are produced by structures, not bad actors. When Step 3 names a person rather than a system design element, the analysis has gone wrong. **Structures are things you can draw on a diagram — they are never a person's name.**

### Known Blind Spot 3 — Mental Model Defensiveness

Surfacing the Mental Model layer often provokes resistance because it implies that leadership's beliefs are the problem. **Frame Mental Models as "what was rational when the system was designed" rather than "who is to blame now." This converts defensiveness into curiosity.**

---

### Iteration Log

| Date | Error | Prevention Mechanism |
|------|-------|----------------------|
| 2026-04-26 | Initial version. | — |
