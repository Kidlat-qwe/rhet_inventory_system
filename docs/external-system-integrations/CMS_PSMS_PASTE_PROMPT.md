# Paste prompt — Update CMS/PSMS for RHET Inventory alignment

## Prefer the self-contained bundle

For the **CMS / PSMS** Cursor chat, paste from:

**[CMS_PSMS_PASTE_BUNDLE.md](./CMS_PSMS_PASTE_BUNDLE.md)**

That file embeds the RHET contract for this pass so CMS does **not** need other RHET `.md` files in its repo.

### Locked decisions (already in the bundle)

| # | Choice |
|---|---|
| Learning Kits | **Block** in Request Stock — uniform alignment only |
| Docs | Embedded in the paste bundle |
| Kit → branch stock | **N/A** (kits blocked) |

---

## Short pointer (optional)

If you only need a reminder of scope:

```markdown
Align CMS Merchandise → RHET stock requests after RHET inventory changes.
Use the paste bundle from RHET docs/external-system-integrations/CMS_PSMS_PASTE_BUNDLE.md.
Decisions: block Learning Kits; fix uniform mapping (Polo ≠ Shirt); keep webhook/Approved By/idempotent fulfill.
Do not ask for missing RHET markdown files — the bundle is complete.
```
