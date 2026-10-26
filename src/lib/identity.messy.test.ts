/**
 * Real exports are messy: different admin portals, Excel re-saves, regional settings.
 * Each fixture copies the shape of a real-world file (no real data) and checks that the
 * audit either gets the right answer or says clearly what it couldn't measure.
 * Fixtures are inline strings so no CSV is ever committed.
 */
import { describe, expect, it } from "vitest";
import { auditCsv, auditCsvFiles, auditUsers, detectDelimiter, mergeCsvFiles, parseCsv, parseUserRows, parseUsers } from "./identity";

const NOW = new Date("2026-06-01T12:00:00Z");
const audit = (csv: string) => {
  const { users, warnings } = parseUsers(csv);
  return auditUsers(users, "test.csv", warnings, NOW);
};

describe("Microsoft 365 admin center: Active users export", () => {
  // Header row copied from the admin center's "Export users" download (abridged).
  const csv = [
    "Block credential,City,Country/Region,Department,DirSyncEnabled,Display name,First name,Last name,Licenses,Mobile Phone,Object Id,Office,Title,Usage location,User principal name,When created",
    "False,Springfield,United States,Programs,,Ana Ortiz,Ana,Ortiz,Microsoft 365 Business Premium+Microsoft Teams Exploratory,,0a1b,HQ,Program Lead,US,ana@org.org,1/5/2024 3:02:11 PM",
    "True,Springfield,United States,Finance,,Former Staffer,Former,Staffer,Microsoft 365 Business Standard,,0a1c,HQ,,US,former@org.org,6/1/2022 9:00:00 AM",
    "False,,,,,Front Desk,,,Unlicensed,,0a1d,,,US,frontdesk@org.org,3/3/2023 1:00:00 PM",
  ].join("\r\n");

  it("reads blocked sign-in as disabled and multi-license cells as paid", () => {
    const a = audit(csv);
    expect(a.totalAccounts).toBe(3);
    const former = a.users.find((u) => u.upn === "former@org.org")!;
    expect(former.enabled).toBe(false);
    expect(former.flags).toContain("LICENSE_WASTE");
    expect(a.users.find((u) => u.upn === "ana@org.org")!.isPaid).toBe(true);
  });

  it("says plainly what this export can't measure", () => {
    const w = audit(csv).warnings.join(" ");
    expect(w).toMatch(/No MFA column/);
    expect(w).toMatch(/No last sign-in column/);
  });
});

describe("Microsoft Entra: User registration details (MFA report)", () => {
  const csv = [
    '"User principal name","User display name","User type","Is admin","Is SSPR registered","Is MFA registered","Is MFA capable","Methods registered"',
    '"ana@org.org","Ana Ortiz","member","False","True","True","True","microsoftAuthenticatorPush"',
    '"ben@org.org","Ben Ng","member","True","False","False","False",""',
    '"guest_x.com#EXT#@org.onmicrosoft.com","Pat Guest","guest","False","False","False","False",""',
  ].join("\n");

  it("measures MFA from the 'Is MFA registered' column", () => {
    const a = audit(csv);
    expect(a.users.map((u) => u.mfa)).toEqual([true, false, false]);
    expect(a.missingMfa.map((u) => u.upn)).toContain("ben@org.org");
  });

  it("recognizes guests and warns that 'Is admin' is broader than Global Admin", () => {
    const a = audit(csv);
    expect(a.users[2].accountType).toBe("Guest");
    expect(a.users[1].displayName).toBe("Ben Ng");
    expect(a.warnings.join(" ")).toMatch(/any admin role/);
  });
});

describe("Google Workspace: Admin console user download", () => {
  const csv = [
    "First Name [Required],Last Name [Required],Email Address [Required],Password [Required],Org Unit Path [Required],Recovery Email,Manager Email,New Status [UPLOAD ONLY],Status [READ ONLY],Last Sign In [READ ONLY],2sv Enrolled [READ ONLY],2sv Enforced [READ ONLY]",
    "Eve,Lin,eve@org.org,****,/,eve.personal@gmail.com,boss@org.org,,Active,2026/05/30 09:12:00 UTC,True,True",
    "Finn,Cole,finn@org.org,****,/Staff,,eve@org.org,,Active,Never logged in,False,False",
    "Gia,Ray,gia@org.org,****,/Former,,,,Suspended,2025/01/01 09:12:00 UTC,False,False",
  ].join("\n");

  it("uses the primary email, not recovery or manager email", () => {
    expect(audit(csv).users.map((u) => u.upn)).toEqual(["eve@org.org", "finn@org.org", "gia@org.org"]);
  });

  it('treats "Never logged in" as never, and suspended accounts as off', () => {
    const a = audit(csv);
    expect(a.stale.map((u) => u.upn)).toEqual(["finn@org.org"]);
    expect(a.users[2].enabled).toBe(false);
    expect(a.missingMfa.map((u) => u.upn)).toEqual(["finn@org.org"]);
  });
});

