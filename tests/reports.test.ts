import { test } from "node:test";
import assert from "node:assert/strict";
import {
  csv,
  detailsCsv,
  memberReport,
  monthBounds,
  rawEntriesCsv,
  summaryCsv,
} from "../src/lib/reports.ts";
import { reportFixture } from "./fixtures/report-data.ts";
import { collectPages } from "../src/lib/report-pagination.ts";
test("pagination includes more than 1000 records and refuses partial data on errors", async () => {
  const records = Array.from({ length: 2507 }, (_, i) => i);
  assert.deepEqual(
    await collectPages(async (start, end) => ({
      data: records.slice(start, end + 1),
      error: null,
    })),
    records,
  );
  await assert.rejects(
    collectPages(async (start, end) =>
      start === 0
        ? { data: records.slice(start, end + 1), error: null }
        : { data: null, error: new Error("offline") },
    ),
    /todos os registros/,
  );
});
test("accounting summary uses every selected employee and separates pending days", () => {
  const reports = reportFixture.members.map((member) => memberReport(reportFixture, member));
  assert.equal(reports.length, 2);
  assert.equal(reports[0]!.balance, 60);
  assert.ok(reports[1]!.pendingDays > 0);
  assert.equal(reports[0]!.positive - reports[0]!.negative, reports[0]!.balance);
  const file = summaryCsv(reportFixture, reports);
  assert.ok(file.startsWith("\uFEFF"));
  assert.ok(file.includes("Marina Costa"));
  assert.ok(file.includes("Rafael Lima"));
});
test("daily report includes all 31 days and a filtered employee only", () => {
  const reports = [memberReport(reportFixture, reportFixture.members[0]!)];
  const file = detailsCsv(reportFixture, reports);
  assert.equal(file.split("\r\n").length, 32);
  assert.ok(!file.includes("Rafael Lima"));
  assert.ok(file.includes("2026-08-31"));
  assert.ok(file.includes("Folga"));
});
test("raw export preserves exact event ID and timestamp without the carry-in", () => {
  const copy = {
    ...reportFixture,
    entries: [
      ...reportFixture.entries,
      {
        id: "prior-event",
        user_id: reportFixture.members[0]!.user_id,
        event_type: "clock_in" as const,
        recorded_at: "2026-07-31T23:00:00Z",
      },
    ],
  };
  const file = rawEntriesCsv(copy, [memberReport(copy, copy.members[0]!)]);
  assert.ok(file.includes(copy.entries[0]!.id));
  assert.ok(file.includes(copy.entries[0]!.recorded_at));
  assert.ok(!file.includes("prior-event"));
  assert.ok(!file.includes("Rafael Lima"));
});
test("CSV neutralizes formula injection and escapes quotes, separators and line breaks", () => {
  const output = csv([['=HYPERLINK("evil")', " +1", "@cmd", 'Nome; "especial"\nlinha', -60]]);
  assert.ok(output.includes('"\'=HYPERLINK(""evil"")"'));
  assert.ok(output.includes('"\' +1"'));
  assert.ok(output.includes('"\'@cmd"'));
  assert.ok(output.includes('"Nome; ""especial""\nlinha"'));
  assert.ok(output.endsWith('"-60"'));
});
test("month bounds include overnight carry across year and leap month", () => {
  assert.equal(monthBounds("2026-12").to, "2027-01-02T00:00:00-03:00");
  assert.equal(monthBounds("2028-02").to, "2028-03-02T00:00:00-03:00");
});
