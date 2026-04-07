## Daily vendor update — automated

**This PR was opened by the Wang Report pipeline.**
Review the changes below before merging. Your editorial fields are untouched.

---

### Your checklist before merging

- [ ] Data changes look correct and sourced
- [ ] Any news-flagged vendors reviewed
- [ ] If an incident warrants a WR take — written and added to `vendors.json`
- [ ] If RRR rating needs updating — updated in `vendors.json`
- [ ] Grade changes make sense given the underlying data

### To add a WR take before merging

Edit `data/vendors.json` directly in this PR branch and update:
```json
"wr_take": "Your one-sentence practitioner take here.",
"wr_featured": true,
"rrr_react": "B",
"rrr_respond": "C",
"rrr_resilient": "C"
```

Merge when ready. Site deploys automatically via GitHub Pages.
Close without merging to skip this cycle entirely.

---
*Protected fields never auto-updated: `wr_take` · `wr_featured` · `rrr_react/respond/resilient` · `serial`*
