# Security policy

Thank you for taking the time to look. Logits is a small project, so reports
are read by one person — please be patient, and please report privately rather
than opening a public issue.

## Reporting a vulnerability

**Preferred:** open a private advisory through GitHub —
[Security → Report a vulnerability](https://github.com/nexuls/logits/security/advisories/new)
on the repository. That keeps the discussion private until a fix ships.

**Alternative:** email <arifsardar.private@gmail.com> with `SECURITY` in the
subject line.

Please **do not** open a public issue, post the details in a discussion, or
demonstrate the problem against anyone else's hosted copy of Logits.

A useful report has:

- what the issue is and roughly how bad you think it is;
- steps to reproduce — a `.logits.json` document that triggers it is worth more
  than a description of one;
- the browser and version, and the commit or deployment you tested;
- anything you already know about the fix, if you looked.

You will get an acknowledgement as soon as the report is read, and an update on
whether it is accepted once it has been reproduced. If a fix is warranted it
lands on `main` and the advisory is published with credit to you, unless you
would rather stay anonymous. Please give a reasonable window before disclosing
publicly — 90 days is the usual courtesy, less if the fix ships sooner.

There is no bug bounty. This is an unfunded project.

## What is supported

The latest commit on `main`, and whatever is currently deployed from it. Logits
is not released as versioned packages, so older commits do not get backported
fixes — update instead.

## Where the interesting surface is

Logits has **no backend, no accounts and no database**. It is a client-side
application: circuits live in your browser's `localStorage` and in files you
save yourself, nothing is uploaded, and there are no API routes or server
actions. That rules out whole classes of vulnerability, and it means the
surface that does exist is worth knowing:

- **Opening a circuit document.** A `.logits.json` file from someone else is
  untrusted input. It is validated with Zod against the save-format schema in
  `src/lib/circuit/` before it reaches the editor, and older documents run
  through migrations first. A document that gets past validation into a crash,
  a hang, or anything executable is a real finding.
- **Markdown annotations.** Text nodes render user Markdown, sanitized with
  DOMPurify against an allow-list of tags and attributes before it is inserted.
  A payload that survives that sanitizer is a real finding.
- **Simulation runaway.** A circuit that pins the tab is usually just a bad
  circuit — zero-delay oscillation is an expected condition the engine detects
  and reports, see
  [ADR 0005](artifacts/decisions/0005-oscillation-is-zero-delay-churn.md).
  A circuit that defeats that detection and hangs the tab unrecoverably is worth
  reporting as a bug, though not a vulnerability.
- **Dependencies.** Reports of a known CVE in a dependency that is actually
  reachable from application code are welcome. Advisories that only affect dev
  or build tooling are lower priority — say so in the report if you know.

## Out of scope

- Anything requiring the attacker to already control the user's machine,
  browser profile, or `localStorage`.
- Missing security headers, cookie flags or TLS configuration on a deployment
  you do not control — those belong to whoever hosts that copy.
- Social-engineering or phishing scenarios, and self-XSS you have to paste in
  yourself.
- Denial of service against your own browser tab by building a deliberately
  enormous or pathological circuit.
- Automated scanner output with no demonstrated impact.
