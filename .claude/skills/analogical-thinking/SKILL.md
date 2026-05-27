---
name: analogical-thinking
description: Cross-domain transfer skill — identifies deep structural similarities between a current problem and solved problems in other domains, then transfers the solution logic across the domain boundary. Invoked by the Orchestrator when a problem is novel within its domain but likely solved elsewhere, or when the team is stuck in local optima due to domain-specific assumptions.
license: MIT
compatibility: Standalone thinking model skill; inverts First Principles (instead of stripping to facts, it imports facts from another domain). Chains into SWOT (validate whether the transferred solution creates new Strengths or new Weaknesses in context), or Matrix Analysis (map analogies by structural fidelity × domain proximity).
metadata:
  author: team
  version: "1.0"
  updatedAt: "2026-04-26"
---

# Thinking Model Skill — Analogical Thinking

> **Orchestrator Routing Trigger (Logic Gate I):** Awaken this Skill when a problem has no obvious solution within its own domain, when the team is deadlocked by local assumptions, or when prior art from adjacent fields might provide a breakthrough that in-domain experts are too close to see.

---

## Layer 1: Core Definition

A cognitive strategy that identifies the **deep relational structure** shared between a source domain (where a problem is already solved) and a target domain (where the problem is unsolved), then transfers the solution logic — not the surface features — across the domain boundary. The key distinction: surface analogy (it *looks* similar) vs. structural analogy (it *works* similarly).

**Output feeds into**: SWOT Analysis (validate the transferred solution against local constraints), or First Principles (use the analogy to build a hypothesis, then deconstruct it for absolute validity).

---

## Layer 2: Master's Mindset

**Chief Practitioners**: Gordon (Synectics), Gentner (Structure-Mapping Theory), TRIZ practitioners.

| Concept | Description |
|---------|-------------|
| **Surface similarity** | Two things look alike (dangerous — misleads) |
| **Structural similarity** | Two things have the same relationship pattern (powerful — transfers) |
| **Source domain** | The domain where the solution already exists |
| **Target domain** | The domain where the problem needs solving |
| **Mapping** | The explicit correspondence between elements in source and target |
| **Adaptation** | Modifying the transferred solution to fit target domain constraints |

**Key Insight**: The best analogies come from *distant* domains, not adjacent ones. A software architecture problem solved by borrowing from biology (immune system → fault-tolerant microservices) transfers more novel insight than borrowing from a similar software system.

### Distance Spectrum

```
Same domain → Adjacent domain → Same industry → Different industry → Different field → Biology/Physics/Math
[Lowest novelty]                                                                        [Highest novelty]
```

---

## Layer 3: Step-by-Step Execution

**All five steps are mandatory. Mapping validation (Step 3) is the analytical core — without it, surface analogies masquerade as structural ones.**

### Step 1: Abstract the Target Problem

**Action**: Strip the current problem of its domain-specific language. Describe it using only relational and functional terms.

**Self-Prompt**: *What is the underlying challenge in abstract terms? What relationship pattern needs to be solved? What function needs to be achieved?*

> Bad abstraction: "We need to grow our SaaS user base."
> Good abstraction: "We need to accelerate adoption of a new behavior by a large population of independent actors with low immediate incentive to change."

---

### Step 2: Search for Source Analogies

**Action**: Given the abstract problem statement, search for domains where this functional pattern is already solved. Cast the net wide — include biology, military strategy, urban planning, ecology, physics, and game design.

**Self-Prompt**: *Where else in the world does something need to [abstract function]? Who has solved the problem of [relational pattern] in a completely different context?*

**Productive search domains**:
- Biology: immune systems, ant colonies, evolutionary adaptation, neural architecture
- Military: logistics, asymmetric warfare, intelligence networks, supply chain under fire
- Urban design: traffic flow, zoning, public space activation, infrastructure resilience
- Ecology: keystone species, nutrient cycling, invasive species dynamics
- Physics: phase transitions, resonance, entropy, feedback loops
- Game design: onboarding, progression curves, reward schedules, emergent behavior

---

### Step 3: Map the Structural Correspondence

**Action**: For the best candidate analogy, explicitly map each element of the source domain to the corresponding element in the target domain. Validate that the *relationships* hold, not just the surface labels.

**Mapping Template**:

| Source Domain Element | Relationship | Target Domain Element | Relationship holds? |
|-----------------------|-------------|----------------------|-------------------|
| *(source element A)* | *(relates to)* | *(target element A')* | ✓ / ✗ |
| *(source element B)* | *(relates to)* | *(target element B')* | ✓ / ✗ |
| *(source mechanism)* | *(produces)* | *(target desired outcome)* | ✓ / ✗ |

**Self-Prompt**: *Does the solution mechanism in the source domain map to a plausible mechanism in the target domain? Or am I forcing a surface resemblance?*

> If more than two mapping rows fail the ✓ test, this analogy is surface-level. Discard it and return to Step 2.

---

### Step 4: Transfer and Adapt the Solution

**Action**: Apply the solution logic from the source domain to the target domain. Then identify which elements of the source solution cannot transfer directly — these require adaptation or local redesign.

**Self-Prompt**: *What specifically does the source domain's solution do that produces the desired result? How would we implement the equivalent mechanism in our domain? What constraints in our domain prevent direct transfer?*

---

### Step 5: Validate the Transfer

**Action**: Identify the single most critical assumption in the analogy — the mapping element most likely to break down in the target domain. Design a minimal test to validate that assumption before committing resources.

**Self-Prompt**: *If this analogy is wrong, what is the most likely way it fails? What is the cheapest way to test whether the structural mapping holds in our domain?*

---

## Layer 4: Output Specification

All outputs **must** strictly follow these three mandatory formats.

### Mandatory Format 1 — Analogy Map Table

| Source Domain Element | ↔ | Target Domain Element | Structural Fidelity (High / Med / Low) |
|-----------------------|---|----------------------|---------------------------------------|
| *(element)* | ↔ | *(element)* | *(H / M / L)* |
| *(mechanism)* | ↔ | *(mechanism)* | *(H / M / L)* |
| *(outcome)* | ↔ | *(desired outcome)* | *(H / M / L)* |

### Mandatory Format 2 — Transferred Solution Proposal

Describe the solution as adapted to the target domain. Include: what changes in the target domain, what mechanism produces the desired result, and what cannot be transferred directly.

### Mandatory Format 3 — Critical Assumption Test

State the single most likely failure point of the analogy and the minimal experiment to validate it before full commitment.

> Example: *"The critical assumption is that our users, like ants, will follow pheromone trails (social proof signals). This fails if users in our domain make individualistic rather than social decisions. Test: A/B test a social proof indicator on the onboarding screen with 100 users and measure conversion rate difference."*

---

## Layer 5: Pitfall Guide & Iteration Log

### Known Blind Spot 1 — Surface Analogy Seduction

Analogies that share surface vocabulary ("our product is like Uber for X") feel convincing but often have no structural validity. **Always complete the mapping table. If the relationships don't hold, the analogy doesn't hold.**

### Known Blind Spot 2 — Forcing the Transfer

When a beautiful source analogy fails the mapping test, analysts often rationalize the failure rather than discard the analogy. **Structural fidelity is binary at each row. Two or more Low-fidelity rows = invalid analogy. Discard without regret.**

### Known Blind Spot 3 — Stopping at the Analogy

The analogy is a generator of hypotheses, not a solution. **The output of analogical thinking is a structured hypothesis that must be validated by evidence in the target domain.**

---

### Iteration Log

| Date | Error | Prevention Mechanism |
|------|-------|----------------------|
| 2026-04-26 | Initial version. | — |
