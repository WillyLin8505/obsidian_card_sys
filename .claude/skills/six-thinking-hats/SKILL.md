---
name: six-thinking-hats
description: Parallel thinking skill — separates six cognitive modes into distinct colored hats to prevent ego-defensive argument and generate 360-degree perspective on any problem. Invoked by the Orchestrator when a decision requires multi-angle evaluation or when group thinking is polarized.
license: MIT
compatibility: Standalone thinking model skill; chains into SWOT (White + Black hat findings), First Principles (Green hat deconstruction), or 5 Whys (Black hat root cause) via the Skill Orchestrator.
metadata:
  author: team
  version: "1.0"
  updatedAt: "2026-04-26"
---

# Thinking Model Skill — Six Thinking Hats

> **Orchestrator Routing Trigger (Logic Gate B):** Awaken this Skill when a decision is contested, when multiple stakeholders disagree, or when a problem requires simultaneous evaluation of facts, emotions, risks, and creative options.

---

## Layer 1: Core Definition

A parallel thinking framework created by Edward de Bono that separates six distinct cognitive modes — represented by colored hats — so that all participants think in the same direction at the same time, eliminating adversarial debate and dramatically accelerating decision quality.

**Output feeds into**: SWOT Analysis (White hat facts + Black hat risks map directly to S/W/O/T), or First Principles (Green hat output seeds deconstruction).

---

## Layer 2: Master's Mindset

**Chief Practitioner**: Edward de Bono.

| Hat | Color | Cognitive Mode | Core Question |
|-----|-------|---------------|---------------|
| White Hat | ⬜ | Facts & Data | What do we know? What data is missing? |
| Red Hat | 🟥 | Emotions & Intuition | What does my gut say? What are my fears? |
| Black Hat | ⬛ | Critical Judgment | What can go wrong? What are the risks? |
| Yellow Hat | 🟨 | Optimism & Benefits | What are the best-case outcomes? What value exists? |
| Green Hat | 🟩 | Creativity & Alternatives | What are completely different options? What if we broke the rules? |
| Blue Hat | 🟦 | Process Control | Are we thinking well? What should we do next? |

**Key Insight**: The hats are *roles*, not personalities. Anyone can wear any hat. This divorces ego from position and prevents defensive thinking.

---

## Layer 3: Step-by-Step Execution

**All six hats are mandatory. Order matters — follow the sequence below.**

### Step 1: Blue Hat — Frame the Session

**Action**: Define the focus question, the desired output, and the time budget for each hat.

**Self-Prompt**: *What exactly are we trying to decide? What does a useful output look like?*

> Write the focus question at the top of the output. Every subsequent hat responds to this exact question.

---

### Step 2: White Hat — Establish Facts

**Action**: List only verifiable facts and data. Clearly separate known facts from assumptions. Flag missing data.

**Self-Prompt**: *What do we actually know for certain? What data would we need to be more confident?*

> No opinions, no interpretations. Only observable, verifiable information.

---

### Step 3: Red Hat — Surface Emotions

**Action**: State gut reactions, emotional responses, and instinctive concerns without justification. No reasoning required.

**Self-Prompt**: *How does this feel? What is my immediate emotional response? What am I afraid of?*

> Red hat statements never need to be defended. They simply exist and inform the full picture.

---

### Step 4: Black Hat — Identify Risks

**Action**: Apply rigorous critical judgment. List every potential failure mode, downside, and logical flaw.

**Self-Prompt**: *Why might this fail? What assumptions could be wrong? What is the worst plausible outcome?*

> Black hat is the most valuable hat — overuse it before committing resources. Every risk identified here saves future cost.

---

### Step 5: Yellow Hat — Explore Benefits

**Action**: Identify the best-case outcomes, hidden opportunities, and legitimate reasons for optimism.

**Self-Prompt**: *If this succeeds, what value is created? What opportunity is available that others have missed?*

> Yellow hat must be genuinely explored — do not rush past it to reach Green hat creativity.

---

### Step 6: Green Hat — Generate Alternatives

**Action**: Produce new ideas, unconventional approaches, and creative variations. Quantity over quality at this stage.

**Self-Prompt**: *What completely different approaches exist? What if we did the opposite? What constraint could we remove?*

> Green hat output is raw material — ideas are not judged here. All ideas are listed.

---

### Step 7: Blue Hat — Synthesize & Decide

**Action**: Review all six hats. Identify the key tension (Black vs. Yellow), select the most promising Green hat idea that addresses it, and produce a decision or next-step recommendation.

**Self-Prompt**: *Given everything we have surfaced, what is the most defensible path forward?*

---

## Layer 4: Output Specification

All outputs **must** strictly follow these three mandatory formats.

### Mandatory Format 1 — Six Hat Summary Table

| Hat | Key Finding |
|-----|------------|
| ⬜ White | *(top 2–3 facts or critical data gaps)* |
| 🟥 Red | *(dominant emotional signal — one sentence)* |
| ⬛ Black | *(top 2–3 risks)* |
| 🟨 Yellow | *(top 2–3 benefits)* |
| 🟩 Green | *(top 2–3 alternative ideas)* |
| 🟦 Blue | *(recommended next action — one sentence)* |

### Mandatory Format 2 — Key Tension Statement

One sentence identifying the central tension between the Black hat and Yellow hat findings.

> Example: *"The primary tension is between the speed-to-market benefit (Yellow) and the regulatory compliance risk that could delay launch by 6 months (Black)."*

### Mandatory Format 3 — Recommended Path

One concrete recommendation derived from the Blue hat synthesis, with the single most critical risk mitigation action.

---

## Layer 5: Pitfall Guide & Iteration Log

*(Read by the Orchestrator to prevent errors. Dynamically updated after each review.)*

### Known Blind Spot 1 — Skipping Red Hat

Teams frequently skip the Red hat as "unscientific." This is a mistake. Suppressed emotional signals resurface as passive resistance after a decision is made. **Always complete the Red hat, even briefly.**

### Known Blind Spot 2 — Collapsing Black and Yellow

Mixing critical and optimistic thinking produces mediocre analysis — neither the risks nor the benefits are fully explored. **Never merge two hats into a single thinking step.**

### Known Blind Spot 3 — Green Hat Too Early

Jumping to creative solutions before completing White and Black hats produces ideas disconnected from reality. **Green hat only after facts and risks are fully mapped.**

---

### Iteration Log

| Date | Error | Prevention Mechanism |
|------|-------|----------------------|
| 2026-04-26 | Initial version. | — |
