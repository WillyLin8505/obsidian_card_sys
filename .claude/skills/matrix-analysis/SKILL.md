---
name: matrix-analysis
description: Two-dimensional prioritization skill — plots items across two axes to reveal quadrant-based patterns, eliminate wasted effort, and surface the highest-leverage actions. Invoked by the Orchestrator when a list of options, tasks, or risks needs prioritization and a single-axis ranking is insufficient.
license: MIT
compatibility: Standalone thinking model skill; receives inputs from Five Whys (root causes → plot by frequency × impact), SWOT (strategic moves → plot by urgency × leverage), or Game Theory (strategy options → plot by payoff × risk). Chains into Second-order Thinking (top-quadrant items → model downstream effects).
metadata:
  author: team
  version: "1.0"
  updatedAt: "2026-04-26"
---

# Thinking Model Skill — Matrix Analysis

> **Orchestrator Routing Trigger (Logic Gate H):** Awaken this Skill when facing a list of options (tasks, risks, features, strategies, stakeholders) that cannot be adequately ranked on a single dimension, and when the interaction between two independent dimensions creates qualitatively different categories of action.

---

## Layer 1: Core Definition

A visual thinking tool that places items on a 2×2 grid defined by two independent axes — each representing a critical dimension of evaluation. The four resulting quadrants reveal structurally different types of items that require fundamentally different responses, converting a flat list into an actionable decision map.

**Output feeds into**: Second-order Thinking (top-priority items → model unintended consequences before acting), or First Principles (items in the "high impact, low feasibility" quadrant → deconstruct feasibility assumptions).

---

## Layer 2: Master's Mindset

**Canonical Applications**:

| Matrix | Axis 1 | Axis 2 | Classic Use |
|--------|--------|--------|-------------|
| **Eisenhower Matrix** | Urgency | Importance | Personal task prioritization |
| **BCG Growth-Share Matrix** | Market Growth | Relative Market Share | Portfolio strategy |
| **Effort-Impact Matrix** | Effort (cost) | Impact (value) | Feature/initiative prioritization |
| **Risk Matrix** | Probability | Severity | Risk management |
| **Stakeholder Matrix** | Power | Interest | Stakeholder engagement strategy |
| **Skills Matrix** | Skill Level | Business Importance | Hiring and training prioritization |

**Key Insight**: The power of the matrix is not the axes — it is the **quadrant logic**: items in the same quadrant share the same strategic response, regardless of their individual characteristics.

### Universal Quadrant Logic

| Quadrant | High Axis 1 + Low Axis 2 | Low Axis 1 + High Axis 2 | High Axis 1 + High Axis 2 | Low Axis 1 + Low Axis 2 |
|----------|--------------------------|--------------------------|---------------------------|--------------------------|
| **Response pattern** | Monitor / Invest | Address / Fix | Immediate action | Eliminate / Ignore |

---

## Layer 3: Step-by-Step Execution

**All five steps are mandatory. Axis selection (Step 1) determines the entire value of the analysis.**

### Step 1: Select the Two Axes

**Action**: Choose the two dimensions that most fundamentally determine what type of action is required for each item. The axes must be:
- Independent of each other (not correlated)
- Actionable (you can actually intervene on both dimensions)
- Relevant to the decision at hand

**Self-Prompt**: *If I know an item's position on both axes, do I automatically know what to do with it? If yes, these are the right axes. If not, choose differently.*

**Common Axis Pairs by Context**:

| Context | Axis 1 | Axis 2 |
|---------|--------|--------|
| Product features | User value | Development effort |
| Risks | Likelihood | Impact |
| Stakeholders | Power/influence | Alignment with goals |
| Root causes | Frequency | Severity |
| Strategic initiatives | Urgency | Strategic importance |

---

### Step 2: Define the Scale for Each Axis

**Action**: Define High and Low for each axis with specific criteria. Avoid vague qualitative labels — anchor them to observable thresholds.

