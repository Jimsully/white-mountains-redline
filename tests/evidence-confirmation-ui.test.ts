import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EvidenceConfirmationSection, evidenceSourceLabel, formatEvidenceActivityDate } from "@/app/account/EvidenceConfirmationSection";
import type { EvidenceConfirmationItem } from "@/app/account/EvidenceConfirmationSection";

const root = process.cwd();
const sectionSource = fs.readFileSync(path.join(root, "app/account/EvidenceConfirmationSection.tsx"), "utf8");
const accountSource = fs.readFileSync(path.join(root, "app/account/page.tsx"), "utf8");
const actionsSource = fs.readFileSync(path.join(root, "lib/completions/actions.ts"), "utf8");
const evidenceId = "11111111-2222-4333-8444-555555555555";

function item(overrides: Partial<EvidenceConfirmationItem> = {}): EvidenceConfirmationItem {
  return {
    evidenceId,
    trailName: "Franconia Ridge Trail",
    segmentName: "Little Haystack to Lincoln",
    region: "Franconia-Pemigewasset",
    evidenceSource: "historical_gps",
    activityTitle: "Ridge day",
    activityDate: "2024-02-29",
    ...overrides,
  };
}

describe("account evidence UI source contract", () => {
  it("states the explicit-confirmation boundary and provides neutral empty/load-failure states", () => {
    expect(sectionSource).toContain("Evidence ready to confirm");
    expect(sectionSource).toContain("Your progress will not change until you confirm it.");
    expect(sectionSource).toContain("No reviewed activity evidence is waiting for confirmation.");
    expect(sectionSource).toContain("Evidence ready to confirm is temporarily unavailable.");
    expect(accountSource).not.toContain("Completion workflows are intentionally not active");
  });

  it("renders only the approved evidence presentation and friendly source labels", () => {
    for (const field of ["item.trailName", "item.segmentName", "item.region", "item.activityDate", "item.activityTitle", "item.evidenceSource"]) {
      expect(sectionSource).toContain(field);
    }
    expect(sectionSource).toContain('"Historical GPS"');
    expect(sectionSource).toContain('"GPX import"');
    expect(sectionSource).toContain('"Connected activity"');
    expect(sectionSource).not.toMatch(/item\.(segmentId|acceptedAt)/);
    expect(sectionSource).not.toMatch(/provenance|geometry|activityId|candidateId|confidence|coverage|algorithm|matchKey/i);
    expect(evidenceSourceLabel("historical_gps")).toBe("Historical GPS");
    expect(evidenceSourceLabel("gpx_import")).toBe("GPX import");
    expect(evidenceSourceLabel("connected_service")).toBe("Connected activity");
  });

  it("formats calendar dates through UTC without timezone-day drift", () => {
    expect(sectionSource).toContain("Date.UTC(year, month - 1, day)");
    expect(sectionSource).toContain('timeZone: "UTC"');
    expect(sectionSource).toContain("<dt>Activity date</dt>");
    expect(formatEvidenceActivityDate("2026-01-01")).toBe("Jan 1, 2026");
    expect(formatEvidenceActivityDate("2026-06-15")).toBe("Jun 15, 2026");
    expect(formatEvidenceActivityDate("2024-02-29")).toBe("Feb 29, 2024");
  });

  it("renders populated, nullable-title, empty, and load-error states from sanitized props", () => {
    const populated = renderToStaticMarkup(createElement(EvidenceConfirmationSection, {
      evidence: [item(), item({
        evidenceId: "11111111-2222-4333-8444-555555555556",
        trailName: "Falling Waters Trail",
        segmentName: "Falls to ridge",
        evidenceSource: "connected_service",
        activityTitle: null,
      })],
      loadFailed: false,
    }));
    const visibleText = populated.replace(/<[^>]*>/g, " ");
    expect(populated).toContain("Franconia Ridge Trail");
    expect(populated).toContain("Little Haystack to Lincoln");
    expect(populated).toContain("Franconia-Pemigewasset");
    expect(populated).toContain("Ridge day");
    expect(populated).toContain("Feb 29, 2024");
    expect(populated).toContain("Historical GPS");
    expect(populated).toContain("Connected activity");
    expect(populated.match(/name="evidenceId"/g)).toHaveLength(2);
    expect(visibleText).not.toContain(evidenceId);
    expect(populated.match(/<dt>Activity<\/dt>/g)).toHaveLength(1);

    const empty = renderToStaticMarkup(createElement(EvidenceConfirmationSection, { evidence: [], loadFailed: false }));
    expect(empty).toContain("No reviewed activity evidence is waiting for confirmation.");
    const failed = renderToStaticMarkup(createElement(EvidenceConfirmationSection, { evidence: [], loadFailed: true }));
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("Evidence ready to confirm is temporarily unavailable.");
  });

  it("submits only the opaque evidence UUID and never prints it as visible content", () => {
    expect(sectionSource).toContain('name="evidenceId"');
    expect(sectionSource).toContain("value={evidenceId}");
    expect(sectionSource.match(/name=/g)).toHaveLength(1);
    expect(sectionSource).not.toMatch(/name=["'](?:userId|segmentId|activityId|activityDate|completedOn|method|notes|confidence)/);
    expect(sectionSource).not.toMatch(/>\s*\{(?:item\.)?evidenceId\}\s*</);
    expect(sectionSource).not.toContain("data-evidence");
  });

  it("uses action state, pending form status, semantic feedback, and accessible controls", () => {
    expect(sectionSource).toContain("useActionState");
    expect(sectionSource).toContain("useFormStatus");
    expect(sectionSource).toContain('type="submit"');
    expect(sectionSource).toContain("disabled={pending}");
    expect(sectionSource).toContain('"Marking complete..."');
    expect(sectionSource).toContain('role="status"');
    expect(sectionSource).toContain('role="alert"');
    expect(sectionSource).toContain("aria-label={`Mark ${trailName}, ${segmentName} complete`}");
  });

  it("loads evidence independently after auth and contains no raw table or service-role access", () => {
    expect(accountSource).toContain("new CompletionEvidenceRepository(auth.supabase)");
    expect(accountSource).toContain("Promise.all([profileRepository.ensureProfile(), evidencePromise])");
    expect(accountSource).toContain(".catch(() => ({ evidence: [], loadFailed: true }))");
    expect(accountSource).toContain("evidence={evidenceItems}");
    expect(accountSource).not.toMatch(/segmentId:\s*item\.segmentId|acceptedAt:\s*item\.acceptedAt/);

    const applicationSource = [sectionSource, accountSource, actionsSource, fs.readFileSync(path.join(root, "lib/completions/completion-evidence-repository.ts"), "utf8")].join("\n");
    expect(applicationSource).not.toMatch(/\.from\(["']completion_evidence["']\)/);
    expect(applicationSource).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(actionsSource).not.toMatch(/\.from\(["']segment_completions["']\)\.insert/);
    expect(actionsSource).toContain('formData.get("evidenceId")');
    expect(actionsSource).not.toMatch(/formData\.get\(["'](?:userId|segmentId|activityId|completedOn|method|notes|confidence)/);
  });
});
