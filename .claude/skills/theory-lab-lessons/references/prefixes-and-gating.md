# Slug prefixes, categories and gating

| Prefix | Category | Audience | Rules |
|---|---|---|---|
| (none) | numbered topic categories 0–27 | everyone | ordinary lesson |
| `primer-` | "0 · Math Primer" (4 lessons) | everyone, Beginner | part of the shared path core; hub uses `<div class="tl-cat primer">` |
| `foundation-` | "Foundation Mathematics" (5, GCSE level) | everyone, Beginner | — |
| `data-` | naming inside "24 · Institutional Data Engineering" | — | no special handling |
| `institutional-` | Institutional Methods, categories 28–37 (60 files) | **admin only** when auth is on | hub blocks inside `<!-- INSTITUTIONAL:START/END -->` with `data-level="advanced" data-institutional="1"` and an amber Advanced pill; server returns 404 to non-admins and strips the blocks. **Never** in shared `paths-data.js` (test fails); doesn't load the paths scripts |
| `action-` | "From Analysis to Action" (8) | **admin only** | hub category DESK-wrapped; 404 to non-admins; excluded from `deskStrip.test`, so desk talk is allowed in the body; on paths only via `paths-admin.js`; may have a page-local `<style>` with `tp-*` classes |
| `-micro` suffix | Visual Guide twin | page loads for anyone linked to it | with `HIDE_MICRO_EDUCATION` (the default), non-admins don't see the hub ⚡ badges, the mode toggle, or the "Prefer pictures to prose?" callout (removed by regex) |

Gating lives in `server.js` (the Theory Lab section, around lines 641–740 and 35380–35480).

Status badges: `tl-status concept` (172 lessons), `course` (3, plus all cog lessons), `candidate` (1).

`cog/lessons/*.html` share `theory.css` and the style guide but live outside `theory-lab/`, and have their own hub
(`cog/hub.html`). See the `cog-knowledge` skill.
