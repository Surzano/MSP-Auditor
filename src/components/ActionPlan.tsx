"use client";

import {
  AlertOctagon,
  Banknote,
  Building2,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Landmark,
  Lock,
  Mail,
  Printer,
  ShieldCheck,
  Ticket as TicketIcon,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { DBIR, dbirComparison, dbirHeadline, type DbirRow } from "@/lib/dbir";
import { formatUsd, gradeTone, toneClasses } from "@/lib/grading";
import { boardRisks, compositeScore, generateTickets, mailtoHref, quickWins, type AuditContext, type BoardRisk, type Ticket } from "@/lib/reports";
import type { OrgProfile } from "@/lib/sampleData";
import { Button, Card, EmptyState, SectionTitle, cx } from "./ui";

type View = "tickets" | "board";

export function ActionPlan({ ctx, onOrgChange, view: sub, onViewChange: setSub }: { ctx: AuditContext; onOrgChange: (o: OrgProfile) => void; view: View; onViewChange: (v: View) => void }) {
  const tickets = useMemo(() => generateTickets(ctx), [ctx]);
  const composite = useMemo(() => compositeScore(ctx), [ctx]);

  function print() {
    setSub("board");
    // Let React paint the one-pager before opening the print dialog.
    setTimeout(() => window.print(), 150);
  }

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <SectionTitle
          step={4}
          title="Tickets & board brief"
          subtitle="Everything from steps 1–3, written up as help desk tickets you can send your MSP as-is, plus a one-page brief your board can read in two minutes."
        />
        <OrgEditor org={ctx.org} onChange={onOrgChange} />
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-md bg-stone-200/70 p-1">
            {(
              [
                ["tickets", "Help desk tickets", TicketIcon],
                ["board", "Board one-pager", Landmark],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                onClick={() => setSub(k)}
                className={cx("inline-flex items-center gap-1.5 rounded px-4 py-2 text-sm font-semibold transition", sub === k ? "bg-paper text-stone-900" : "text-stone-600 hover:text-stone-900")}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
          <Button variant="dark" onClick={print} disabled={composite.score === null}>
            <Printer className="h-4 w-4" /> Print or save as PDF
          </Button>
        </div>
      </div>

      {sub === "tickets" ? (
        <div className="space-y-5 print:hidden">
          {composite.score !== null && <DbirPanel ctx={ctx} />}
          {tickets.map((t) => (
            <TicketCard key={t.id} t={t} mspEmail={ctx.org.mspEmail} />
          ))}
        </div>
      ) : composite.score === null ? (
        <EmptyState icon={<Landmark className="h-6 w-6" />} title="Nothing to brief yet">
          Finish at least one step first, or load the sample data from the sidebar.
        </EmptyState>
      ) : (
        <BoardOnePager ctx={ctx} composite={composite} />
      )}
    </div>
  );
}

function OrgEditor({ org, onChange }: { org: OrgProfile; onChange: (o: OrgProfile) => void }) {
  const field = (key: keyof OrgProfile, label: string, type = "text") => (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold tracking-wide text-stone-500 uppercase">{label}</span>
      <input
        type={type}
        // Show an empty box instead of 0 so typing replaces it rather than producing "05".
        value={type === "number" && !org[key] ? "" : org[key]}
        placeholder={type === "number" ? "0" : undefined}
        min={type === "number" ? 0 : undefined}
        onChange={(e) => onChange({ ...org, [key]: type === "number" ? Number(e.target.value) : e.target.value })}
        className="rounded border border-stone-300 px-3 py-2 text-sm outline-none focus:border-moss-500 focus:ring-4 focus:ring-moss-500/15"
      />
    </label>
  );
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-stone-800">
        <Building2 className="h-4 w-4" /> Organization details <span className="font-normal text-stone-500">(used in the tickets and the one-pager)</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {field("orgName", "Organization")}
        {field("staffCount", "Staff", "number")}
        {field("mspName", "MSP name")}
        {field("mspEmail", "MSP help desk email", "email")}
        {field("preparedBy", "Prepared by")}
      </div>
    </Card>
  );
}

const PRIORITY_CLS: Record<Ticket["priority"], string> = {
  Critical: "bg-brick-600 text-white",
  High: "bg-ochre-400 text-ink-950",
  Medium: "bg-stone-200 text-stone-700",
};

function TicketCard({ t, mspEmail }: { t: Ticket; mspEmail: string }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(true);

  async function copy() {
    const text = `Subject: ${t.subject}\n\n${t.body}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 bg-stone-50 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-ink-900 font-mono text-sm font-bold text-moss-300">#{t.id}</div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-stone-900">{t.title}</h3>
              {t.ready && <span className={cx("rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide uppercase", PRIORITY_CLS[t.priority])}>{t.priority}</span>}
              {t.ready && <span className="text-xs text-stone-500">{t.findingCount} finding{t.findingCount === 1 ? "" : "s"}</span>}
            </div>
          </div>
        </div>
        {t.ready && (
          <div className="flex flex-wrap gap-2">
            <Button variant={copied ? "primary" : "dark"} onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy ticket"}
            </Button>
            <a
              href={mailtoHref(mspEmail, t)}
              className="inline-flex items-center gap-2 rounded-md bg-paper px-4 py-2 text-sm font-semibold text-stone-800 ring-1 ring-stone-300 ring-inset hover:bg-stone-50"
            >
              <Mail className="h-4 w-4" /> Open in email
            </a>
            <button onClick={() => setOpen(!open)} className="rounded p-2 text-stone-500 hover:bg-stone-100" aria-label={open ? "Collapse ticket" : "Expand ticket"}>
              <ChevronDown className={cx("h-4 w-4 transition", !open && "-rotate-90")} />
            </button>
          </div>
        )}
      </div>
      {!t.ready ? (
        <div className="px-5 py-6 text-sm text-stone-500">{t.emptyReason}</div>
      ) : (
        open && (
          <div className="p-5">
            <div className="mb-2 text-xs text-stone-500">
              <b className="text-stone-700">To:</b> {mspEmail || "(your MSP help desk)"} &nbsp;·&nbsp; <b className="text-stone-700">Subject:</b> {t.subject}
            </div>
            <pre className="ticket-body max-h-[460px] overflow-auto rounded-md border border-stone-200 bg-stone-50 p-4 whitespace-pre-wrap text-stone-800">{t.body}</pre>
          </div>
        )
      )}
    </Card>
  );
}

const DBIR_STATUS: Record<DbirRow["status"], { label: string; cls: string }> = {
  exposed: { label: "Open", cls: "bg-brick-600 text-white" },
  partial: { label: "Partial", cls: "bg-ochre-400 text-ink-950" },
  covered: { label: "Covered", cls: "bg-moss-600 text-white" },
  unknown: { label: "Not checked", cls: "bg-stone-200 text-stone-600" },
};

function DbirRows({ rows, compact }: { rows: DbirRow[]; compact?: boolean }) {
  return (
    <ul className="divide-y divide-stone-100 rounded-md border border-stone-200">
      {rows.map((r) => (
        <li key={r.key} className={cx("print-avoid-break grid items-start gap-x-4 gap-y-1 sm:grid-cols-[4.5rem_1fr_1fr_auto]", compact ? "px-3 py-2" : "px-4 py-3")}>
          <div className={cx("font-serif leading-none font-semibold text-ink-950 tabular-nums", compact ? "text-2xl" : "text-3xl")}>{r.stat}</div>
          <div className={cx("leading-snug text-stone-600", compact ? "text-[11.5px]" : "text-sm")}>{r.fact}</div>
          <div className={cx("leading-snug font-semibold text-stone-800", compact ? "text-[11.5px]" : "text-sm")}>
            <span className="font-normal text-stone-500">Our result: </span>
            {r.finding}
          </div>
          <span className={cx("justify-self-start rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide whitespace-nowrap uppercase sm:justify-self-end", DBIR_STATUS[r.status].cls)}>{DBIR_STATUS[r.status].label}</span>
        </li>
      ))}
    </ul>
  );
}

function DbirSource({ className }: { className?: string }) {
  return (
    <p className={cx("text-[11px] text-stone-500", className)}>
      Source:{" "}
      <a href={DBIR.url} target="_blank" rel="noreferrer" className="underline decoration-stone-300 underline-offset-2 hover:text-stone-700">
        {DBIR.edition}
      </a>{" "}
      ({DBIR.period}).
    </p>
  );
}

/** Tickets view: why these tickets matter now, and what to do next. */
function DbirPanel({ ctx }: { ctx: AuditContext }) {
  const rows = dbirComparison(ctx);
  const open = rows.filter((r) => r.status === "exposed" || r.status === "partial").length;
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-stone-100 bg-stone-50 px-5 py-4">
        <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] text-brick-700 uppercase">
          <AlertOctagon className="h-4 w-4" /> Why this can&apos;t wait
        </div>
        <h3 className="mt-1 font-serif text-xl font-semibold text-ink-950">Your results next to how real breaches happened</h3>
        <p className="mt-1 text-sm text-stone-600">{dbirHeadline(rows, "tickets")}</p>
      </div>
      <div className="space-y-3 p-5">
        <DbirRows rows={rows} />
        <DbirSource />
        {open > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-ink-900 px-5 py-4 text-white">
            <div>
              <div className="font-semibold">Send these tickets to {ctx.org.mspName} this week.</div>
              <div className="text-sm text-stone-300">Ask for written confirmation of each fix within 30 days, then re-run this audit to prove it.</div>
            </div>
            <a
              href={DBIR.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-moss-300 ring-1 ring-moss-300/40 ring-inset hover:bg-white/5"
            >
              Read the report <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
      </div>
    </Card>
  );
}

const LEVEL_CLS: Record<BoardRisk["level"], string> = {
  High: "bg-brick-600 text-white",
  Elevated: "bg-ochre-400 text-ink-950",
  Low: "bg-moss-600 text-white",
  "Not assessed": "bg-stone-200 text-stone-600",
};

function BoardOnePager({ ctx, composite }: { ctx: AuditContext; composite: ReturnType<typeof compositeScore> }) {
  const risks = boardRisks(ctx);
  const wins = quickWins(ctx);
  const dbir = dbirComparison(ctx);
  const tone = toneClasses[gradeTone(composite.grade)];
  const savings = ctx.identity?.annualWaste ?? 0;
  const highCount = risks.filter((r) => r.level === "High").length;
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const org = ctx.org.orgName;
  const possessive = /s$/i.test(org) ? `${org}'` : `${org}'s`;
  const msp = ctx.org.mspName || "our MSP";
  const areas = highCount === 0 ? "several risk areas need" : highCount === 1 ? "one risk area needs" : `${["two", "three"][highCount - 2] ?? highCount} risk areas need`;

  const bottomLine =
    composite.score! >= 90
      ? `${possessive} core cyber protections are in good shape. The priority now is keeping them verified as staff, vendors and systems change.`
      : composite.score! >= 70
        ? `${org} has a reasonable foundation, but ${areas} attention. Most fixes are configuration changes that ${msp} can make within 30 days at little or no cost.`
        : `${org} faces preventable fraud and ransomware risks that ${msp} has not confirmed it protects against. The good news is that most fixes are low-cost configuration changes that can be completed within 30 days.`;

  return (
    <article id="board-one-pager" className="animate-fade-up mx-auto max-w-[8.5in] rounded-md border border-stone-200 bg-paper p-8 sm:p-10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink-900 pb-5">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] text-moss-700 uppercase">
            <ShieldCheck className="h-4 w-4" /> Board cyber risk briefing
          </div>
          <h1 className="mt-1 font-serif text-3xl font-semibold text-ink-950">{ctx.org.orgName}</h1>
          <div className="mt-1 text-sm text-stone-600">
            {ctx.org.staffCount} staff · IT managed by {ctx.org.mspName} · {date}
          </div>
        </div>
        <div className="text-right text-xs text-stone-500">
          <div className="font-semibold text-stone-700">Prepared by</div>
          <div>{ctx.org.preparedBy}</div>
          <div className="mt-2 inline-block rounded border border-stone-300 px-2 py-0.5 text-[10px] font-bold tracking-widest text-stone-500 uppercase">Confidential — Board Use</div>
        </div>
      </header>

      <section className="print-avoid-break mt-6 grid gap-6 sm:grid-cols-[auto_1fr]">
        <div className={cx("flex flex-col items-center justify-center rounded-md px-8 py-5 ring-2 ring-inset", tone.bg, tone.ring)}>
          <div className="text-[11px] font-bold tracking-widest text-stone-500 uppercase">Overall grade</div>
          <div className={cx("font-serif text-7xl leading-none font-semibold", tone.text)}>{composite.grade}</div>
          <div className="mt-1 text-sm font-semibold text-stone-600 tabular-nums">{composite.score} / 100</div>
        </div>
        <div className="flex flex-col justify-center gap-3">
          <p className="text-[15px] leading-relaxed text-stone-800">
            <b>Bottom line: </b>
            {bottomLine}
          </p>
          <div className="space-y-2">
            {composite.parts.map((p) => (
              <div key={p.key} className="flex items-center gap-3 text-sm">
                <div className="w-48 shrink-0 text-stone-600">{p.label}</div>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                  <div className={cx("h-full rounded-full", toneClasses[gradeTone(p.grade)].solid)} style={{ width: `${p.score ?? 0}%` }} />
                </div>
                <div className="w-20 text-right text-xs font-semibold text-stone-700 tabular-nums">{p.score === null ? "Not assessed" : `${p.grade} · ${p.score}`}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-7">
        <h2 className="flex items-center gap-2 text-sm font-bold tracking-wide text-ink-900 uppercase">
          <AlertOctagon className="h-4 w-4 text-brick-600" /> Top 3 business risks
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {risks.map((r) => (
            <div key={r.key} className="print-avoid-break rounded-md border border-stone-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm leading-snug font-bold text-stone-900">{r.title}</h3>
                <span className={cx("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase", LEVEL_CLS[r.level])}>{r.level}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-stone-600">{r.narrative}</p>
              {r.drivers.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-stone-100 pt-2 text-[11.5px] text-stone-700">
                  {r.drivers.slice(0, 4).map((d) => (
                    <li key={d} className="flex gap-1.5">
                      <span className="text-brick-500">▸</span>
                      {d}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-7">
        <h2 className="flex items-center gap-2 text-sm font-bold tracking-wide text-ink-900 uppercase">
          <TrendingUp className="h-4 w-4 text-brick-600" /> How we compare to the {DBIR.short}
        </h2>
        <p className="mt-1 text-xs text-stone-600">{dbirHeadline(dbir, "board")}</p>
        <div className="mt-3">
          <DbirRows rows={dbir} compact />
        </div>
        <DbirSource className="mt-1.5" />
      </section>

      <section className="print-avoid-break mt-7 grid gap-5 sm:grid-cols-[1fr_220px]">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold tracking-wide text-ink-900 uppercase">
            <Zap className="h-4 w-4 text-ochre-500" /> Quick wins for the next 30 days
          </h2>
          <ol className="mt-3 divide-y divide-stone-100 rounded-md border border-stone-200">
            {wins.map((w, i) => (
              <li key={w.title} className="flex items-start gap-3 px-4 py-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-moss-600 text-[10px] font-bold text-white">{i + 1}</span>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-stone-900">{w.title}</div>
                  <div className="text-xs text-stone-500">{w.detail}</div>
                </div>
                <div className="shrink-0 text-right text-[11px] font-medium text-stone-500">{w.effort}</div>
              </li>
            ))}
            {wins.length === 0 && <li className="px-4 py-3 text-sm text-stone-500">No urgent quick wins identified.</li>}
          </ol>
        </div>
        <div className="flex flex-col gap-3">
          <div className="rounded-md bg-ink-900 p-4 text-white">
            <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-widest text-moss-300 uppercase">
              <Banknote className="h-4 w-4" /> Estimated yearly savings
            </div>
            <div className="mt-1 text-3xl font-semibold tabular-nums">{formatUsd(savings)}</div>
            <div className="text-xs text-stone-300">{ctx.identity ? `Reclaimed from ${ctx.identity.wasted.length} unused license${ctx.identity.wasted.length === 1 ? "" : "s"}` : "Run the identity audit to estimate"}</div>
          </div>
          <div className="rounded-md border border-stone-200 p-4">
            <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-widest text-stone-500 uppercase">
              <TrendingUp className="h-4 w-4" /> What we ask of the board
            </div>
            <ul className="mt-2 space-y-1.5 text-xs text-stone-700">
              <li>1. Direct staff to send the 3 attached tickets to {ctx.org.mspName} this week.</li>
              <li>2. Require written MSP confirmation within 30 days.</li>
              <li>3. Re-run this audit before the next board meeting.</li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4 text-[10.5px] text-stone-500">
        <div className="flex items-center gap-1.5">
          <Lock className="h-3 w-3" /> User lists and report card answers were processed only in the browser and were not stored. Domain checks use public DNS and HTTP headers.
        </div>
      </footer>
    </article>
  );
}

