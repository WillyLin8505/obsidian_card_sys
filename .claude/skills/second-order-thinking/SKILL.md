---
name: second-order-thinking
description: Temporal consequence skill — traces the downstream effects of actions beyond their immediate outcomes to reveal second and third-order consequences that routinely invalidate first-order reasoning. Invoked by the Orchestrator when a proposed action has obvious first-order benefits but the downstream dynamics are complex, or when a decision affects systems with feedback loops.
license: MIT
compatibility: Standalone thinking model skill; chains from Game Theory (equilibrium → model how all players adapt after round one), SWOT (SO/ST strategies → trace second-order effects), or Iceberg Model (structural intervention → model system response). Pairs with First Principles (second-order effects often reveal the assumption that makes the first-order solution fragile).
metadata:
  author: team
  version: "1.0"
  updatedAt: "2026-04-26"
---

# Thinking Model Skill — Second-order Thinking

> **Orchestrator Routing Trigger (Logic Gate J):** Awaken this Skill when a proposed action has clear first-order benefits but involves systems with feedback loops, rational responding actors, or time-delayed consequences — or when a previous similar action produced unexpected results that "nobody saw coming."

---

## Layer 1: Core Definition

A temporal reasoning discipline popularized by Howard Marks (Oaktree Capital) and Charlie Munger (Berkshire Hathaway) that systematically traces the causal chain of an action beyond its immediate first-order effect to identify second-order (consequences of consequences) and third-order effects. Most failed decisions are failures of first-order thinking — the actor saw the intended effect but not the downstream dynamics it would trigger.

**Output feeds into**: First Principles (a dangerous second-order effect → deconstruct the assumption that makes it avoidable), or Matrix Analysis (all identified consequences → plot by probability × severity to prioritize mitigation).

---

## Layer 2: Master's Mindset

**Chief Practitioners**: Howard Marks (*The Most Important Thing*), Charlie Munger (*Poor Charlie's Almanack*), Donella Meadows (*Thinking in Systems*).

| Concept | Description |
|---------|-------------|
| **First-order effect** | The direct, immediate, intended consequence of an action |
| **Second-order effect** | The consequence of the first-order effect — what happens next |
| **Third-order effect** | The consequence of the second-order effect — what happens after that |
| **Feedback loop** | When a downstream effect loops back to amplify or dampen the original action |
| **Unintended consequence** | A second or third-order effect that was not modeled |
| **Cobra effect** | When a solution makes the problem worse via perverse second-order incentives |

**Marks's Core Question**: *"And then what?"* — asked repeatedly until the chain reaches a stable endpoint or a critical risk.

**The Investor's Formulation**: Everyone can see the first-order effect — it is priced in. Competitive advantage comes from seeing the second-order effect that others have missed.

---

## Layer 3: Step-by-Step Execution

**All four steps are mandatory. The analysis is incomplete until at least two orders of consequence are traced.**

### Step 1: State the Action and First-order Effect

**Action**: Clearly state the proposed action and its intended, direct, immediate consequence.

**Self-Prompt**: *What specifically are we doing, and what is the most direct result we expect to see, and when?*

**Format**:
```
Action:              [specific action]
First-order effect:  [direct consequence — who, what, when]
Time horizon:        [days / weeks / months]
```

---

### Step 2: Identify All Affected Actors and Systems

**Action**: List every person, group, organization, or system that will be affected by the first-order effect. For each, describe how their behavior or state changes.

**Self-Prompt**: *Who notices this change? What incentive does it create for them? How will rational actors respond to protect or advance their interests?*

> Include: competitors, users, regulators, suppliers, internal teams, and market mechanisms. Include non-human systems: markets, algorithms, ecosystems, supply chains.

---

### Step 3: Trace Second and Third-order Effects

**Action**: For each affected actor/system identified in Step 2, ask "And then what?" to derive the second-order effect. Then apply "And then what?" again to each second-order effect to reach the third order.

**Chain Template**:
```
Action → [1st order effect]
         → Actor A responds: [2nd order effect A]
                             → [3rd order effect A1]
                             → [3rd order effect A2]
         → Actor B responds: [2nd order effect B]
                             → [3rd order effect B1]
         → System X changes: [2nd order effect C]
                             → [3rd order effect C1]
```

**Self-Prompt at each node**: *Is this consequence beneficial, neutral, or harmful relative to our original goal? Does it create a feedback loop that amplifies or undermines the first-order effect?*

---

### Step 4: Identify Critical Risks and Unintended Consequences

**Action**: Review the full consequence tree. Flag any node where:
- A second or third-order effect reverses or negates the first-order benefit (Cobra Effect)
- A feedback loop amplifies a harmful consequence beyond control
- A competitor or regulator responds in a way that eliminates the advantage
- A time-delayed effect creates a future liability not visible in the present

**Self-Prompt**: *Which consequence, if it materializes, would make us regret this action? Is there a path in this tree that leads to an outcome worse than doing nothing?*

---

## Layer 4: Output Specification

All outputs **must** strictly follow these three mandatory formats.

### Mandatory Format 1 — Consequence Tree

```
[Action]
├── 1st Order: [effect]
│   ├── 2nd Order: [effect from Actor/System A]
│   │   ├── 3rd Order: [effect]
│   │   └── 3rd Order: [effect]
│   └── 2nd Order: [effect from Actor/System B]
│       └── 3rd Order: [effect]
└── 1st Order: [secondary direct effect, if any]
    └── 2nd Order: [effect]
```

### Mandatory Format 2 — Risk Flag Table

| Order | Effect | Type | Severity | Probability | Mitigation |
|-------|--------|------|----------|------------|------------|
| 2nd | *(effect)* | Cobra / Feedback / Competitive / Regulatory | H/M/L | H/M/L | *(action)* |
| 3rd | *(effect)* | *(type)* | H/M/L | H/M/L | *(action)* |

### Mandatory Format 3 — Go / Modify / Stop Recommendation

Based on the consequence tree and risk table:

| Decision | Condition |
|----------|-----------|
| **Go** | No high-severity unintended consequences identified |
| **Go with modification** | High-severity risks exist but are mitigable — state specific modifications |
| **Stop** | A Cobra Effect or irreversible high-severity consequence exists with no feasible mitigation |

---

## Layer 5: Pitfall Guide & Iteration Log

### Known Blind Spot 1 — Stopping at the First-order

The most common failure: decision-makers see the intended benefit and stop analyzing. "This will increase revenue" is a first-order statement. **Every analysis must include at least two orders of consequence before a recommendation is valid.**

### Known Blind Spot 2 — Ignoring Rational Actor Responses

When competitors, users, or regulators are affected, they will respond strategically — not passively. **Model every affected actor as a rational optimizer. "They probably won't notice" is not an analysis; it is a hope.**

### Known Blind Spot 3 — Treating All Consequences as Equiprobable

A long consequence tree can generate dozens of third-order effects. Not all matter equally. **Weight each node by probability × severity. Focus mitigation resources on high-probability × high-severity nodes only.**

### Known Blind Spot 4 — The Cobra Effect

Named after the British colonial incentive to kill cobras in India — which caused farmers to breed cobras for the reward, increasing the population. When a first-order solution creates a second-order incentive that reverses the original goal. **Explicitly check: does our solution create an incentive for any actor to behave in a way that defeats the solution's purpose?**

---

### Iteration Log

| Date | Error | Prevention Mechanism |
|------|-------|----------------------|
| 2026-04-26 | Initial version. | — |
