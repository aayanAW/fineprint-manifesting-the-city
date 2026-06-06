# Hackathon rules & judging — BOTH events

fineprint is being entered in TWO hackathons. Optimize the build for both rule sets. This file is the source of truth for their requirements (the SpacetimeDB rules came from the event Discord; the AI×Sustainability details from the event page — neither is reachable by a web fetch, so they're transcribed here).

## 1) SpacetimeDB Launchpad NYC 2026  (Fri 9 PM → Sun 10 AM)

**Rules**
1. Teams of 1–6 (prizes split equally among registered members).
2. At most 1 team per person.
3. **You may only use your own code that you wrote or generated DURING the hackathon.** ← critical; see "Constraints to respect" below.
4. Up to 2 project submissions per team.
5. Submit by **10 AM Sunday**.
6. Hacking must be done physically at the venue.
7. Submission must include: team name, members, repo link, demo app link (hosted or downloadable), and a list of third-party APIs/libraries/services/assets used.
8. Code of conduct (no harassment, plagiarism, sabotage/cheating, etc.).

**Prize tracks**
- $3,000 Grand prize — most impressive overall use of SpacetimeDB
- $1,000 Best web app
- $1,000 Best use of AI — best combination of SpacetimeDB + AI/LLMs
- $1,000 Best game
- $1,000 Scrabblebot champion (a separate bot tournament — NOT relevant to fineprint)
- $750 Best student submission ← we likely qualify
- Mac Mini — Best solo dev

**Prize requirements (mandatory)**
- SpacetimeDB is the PRIMARY backend technology.
- The submitted app is hosted and working.
- Source code is clean and intelligible.

**Bonus points**
- Heavily real-time.
- Beautiful.
- Clever / novel use of SpacetimeDB.
- SpacetimeDB used in combination with LLMs / agents.

**Resources**
- Skills: https://www.skills.sh/clockworklabs/spacetimedb  (`npx skills add clockworklabs/spacetimedb`)
- Templates: https://spacetimedb.com/templates
- Docs: https://spacetimedb.com/docs
- Free cloud credits: code `LAUNCHPADNYC26` at https://spacetimedb.com/redeem
- Submit via DevSpot: https://spacetimedb.devspot.app/

## 2) Manifesting a Better City: AI × Sustainability — #NYTechWeek  (Sat Jun 6, 12:30–3:30 PM)

- Hosted by Youth Civic Service Inc. (co-hosted by Futuris). Paramount Building, 1501 Broadway, NYC.
- Open to everyone, no experience required (engineers, designers, students, organizers, policy).
- **Teams up to 4. ~3 hours to build, then present to judges from CMU, CalTech, Columbia & Stanford.**
- Theme: AI-powered solutions to real urban sustainability challenges — energy efficiency, green infrastructure, waste, climate resilience.
- Judged on real-world impact, equity, and genuine (non-wrapper) use of AI.

## Constraints to respect (important)

- **STDB rule 3 — code written DURING the hackathon.** The pre-existing verified LL97 engine from the original fineprint was written before this event. To be safe for the STDB submission, **re-build / re-derive that logic during the hackathon** (the constants are public — re-transcribe from the codified rule `1 RCNY §103-14` + the DOB methodology) rather than copy-pasting the old repo. Confirm the organizers' interpretation if unsure.
- **STDB = primary backend.** SpacetimeDB must be the core, not a side cache.
- **Hosted, working, clean.** Deploy the STDB module (use the free credits) and keep the repo intelligible.
- **Two very different formats.** AI×Sustainability is a short 3-hour event (the polished original fineprint is the natural entry there); the SpacetimeDB ops-room is the weekend build. "One product for both" = shared vision, but respect each event's rules and timeline — they are not the same deliverable.