describe("Excel re-saves and regional settings", () => {
  it.each([
    ["comma", "a,b;c", ","],
    ["semicolon", "a;b;c", ";"],
    ["tab", "a\tb\tc", "\t"],
    ["semicolons inside quotes", '"a;b",c', ","],
  ])("detects a %s delimiter", (_, line, d) => {
    expect(detectDelimiter(line)).toBe(d);
  });

  it("reads semicolon-separated files (Excel in most of Europe)", () => {
    const a = audit("Email;mfaStatus;Licenses\r\nana@org.org;Enabled;E3\r\nben@org.org;Disabled;E3\r\n");
    expect(a.missingMfa.map((u) => u.upn)).toEqual(["ben@org.org"]);
  });

  it('honors and strips Excel\'s "sep=" hint line', () => {
    expect(parseCsv("sep=;\nEmail;MFA\na@org.org;Yes\n")).toEqual([
      ["Email", "MFA"],
      ["a@org.org", "Yes"],
    ]);
  });

  it("reads tab-separated text saved with a .csv name", () => {
    expect(audit("Email\tMFA\na@org.org\tYes\n").mfaCoveragePct).toBe(100);
  });

  it("accepts Excel's upper-case TRUE/FALSE and padded headers", () => {
    const a = audit("  Email  , MFA Enabled ,Account Enabled\na@org.org,FALSE,TRUE\n");
    expect(a.missingMfa).toHaveLength(1);
  });

  it("reads US-style dates Excel writes back", () => {
    const a = audit("Email,lastSignInDateTime\na@org.org,5/30/2026 9:12 AM\nb@org.org,1/2/2025 8:00 AM\n");
    expect(a.users[0].lastSignIn?.getFullYear()).toBe(2026);
    expect(a.stale.map((u) => u.upn)).toEqual(["b@org.org"]);
  });

  it("does not flag accounts as stale when their dates are ambiguous or unreadable", () => {
    const a = audit("Email,lastSignInDateTime,Licenses\na@org.org,30/05/2026,E3\nb@org.org,05/30/26,E3\nc@org.org,last tuesday,E3\nd@org.org,2026-05-30,E3\n");
    expect(a.users.map((u) => u.signInUnreadable)).toEqual([true, true, true, false]);
    expect(a.stale).toEqual([]);
    expect(a.wasted).toEqual([]);
    expect(a.warnings.join(" ")).toMatch(/3 sign-in dates couldn't be read/);
  });
});

describe("Damaged or unusual files", () => {
  it("skips rows with no name or email and says so", () => {
    const a = audit("Email,Name,MFA\na@org.org,Ana,Yes\n,,No\n,,\n");
    expect(a.totalAccounts).toBe(1);
    expect(a.warnings.join(" ")).toMatch(/Skipped 1 row with no name or email/);
  });

  it("tolerates rows shorter or longer than the header", () => {
    const a = audit("Email,MFA,Licenses\na@org.org\nb@org.org,No,E3,extra,cells\n");
    expect(a.users.map((u) => u.mfa)).toEqual([null, false]);
  });

  it("keeps commas, quotes and line breaks inside quoted names", () => {
    const a = audit('Name,Email\n"Ortiz, Ana ""AJ""",ana@org.org\n"Multi\nLine",ml@org.org\n');
    expect(a.users.map((u) => u.displayName)).toEqual(['Ortiz, Ana "AJ"', "Multi\nLine"]);
  });

  it("explains what's wrong with a file that isn't a user export", () => {
    expect(() => parseUsers("Invoice,Amount\n1001,$40\n")).toThrow(/name or email column/);
    expect(() => parseUsers("")).toThrow(/no data rows/);
  });

  it("handles a 5,000-account export quickly", () => {
    const rows = ["Email,MFA,lastSignInDateTime,Licenses"];
    for (let i = 0; i < 5000; i++) rows.push(`user${i}@org.org,${i % 10 ? "Yes" : "No"},2026-05-0${(i % 9) + 1},E3`);
    const started = performance.now();
    const a = audit(rows.join("\n"));
    expect(performance.now() - started).toBeLessThan(2000);
    expect(a.totalAccounts).toBe(5000);
    expect(a.missingMfa).toHaveLength(500);
    expect(a.mfaCoveragePct).toBe(90);
  });
});

describe("Pseudonymized exports", () => {
  // The upload page tells people they can replace names with placeholders. Make sure that
  // gives the same result as long as they keep the account type column.
  const real = "Name,Email,accountType,MFA,lastSignInDateTime,Licenses\nAna Ortiz,ana@org.org,Member,No,2026-05-30,E3\nInfo,info@org.org,Shared,,2024-01-01,E3\n";
  const masked = "Name,Email,accountType,MFA,lastSignInDateTime,Licenses\nuser01,user01@org.org,Member,No,2026-05-30,E3\nuser02,user02@org.org,Shared,,2024-01-01,E3\n";

  it("scores a masked file the same as the original", () => {
    const [a, b] = [audit(real), audit(masked)];
    expect(b.score).toBe(a.score);
    expect(b.stale).toHaveLength(a.stale.length);
    expect(b.missingMfa).toHaveLength(a.missingMfa.length);
  });
});

describe("Combining the admin center export with Entra's MFA report", () => {
  const users = [
    "Block credential,Display name,Licenses,Title,User principal name",
    "False,Ana Ortiz,Microsoft 365 Business Premium,Program Lead,ana@org.org",
    "False,Ben Lee,Microsoft 365 Business Premium,Director,ben@org.org",
    "True,Former Staffer,Microsoft 365 Business Standard,,former@org.org",
  ].join("\r\n");
  // Header row copied from Authentication methods → User registration details → Download (abridged).
  const mfa = [
    "User principal name,User display name,User type,Is admin,Is MFA registered,Is MFA capable,Methods registered",
    "ANA@ORG.ORG,Ana Ortiz,member,False,True,True,microsoftAuthenticatorPush",
    "ben@org.org,Ben Lee,member,True,False,False,",
    "guest_vendor@other.org,Vendor,guest,False,False,False,",
    ",No Email,member,False,False,False,",
  ].join("\r\n");
  const merged = () => {
    const m = mergeCsvFiles([
      { name: "users.csv", text: users },
      { name: "mfa.csv", text: mfa },
    ]);
    const { users: rows, warnings } = parseUserRows(m.rows);
    return auditUsers(rows, "merged", [...warnings, ...m.warnings], NOW);
  };

  it("matches accounts by email, ignoring case, and fills in MFA and admin", () => {
    const a = merged();
    const ana = a.users.find((u) => u.upn === "ana@org.org")!;
    expect(ana.mfa).toBe(true);
    expect(ana.title).toBe("Program Lead");
    const ben = a.users.find((u) => u.upn === "ben@org.org")!;
    expect(ben.isGlobalAdmin).toBe(true);
    expect(ben.flags).toContain("ADMIN_NO_MFA");
    expect(a.users.find((u) => u.upn === "former@org.org")!.enabled).toBe(false);
  });

  it("no longer says MFA can't be measured, and explains what didn't line up", () => {
    const w = merged().warnings.join(" ");
    expect(w).not.toMatch(/No MFA column/);
    expect(w).toMatch(/1 account appears only in mfa\.csv/);
    expect(w).toMatch(/Skipped 1 row in mfa\.csv with no email/);
    expect(w).toMatch(/Ignored columns: Is MFA capable, Methods registered/);
  });

  it("adds accounts that only the second file knows about", () => {
    const vendor = merged().users.find((u) => u.upn === "guest_vendor@other.org")!;
    expect(vendor.accountType).toBe("Guest");
    expect(merged().totalAccounts).toBe(4);
  });

  it("refuses a file that has no email column to match on", () => {
    expect(() => auditCsvFiles([{ name: "users.csv", text: users }, { name: "names.csv", text: "Name,MFA\nAna Ortiz,Yes\n" }])).toThrow(/names\.csv has no email column/);
  });

  it("treats a single file exactly as before", () => {
    const one = auditCsvFiles([{ name: "users.csv", text: users }]);
    expect(one).toEqual(auditCsv(users, "users.csv"));
  });
});
