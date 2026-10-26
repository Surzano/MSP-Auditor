# MSP Auditor — a security check-up for nonprofits and their MSPs

**A zero-setup, privacy-first security auditor that lets a nonprofit verify, in about 15 minutes, whether its Managed Service Provider is actually protecting it. It then writes the help desk tickets and the board briefing for them.**

Built by **Surzano R. Solomon**.

**▶ Live demo: [msp-auditor.vercel.app](https://msp-auditor.vercel.app/?demo=1)**

[![CI](https://github.com/Surzano/MSP-Auditor/actions/workflows/ci.yml/badge.svg)](https://github.com/Surzano/MSP-Auditor/actions/workflows/ci.yml)

`Next.js 15 (App Router)` · `TypeScript` · `Tailwind CSS 4` · `Lucide` · `Node dns.promises` · `DNS-over-HTTPS` · `Vercel / GitHub Pages`

---

## Does it work?

- **Domain checks:** on 25 well-known nonprofit domains, the live scanner agreed with independent DNS lookups and direct header checks on **153 of 153** comparisons (SPF, DMARC and five security headers). Sites that block automated requests are left ungraded rather than failed. Full results: [`validation/domain-results.md`](validation/domain-results.md).
- **User exports:** 133 automated tests, including 27 built from the shapes of real Microsoft 365, Entra and Google Workspace exports, Excel re-saves, damaged files, and an admin center export combined with Entra's MFA report.
- **Answer-key checks:** `npm run validate:tenant` compares the identity audit with a hand-written answer key for a test tenant. See [`validation/README.md`](validation/README.md) to run all three.

## 1. The Problem: The Nonprofit "MSP Blind Spot"

Most small nonprofits outsource IT to a Managed Service Provider and assume that means *"cybersecurity is handled."* In practice, baseline MSP contracts are written for **uptime** (printers work, laptops get imaged, email flows), not for **security outcomes**. In assessments, the same gaps come up again and again:

| What leadership assumes | What we usually find |
|---|---|
| "Our email is protected." | DMARC stuck at `p=none` (monitor-only), SPF `~all`. Anyone can send email as the Executive Director. |
| "Everyone has MFA." | 10–20% of accounts exempt, often a board member and at least one **Global Admin**. |
| "Ex-staff were offboarded." | Former employees still enabled months later, **still holding paid licenses**. |
| "The MSP has strong controls." | No help-desk caller verification, no tested backup restore, no weekend incident call tree. |

The root problem is **vocabulary and leverage**. Executive Directors and boards don't know what to ask for, so they can't hold the MSP accountable. This tool closes that gap. It verifies the controls with evidence, explains each finding in plain English, and produces the exact technical request to send to the MSP.

## 2. What It Does

| Tab | Module | Output |
|---|---|---|
| **1** | **Domain & Website Scanner**: live SPF (with recursive DNS-lookup counting), DMARC policy, DKIM selector probing, HTTPS redirect, and 5 HTTP security headers | A–F grade, pass/warn/fail cards, **Plain-English ⇄ Technical** toggle |
| **2** | **Identity & License Hygiene Auditor**: drag-and-drop Microsoft 365 / Entra ID or Google Workspace user export | MFA coverage %, stale accounts, admin sprawl, **annual license waste in $**, flagged-accounts table |
| **3** | **10-Question MSP Report Card**: Yes / Partial / No scoring with "Why this matters" tooltips | MSP accountability grade + the exact **"What to ask your MSP"** script for every gap |
| **4** | **Action Plan & Ticket Generator** | 3 copy-paste / `mailto:` **MSP help desk tickets** with the exact DNS records, header configs, and usernames, plus a **Board-Ready One-Pager** (Print / Save as PDF) |

**Presentation mode:** the **⚡ Load Full Presentation Demo** button fills all four tabs with the synthetic *Hope Valley Community Services* case study (24 staff, managed by "Apex IT MSP"). Live domain scans from the audience still work. If the room's Wi-Fi blocks DNS, the **Simulated Demo Domain** button gives fully offline results. Deep link: `/?demo=1&tab=action&view=board`.

## 3. System & Privacy Architecture

```
┌──────────────────────────────────── USER'S BROWSER (all sensitive processing) ────────────────────────────────────┐
│                                                                                                                   │
│   Tab 2: User export CSV ──► FileReader ──► RFC-4180 parser ──► header normalizer ──► audit rules ──┐             │
│          (M365 / Google)        (in memory, never uploaded)    (Entra + Google aliases)            │             │
│                                                                                                    ▼             │
│   Tab 3: Scorecard answers ──► React state (in memory) ──────────────────────────────────► Deliverable Engine    │
│                                                                                            • 3 MSP tickets      │
│   Tab 1: Domain name only ─┐                                                       ┌──────►• Board one-pager    │
│                            │                                                       │       • window.print()→PDF │
│                            ▼                                                       │                            │
│                 ┌─────────────────────┐   API unavailable (e.g. GitHub Pages)   ┌──┴─────────────────────┐      │
│                 │ POST /api/scan-domain├──────────── fallback ─────────────────►│ DNS-over-HTTPS resolver│      │
│                 └──────────┬──────────┘                                         │ dns.google → cloudflare│      │
│                            │                                                    └──────────┬─────────────┘      │
└────────────────────────────┼───────────────────────────────────────────────────────────────┼────────────────────┘
                             │ { domain } only, no PII                                       │ public DNS queries only
                             ▼                                                               ▼
              ┌──────────────────────────────────┐                             ┌──────────────────────────────┐
              │ Vercel Serverless (Node runtime) │                             │ Public DoH JSON APIs         │
              │ • sanitize → reject IPs/private  │                             │ TXT · CNAME · MX             │
              │ • dns.promises: TXT/CNAME/MX     │                             └──────────────────────────────┘
              │ • fetch https:// + http:// (6 s) │
              │ • SSRF guard on every redirect   │──► target's PUBLIC website (headers only, body discarded)
              │ • stateless: no DB, no logs kept │
              └──────────────────────────────────┘

   Shared analyzer: src/lib/domain/analyze.ts runs identically on the server (Node dns) and in the browser (DoH),
   so both modes produce the same grades.
```

**Zero-Data-Retention guarantees**

- **User directories and scorecard answers never leave the browser.** There is no database, analytics SDK, or upload endpoint. Refreshing the page erases everything.
- The **only** data sent to a server is a public domain name, used to read public DNS records and public HTTP response headers, the same information any email server or browser sees.
- The scan API is **stateless** and **passive**: one `GET /` per host, response bodies discarded, no port scanning, no crawling.
- **SSRF hardening:** input must be a public hostname (IP literals, `localhost`, `.local`, `.internal` and similar are rejected). Every hostname, including each redirect hop, is resolved and refused if it points to private, loopback, link-local, CGNAT, or multicast space. Only ports 80/443 are used, with a maximum of 5 redirects.

## 4. What Each Check Covers

| Check | Where it lives | How it's implemented |
|---|---|---|
| SPF/DKIM/DMARC Health Checker | Tab 1 | SPF `-all`/`~all`/`?all`/`+all` parsing, multiple-record permerror detection, **recursive RFC 7208 lookup counting (>10 = fail)**; DMARC `p=`, `pct=`, `sp=`, `rua=`; DKIM probing of 14 common selectors (TXT + CNAME) |
| Website Security Grader | Tab 1 | HTTPS reachability, `http→https` redirect, HSTS max-age, CSP (enforced vs report-only vs permissive), X-Frame-Options / `frame-ancestors`, X-Content-Type-Options, Referrer-Policy |
| MFA Coverage Scanner | Tab 2 | Enabled accounts with MFA disabled → coverage %, named in Ticket #2 |
| Stale Account Hunter | Tab 2 | Enabled accounts with no sign-in for >90 days, or never signed in |
| Admin Sprawl Audit | Tab 2 | Global/Super Admin count (warn if >3 or >10% of members); **critical** if any admin lacks MFA |
| License Waste Audit | Tab 2 | Paid licenses on disabled or stale accounts → monthly + **annual $ savings** |
| MSP Report Card (10-Question Grade) | Tab 3 | Yes = 10, Partial/Unsure = 4, No = 0 → A–F |
| Key Questions to Ask MSPs | Tabs 3 & 4 | A "What to ask your MSP" script per question, embedded in Ticket #3 |
| Technical Identity Verification for Help Desks | Tab 3 (Q2) & Ticket #3 | Out-of-band caller verification requirement (push / callback + manager approval) |
| Board-Ready Cyber Risk One-Pager Generator | Tab 4 | Composite A–F grade, top 3 business risks, quick wins, license savings, print-optimized PDF |

## 5. Scoring Methodology

| Area | Weight in composite | Points |
|---|---|---|
| Email & Website Security | 30% | SPF 20 · DMARC 25 · DKIM 15 · HTTPS 10 · HSTS 10 · CSP 8 · XFO 4 · XCTO 4 · Referrer 4. When header checks are unavailable (DoH mode), the score is normalized over the email checks. |
| Identity & License Hygiene | 35% | MFA coverage 40 · stale accounts 20 · admin hygiene 20 · license hygiene 20 |
| MSP Accountability | 35% | 10 questions × 10 points |

Letter grades: **A+** ≥ 97 · **A** ≥ 90 · **B** ≥ 80 · **C** ≥ 70 · **D** ≥ 60 · **F** < 60. Modules that haven't been run are excluded and the remaining weights are re-normalized.

## 6. Quick Start (Local)

Requires **Node.js 20.9+** (Node 22.18+/24 needed only for `npm run sample:csv`).

```bash
git clone https://github.com/Surzano/MSP-Auditor.git
cd MSP-Auditor
npm install
npm run dev            # http://localhost:3000   (try /?demo=1)
```

| Script | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build (includes the `/api/scan-domain` serverless route) |
| `npm run build:pages` | Static export to `out/` for GitHub Pages (DoH fallback mode) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript checks |
| `npm test` | Vitest unit tests for the SPF/DMARC/DKIM/header graders, domain sanitizer, CSV parser, identity audit rules, and scoring (also run in CI on every push) |
| `npm run sample:csv` | Regenerate the synthetic CSVs in `public/` with sign-in dates relative to today |

Test the API directly:

```bash
curl "http://localhost:3000/api/scan-domain?domain=https://www.example.org/donate"
curl -X POST http://localhost:3000/api/scan-domain -H 'content-type: application/json' -d '{"domain":"redcross.org"}'
curl "http://localhost:3000/api/scan-domain?simulate=1"      # offline demo result
```

## 7. Deployment

### Option A: Vercel (recommended, full feature set)

1. Push this repository to GitHub.
2. In Vercel, choose **Add New → Project → Import** this repo. The framework is auto-detected as Next.js and no environment variables are needed.
3. Deploy. `vercel.json` applies the production security headers below to every route.

### Option B: GitHub Pages (static, no backend)

1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Push to `main`. `.github/workflows/deploy-pages.yml` runs `npm run build:pages` with `NEXT_PUBLIC_BASE_PATH=/<repo-name>` and publishes `out/`.
3. On Pages, the Domain Scanner detects that `/api/scan-domain` is missing and queries **`https://dns.google/resolve`** (falling back to **`cloudflare-dns.com`**) directly from the browser. SPF, DMARC, and DKIM work fully. HTTP-header grading is skipped and labeled as such, because browsers can't read another site's response headers (CORS).

### Our own security headers (`vercel.json`)

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `Content-Security-Policy` | `default-src 'self'`; `connect-src` limited to self + the two DoH resolvers; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri`/`form-action 'self'`; `upgrade-insecure-requests` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy`, `Cross-Origin-Opener-Policy` | camera/mic/geolocation/payment disabled; `same-origin` |

Run through the app's own analyzer, this header set earns **40/40 website points**. One trade-off, stated plainly: `script-src` includes `'unsafe-inline'` because the statically rendered App Router emits inline bootstrap scripts. A nonce-based CSP would require middleware and per-request rendering. The scanner reports this as an informational note rather than a failure. Note that a `*.vercel.app` subdomain has no SPF/DMARC of its own, so the email section only scores well on a custom domain you've configured.

## 8. Data Protection Guardrails (for contributors and assessors)

- `.gitignore` blocks **all `*.csv`** files except the two allow-listed synthetic files, plus `*-client-export.csv`, `*-audit-report.*`, spreadsheets, `.env*`, keys, `client-data/`, `exports/`, and `reports/`.
- The repository ships only:
  - `public/sample-hope-valley-users.csv`: 22 **fictional** accounts (4 without MFA incl. 1 Global Admin, 3 dormant ex-staff holding $22/mo licenses = **$792/yr**, 5 Global Admins)
  - `public/blank-user-import-template.csv`: header row only
- All names, addresses, and the `hopevalleycs.org` / `apex-it-msp.example` domains are invented for the demo.
- **Never** commit a real client export. Run the audit, print the one-pager, and close the tab.

## 9. Supported CSV Columns

Headers are matched case- and punctuation-insensitively, so Entra ID and Google Workspace exports work without editing:

| Field | Accepted headers (examples) |
|---|---|
| Name | `displayName`, `Name`, `Full Name` |
| Email | `userPrincipalName`, `Email`, `Primary Email`, `Email Address [Required]` |
| Enabled | `accountEnabled`, `Status` (Active / Suspended / Blocked), `Block credential` |
| MFA | `mfaStatus`, `MFA`, `2SV Enrolled`, `2SV Enforced`, `perUserMfaState` |
| Last sign-in | `lastSignInDateTime`, `Last Sign In`, `Last login time` (ISO or `YYYY/MM/DD`) |
| Role | `role`, `Admin Roles` (Global Admin, Super Admin, Billing Admin, User) |
| License | `licenses`, `Assigned License`, `Assigned Products` |
| Cost | `monthlyCost` (optional, defaults to $22/mo for paid licenses) |
| Type | `accountType` (Member, Guest, Shared/Service) |

## 10. Project Structure

```
src/
├─ app/
│  ├─ api/scan-domain/route.ts   # Node dns + fetch, timeouts, SSRF guard, simulate mode
│  ├─ layout.tsx · page.tsx · globals.css (theme + @media print)
├─ components/
│  ├─ AuditorApp.tsx             # header, step sidebar, privacy footer, state
│  ├─ DomainScanner.tsx · IdentityAuditor.tsx · MspScorecard.tsx · ActionPlan.tsx · ui.tsx
└─ lib/
   ├─ domain/analyze.ts          # SPF/DMARC/DKIM/header analysis + scoring (shared server/browser)
   ├─ domain/clientScan.ts       # API-first, DoH-fallback scanner
   ├─ domain/sanitize.ts · simulated.ts
   ├─ identity.ts                # CSV parser, header mapping, audit rules
   ├─ scorecard.ts               # 10 questions, MSP scripts, ticket actions
   ├─ reports.ts                 # composite grade, tickets, board risks, quick wins
   ├─ sampleData.ts              # synthetic Hope Valley dataset + CSV builders
   └─ **/*.test.ts               # Vitest suites; fixtures are inline strings so no CSV is ever committed
```

## 11. Limitations & Responsible Use

- **Passive, point-in-time checks.** This is a conversation starter for an MSP review, not a penetration test or compliance attestation.
- DKIM discovery probes common selectors only. "Not found" means *verify manually*, not *missing*.
- The identity audit is only as accurate as the export. Per-user MFA state may not reflect Conditional Access policies, so confirm with the MSP.
- Only scan domains you are authorized to assess, or public domains for educational demonstration.

---

*Built with care for the organizations that serve our communities.*
