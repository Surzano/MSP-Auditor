/** Puts audit findings next to how real breaches happened, per the Verizon 2026 Data Breach Investigations Report. */
import type { AuditContext } from "./reports";

export const DBIR = {
  edition: "Verizon 2026 Data Breach Investigations Report",
  short: "2026 Verizon DBIR",
  period: "breaches from November 2024 to October 2025",
  url: "https://www.verizon.com/business/resources/reports/dbir/",
};

export type DbirStatus = "exposed" | "partial" | "covered" | "unknown";

export interface DbirRow {
  key: "thirdParty" | "credentials" | "vulnerabilities" | "phishing" | "ransomware";
  stat: string;
  fact: string;
  finding: string;
  status: DbirStatus;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function dbirComparison(ctx: AuditContext): DbirRow[] {
  const { domain: d, identity: a, scorecard: sc } = ctx;
  const answered = sc.answered > 0;
  const gap = (id: string) => sc.gaps.find((g) => g.q.id === id);
  const mspGaps = (ids: string[]) => ids.filter((id) => gap(id));

  // Third parties: how well the MSP itself can be held to account.
  const allGaps = sc.gaps.length;
  const thirdParty: DbirRow = {
    key: "thirdParty",
    stat: "48%",
    fact: "of breaches involved a third party such as a vendor or IT provider, up from 30% a year earlier.",
    finding: !answered
      ? "MSP report card not completed."
      : allGaps === 0
        ? `${ctx.org.mspName} confirmed all ${sc.answered} answered safeguards.`
        : `${ctx.org.mspName} could not confirm ${plural(allGaps, "safeguard")} out of ${sc.answered} on the report card.`,
    status: !answered ? "unknown" : allGaps === 0 ? "covered" : allGaps >= 3 ? "exposed" : "partial",
  };

  // Credentials: MFA coverage and accounts that should no longer work.
  const credIssues = a ? a.missingMfa.length + a.stale.length : 0;
  const credentials: DbirRow = {
    key: "credentials",
    stat: "39%",
    fact: "of breaches involved stolen or abused logins at some point in the attack.",
    finding: !a
      ? "Identity audit not run."
      : credIssues === 0
        ? "Every active account has MFA and no stale accounts were found."
        : [a.missingMfa.length && `${plural(a.missingMfa.length, "account")} without MFA`, a.stale.length && `${plural(a.stale.length, "stale account")} still enabled`].filter(Boolean).join(", ") + ".",
    status: !a ? "unknown" : credIssues === 0 ? "covered" : a.adminsWithoutMfa.length || a.missingMfa.length >= 3 ? "exposed" : "partial",
  };

  // Vulnerabilities: patching is the MSP's job.
  const patch = gap("q5");
  const vulnerabilities: DbirRow = {
    key: "vulnerabilities",
    stat: "31%",
    fact: "of breaches started with an unpatched software flaw, now the most common way attackers get in.",
    finding: !answered ? "MSP report card not completed." : !patch ? "MSP confirmed automated OS and third-party patching." : `MSP ${patch.answer === "no" ? "does not" : "could not prove it"} patch OS and third-party apps automatically.`,
    status: !answered ? "unknown" : !patch ? "covered" : patch.answer === "no" ? "exposed" : "partial",
  };

  // Phishing: whether criminals can send email as us.
  const policy = d?.dmarc.record ? d.dmarc.policy : null;
  const phishing: DbirRow = {
    key: "phishing",
    stat: "16%",
    fact: "of breaches began with a phishing email, and AI is making those emails more convincing.",
    finding: !d
      ? "Domain scan not run."
      : policy === "reject"
        ? `${d.domain} rejects spoofed email (DMARC p=reject).`
        : policy === "quarantine"
          ? `${d.domain} sends spoofed email to spam but doesn't reject it.`
          : `Anyone can send email that appears to come from ${d.domain}.`,
    status: !d ? "unknown" : policy === "reject" ? "covered" : policy === "quarantine" ? "partial" : "exposed",
  };

  // Ransomware: whether we could recover.
  const rGaps = mspGaps(["q3", "q4", "q8"]);
  const ransomware: DbirRow = {
    key: "ransomware",
    stat: "48%",
    fact: "of breaches involved ransomware.",
    finding: !answered
      ? "MSP report card not completed."
      : rGaps.length === 0
        ? "Backups, 24/7 endpoint monitoring and admin rights were all confirmed."
        : `Not confirmed: ${rGaps.map((id) => ({ q3: "tested backups", q4: "24/7 endpoint monitoring", q8: "removal of local admin rights" })[id as "q3" | "q4" | "q8"]).join(", ")}.`,
    status: !answered ? "unknown" : rGaps.length === 0 ? "covered" : rGaps.some((id) => gap(id)!.answer === "no") || rGaps.length >= 2 ? "exposed" : "partial",
  };

  return [thirdParty, credentials, vulnerabilities, phishing, ransomware];
}

/** One-sentence urgency line for the top of the tickets and the board brief. */
export function dbirHeadline(rows: DbirRow[], where: "tickets" | "board"): string {
  const exposed = rows.filter((r) => r.status === "exposed").length;
  const open = rows.filter((r) => r.status === "exposed" || r.status === "partial").length;
  if (open === 0) return `None of the five most common attack paths in the ${DBIR.short} found an open door here. Keep it that way by re-running this audit every quarter.`;
  const found = exposed ? `${plural(exposed, "open gap")}${open > exposed ? ` and ${open - exposed} partial` : ""}` : plural(open, "partial gap");
  return `This audit found ${found} across five of the most common ways breaches happened in the ${DBIR.short}. ${where === "tickets" ? "Each one maps to a ticket below." : "The attached tickets close each one."}`;
}
