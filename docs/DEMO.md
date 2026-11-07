# Judge demo script (about 5 minutes)

**Setup:** API and web are running, data is imported, and you are signed in as **Judge** (`/login`, using the judge access code). Gemini, live news and Solana are *not* required.

## Pitch (1 min)
1. Open `/insights` and lead with the headline finding: only 36% of borrowers survive a 6-month EI layoff, against 70% of non-borrowers. Also show that 35% of all customers would run out within 6 months.
2. In one line: "Clement Core does every number deterministically. Clement Gemini only explains them, and we verify every dollar it writes."

## Live twist (3 min): open `/judge`
1. Type the judge's `account_id` into the selector and press Enter. **Know the customer** shows I, S, F, H, B, P and the baseline runway.
2. Read the twist card and pick the matching preset:
   - *"Laid off, EI 55% for 6 months"* → **Laid off — EI 55% for 6 months**. The verdict says whether they make it and by how much.
   - *"Furnace = a full month of typical spending"* → **Furnace dies**.
   - *"EI 55% + household bills +15%"* → **Job loss (EI 55%) + household bills +15%**.
   - For any other size, drag the sliders. Results update instantly.
3. **Reference check** (bottom left) shows that the README formulas, recomputed independently, match the engine.
4. Walk through the **Goal Plan** (target, gap, monthly amount, time) and the **Backup Plan** (shortfall, best response, actions).
5. Press **Explain the new numbers**. It shows "Clement Gemini" if a key is configured, otherwise "Core template".

For more depth, open `/simulator` (combined shocks, Extended Mode, balance projection) and `/recovery` (milestones, alternatives chart).

## Questions (1 min): likely questions and where to point
- *"Why does your number differ from ours?"* It shouldn't in Judging Mode; show the reference check. Extended Mode differs on purpose (EI weekly cap), and the assumptions are listed.
- *"Where does the world-events part come in?"* Open `/worldpulse`. Official BoC and StatCan releases appear as confirmed events, and **Simulate impact** applies low/medium/high pass-through to the customer.
- *"Is this AI making things up?"* AI output is schema-validated and its dollar figures are verified against Core results. Chat answers label each claim as `[record]`, `[calculated]`, `[retrieved]`, `[interpretation]` or `[hypothetical]`.

## Fallbacks
- No internet: every Tangerine calculation works offline, and WorldPulse shows "no developments retrieved" (never fabricated).
- No Gemini key: explanations use deterministic templates, labelled as such.
