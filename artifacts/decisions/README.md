# Decision records

One file per decision: `NNNN-short-title.md`. Append-only — to reverse a
decision, add a new ADR and set the old one's status to `Superseded by NNNN`.

Template:

```md
# NNNN. Title

Status: Accepted | Superseded by NNNN
Date: YYYY-MM-DD

## Context
What forced a choice.

## Decision
What we do.

## Consequences
What this costs us, and what it rules out.
```