**Self-Prompt**: *What does "High Impact" actually mean in numbers or observable terms? What separates High from Low on each axis?*

> Example: "High Impact = affects >500 users or >$50K revenue. Low Impact = affects <50 users or <$5K revenue."

---

### Step 3: Plot All Items

**Action**: For each item on the list, estimate its position on both axes and place it in the appropriate quadrant. If uncertain, use a 1–5 scale for each axis and calculate the quadrant mathematically.

**Self-Prompt**: *Am I placing items based on evidence or on gut feel? Which placements am I most uncertain about?*

> Mark uncertain placements with a "?" — they become explicit assumptions to validate.

---

### Step 4: Name and Assign Strategic Response to Each Quadrant

**Action**: Give each quadrant a memorable name that captures its strategic logic, then assign a mandatory response pattern.

**Standard Effort-Impact naming**:

| Quadrant | Name | Strategic Response |
|----------|------|-------------------|
| High Impact + Low Effort | **Quick Wins** | Do immediately |
| High Impact + High Effort | **Major Projects** | Plan and resource |
| Low Impact + Low Effort | **Fill-ins** | Do if time permits |
| Low Impact + High Effort | **Time Sinks** | Eliminate or delegate |

---

### Step 5: Prioritize Within Quadrants

**Action**: Within the highest-priority quadrant, rank items by a tiebreaker dimension (e.g., time sensitivity, dependencies, strategic alignment).

**Self-Prompt**: *Within the "Quick Wins" quadrant, which 3 items should be done this week? What is the execution sequence?*

---

## Layer 4: Output Specification

All outputs **must** strictly follow these three mandatory formats.

### Mandatory Format 1 — Matrix Grid

```
                    HIGH [Axis 2]
        ┌─────────────────┬─────────────────┐
        │                 │                 │
HIGH    │  [Quadrant C]   │  [Quadrant D]   │
[Axis 1]│  Name: _____    │  Name: _____    │
        │  Items: ___     │  Items: ___     │
        ├─────────────────┼─────────────────┤
        │                 │                 │
LOW     │  [Quadrant A]   │  [Quadrant B]   │
[Axis 1]│  Name: _____    │  Name: _____    │
        │  Items: ___     │  Items: ___     │
        └─────────────────┴─────────────────┘
                    LOW [Axis 2]
```

### Mandatory Format 2 — Item Classification Table

| Item | Axis 1 Score (1–5) | Axis 2 Score (1–5) | Quadrant | Strategic Response |
|------|-------------------|-------------------|----------|-------------------|
| *(item)* | *(score)* | *(score)* | *(Q name)* | *(action)* |

### Mandatory Format 3 — Top-3 Priority Actions

List the three highest-priority items from the analysis with specific next actions, owners, and deadlines.

---

## Layer 5: Pitfall Guide & Iteration Log

### Known Blind Spot 1 — Correlated Axes

Choosing axes that are actually the same dimension (e.g., "Strategic Value" and "Business Impact") produces a diagonal matrix where everything falls on one line. **Test axis independence: can an item score High on Axis 1 and Low on Axis 2? If not, the axes are correlated — pick a different pair.**

### Known Blind Spot 2 — Everything in the Same Quadrant

If all items cluster in one quadrant, the axis scales are miscalibrated. Recalibrate the High/Low thresholds so that items distribute across all four quadrants. **A matrix with nothing in some quadrants is not wrong — but if everything is in one quadrant, the thresholds are broken.**

### Known Blind Spot 3 — Ignoring the Eliminate Quadrant

The low-low quadrant is not a consolation — it is an action queue for elimination. **Items in the Time Sink / Eliminate quadrant must be explicitly killed, not just deprioritized. Deprioritized items resurface. Eliminated items do not.**

---

### Iteration Log

| Date | Error | Prevention Mechanism |
|------|-------|----------------------|
| 2026-04-26 | Initial version. | — |
