---
name: game-theory
description: Strategic interaction skill — models competitive and cooperative situations as payoff matrices to identify dominant strategies, Nash equilibria, and coordination mechanisms. Invoked by the Orchestrator when a decision involves multiple rational actors whose outcomes depend on each other's choices.
license: MIT
compatibility: Standalone thinking model skill; receives Threat inputs from SWOT (T quadrant → model as opponent payoffs), chains into Second-order Thinking (equilibrium → anticipate opponent's adaptation), or Matrix Analysis (payoff matrix construction).
metadata:
  author: team
  version: "1.0"
  updatedAt: "2026-04-26"
---

# Thinking Model Skill — Game Theory

> **Orchestrator Routing Trigger (Logic Gate G):** Awaken this Skill when a decision involves two or more rational actors whose payoffs depend on each other's choices — pricing wars, negotiation, platform competition, standards adoption, talent bidding, or any situation where "what they do depends on what we do, and vice versa."

---

## Layer 1: Core Definition

A mathematical framework for analyzing strategic interactions among rational decision-makers. The core insight: optimal decisions cannot be made in isolation — they depend on predicting opponent behavior, which itself depends on predicting your behavior. Game Theory provides structured tools to resolve this circularity and identify stable, predictable outcomes (equilibria).

**Output feeds into**: Second-order Thinking (model how equilibrium shifts when one player adapts), or Matrix Analysis (prioritize strategic moves by payoff dominance).

---

## Layer 2: Master's Mindset

**Chief Practitioners**: John von Neumann, John Nash, Thomas Schelling.

### Core Concepts

| Concept | Definition | Business Application |
|---------|-----------|---------------------|
| **Payoff Matrix** | A table showing outcomes for all combinations of player choices | Visualize competitive scenarios |
| **Dominant Strategy** | A choice that produces the best payoff regardless of what the opponent does | Identify safe, unconditional moves |
| **Nash Equilibrium** | A state where no player can improve their outcome by changing strategy unilaterally | Predict stable competitive outcomes |
| **Prisoner's Dilemma** | Both players defect despite mutual cooperation being Pareto superior | Diagnose why competitors race to the bottom |
| **Coordination Game** | Both players benefit from aligning on the same choice | Design standards, platforms, ecosystems |
| **Zero-sum vs. Non-zero-sum** | Fixed vs. expandable total payoff | Detect whether competition is destructive or value-creating |

---

## Layer 3: Step-by-Step Execution

**All five steps are mandatory. Step 3 (equilibrium identification) is the analytical core.**

### Step 1: Define the Players and their Choice Sets

**Action**: Identify all relevant players. For each player, list the discrete strategy options available to them.

**Self-Prompt**: *Who are the decision-makers whose choices materially affect our outcomes? What are their available moves (not their hypothetical moves — what can they actually do)?*

> Limit the initial model to 2 players and 2 strategies each (2×2 matrix). Complexity can be added after the core dynamics are understood.

---

### Step 2: Estimate Payoffs

**Action**: For each combination of strategies, estimate the payoff for each player. Payoffs can be revenue, market share, reputation, or any ordinal ranking.

**Self-Prompt**: *If we choose A and they choose X, what is our outcome? What is their outcome? Repeat for all combinations.*

**2×2 Payoff Matrix Template**:

|  | **Opponent: Strategy X** | **Opponent: Strategy Y** |
|--|--------------------------|--------------------------|
| **Us: Strategy A** | Us: [payoff], Them: [payoff] | Us: [payoff], Them: [payoff] |
| **Us: Strategy B** | Us: [payoff], Them: [payoff] | Us: [payoff], Them: [payoff] |

---

### Step 3: Identify Dominant Strategies and Nash Equilibrium

**Action**: For each player, check if one strategy dominates the other regardless of opponent's choice (dominant strategy). Then identify Nash Equilibria — cells where neither player would unilaterally deviate.

**Self-Prompt**: *Is there a strategy that is always best for us, no matter what they do? Is there a cell where both players are playing their best response to each other?*

**Nash Equilibrium Test**: A cell (A, X) is a Nash Equilibrium if:
- Our payoff in (A,X) ≥ our payoff in (B,X) — we don't want to switch from A given they play X
- Their payoff in (A,X) ≥ their payoff in (A,Y) — they don't want to switch from X given we play A

---

### Step 4: Classify the Game Type

**Action**: Determine which classic game structure best describes the situation.

| Game Type | Signature | Implication |
|-----------|-----------|-------------|
| **Prisoner's Dilemma** | Mutual defection is Nash Equilibrium but mutual cooperation is Pareto superior | Need binding commitment mechanism or repeated interaction to escape |
| **Coordination Game** | Multiple Nash Equilibria exist; players prefer the same one | Need focal point (Schelling point) or explicit coordination |
| **Competitive Zero-sum** | One player's gain = other's loss | No cooperative solution; focus on dominant strategies |
| **Stag Hunt** | Cooperation is best but risky; defection is safe | Need credible commitment to enable cooperation |

---

### Step 5: Derive Strategic Recommendations

**Action**: Based on the equilibrium analysis, recommend the optimal strategy. If the equilibrium is undesirable (e.g., Prisoner's Dilemma), recommend a mechanism to change the game structure.

**Self-Prompt**: *Given the equilibrium, what is our best move? If the equilibrium is bad for both players, what contract, commitment, or communication mechanism could shift the game?*

---

## Layer 4: Output Specification

All outputs **must** strictly follow these three mandatory formats.

### Mandatory Format 1 — Payoff Matrix

|  | **[Opponent Strategy X]** | **[Opponent Strategy Y]** |
|--|--------------------------|--------------------------|
| **[Our Strategy A]** | Us: [value], Them: [value] | Us: [value], Them: [value] |
| **[Our Strategy B]** | Us: [value], Them: [value] | Us: [value], Them: [value] |

*(Mark Nash Equilibrium cells with ★)*

### Mandatory Format 2 — Equilibrium Analysis

| Finding | Description |
|---------|-------------|
| Our dominant strategy | *(if exists, state it; if not, state "no dominant strategy")* |
| Opponent's dominant strategy | *(same)* |
| Nash Equilibrium | *(cell coordinates + payoffs)* |
| Game type | *(Prisoner's Dilemma / Coordination / Zero-sum / Stag Hunt / Other)* |

### Mandatory Format 3 — Strategic Recommendation

One concrete strategic move derived from the equilibrium analysis, with the mechanism to handle any dilemma (if the equilibrium is suboptimal).

---

## Layer 5: Pitfall Guide & Iteration Log

### Known Blind Spot 1 — Assuming Pure Rationality

Real players have biases, emotions, and incomplete information. **Use game theory to identify the rational baseline, then adjust for known behavioral deviations. Do not treat the model as a prediction.**

### Known Blind Spot 2 — Ignoring Repeated Games

In one-shot games, defection often dominates. In repeated games, cooperation can emerge through reputation and reciprocity. **Always ask: is this a one-shot interaction or an ongoing relationship? The answer fundamentally changes the equilibrium.**

### Known Blind Spot 3 — Forgetting to Change the Game

When the Nash Equilibrium is bad for all players (e.g., price war), the solution is not to play the game better — it is to change the game structure (contracts, signaling, pre-commitment, market design). **Identifying a bad equilibrium is the beginning of the analysis, not the end.**

---

### Iteration Log

| Date | Error | Prevention Mechanism |
|------|-------|----------------------|
| 2026-04-26 | Initial version. | — |
