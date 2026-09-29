import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultSchedule,
  monthlySummary,
  scheduleSchema,
  localDate,
  type ClockEntry,
} from "../src/lib/work-schedule.ts";
const entry = (date: string, event_type: ClockEntry["event_type"], id = date): ClockEntry => ({
  id,
  event_type,
  recorded_at: new Date(`${date}-03:00`).toISOString(),
});
const pair = (start: string, end: string) => [entry(start, "clock_in"), entry(end, "clock_out")];
const now = new Date("2026-09-29T18:00:00-03:00");
test("absence is debt only after employment starts and only on closed workdays", () => {
  const result = monthlySummary([], "2026-09", defaultSchedule(), "2026-09-25", now);
  assert.equal(result.owed, 960); // Friday and Monday, not weekend or current Tuesday.
  assert.equal(result.days[29]!.settled, false);
});
test("individual Saturday schedule and a full weekday with a recorded break", () => {
  const plan = defaultSchedule();
  plan[6] = { enabled: true, start: "08:00", end: "12:00", breakMinutes: 0 };
  const records = [
    ...pair("2026-09-25T08:00:00", "2026-09-25T12:00:00"),
    ...pair("2026-09-25T13:00:00", "2026-09-25T17:00:00"),
    ...pair("2026-09-26T08:00:00", "2026-09-26T12:00:00"),
    ...pair("2026-09-28T08:00:00", "2026-09-28T16:00:00"),
  ];
  const result = monthlySummary(records, "2026-09", plan, "2026-09-25", now);
  assert.equal(result.balance, 0);
  assert.equal(result.worked, 1200);
});
test("extra hours and debt are a net monthly balance", () => {
  const result = monthlySummary(
    pair("2026-09-28T08:00:00", "2026-09-28T17:30:00"),
    "2026-09",
    defaultSchedule(),
    "2026-09-28",
    now,
  );
  assert.equal(result.extra, 90);
  assert.equal(result.owed, 0);
});
test("open and stale entries never create a settled debt or unlimited hours", () => {
  const result = monthlySummary(
    [entry("2026-09-25T08:00:00", "clock_in")],
    "2026-09",
    defaultSchedule(),
    "2026-09-25",
    now,
  );
  assert.equal(result.worked, 0);
  assert.equal(result.owed, 0);
  assert.equal(result.days[24]!.pending, true);
});
test("overnight shift and break after midnight belong to the entry workday", () => {
  const plan = defaultSchedule("22:00", "06:00", 60);
  const records = [
    ...pair("2026-09-28T22:00:00", "2026-09-29T02:00:00"),
    ...pair("2026-09-29T03:00:00", "2026-09-29T06:00:00"),
  ];
  const result = monthlySummary(records, "2026-09", plan, "2026-09-28", now);
  assert.equal(result.days[27]!.worked, 420);
  assert.equal(result.balance, 0);
});
test("a month-end overnight shift counts in its starting month", () => {
  const plan = defaultSchedule("22:00", "06:00", 0);
  const records = pair("2026-09-30T22:00:00", "2026-10-01T06:00:00");
  const result = monthlySummary(
    records,
    "2026-09",
    plan,
    "2026-09-30",
    new Date("2026-10-02T12:00:00-03:00"),
  );
  assert.equal(result.worked, 480);
  assert.equal(result.balance, 0);
});
test("invalid shifts and empty schedules are rejected", () => {
  assert.equal(scheduleSchema.safeParse([]).success, false);
  const plan = defaultSchedule();
  plan[1]!.breakMinutes = 600;
  assert.equal(scheduleSchema.safeParse(plan).success, false);
});
test("business date is independent from UTC date", () => {
  assert.equal(localDate(new Date("2026-09-29T01:00:00Z")), "2026-09-28");
});
