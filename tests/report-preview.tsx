import React from "react";
import { createRoot } from "react-dom/client";
import { TimeSheet } from "../src/components/time-sheet";
import { HoursChart, ReportMetrics } from "../src/components/report-ui";
import { memberReport } from "../src/lib/reports";
import { reportFixture } from "./fixtures/report-data";
import "../src/styles.css";
import "../src/report-print.css";
const reports = reportFixture.members.map((member) => memberReport(reportFixture, member));
createRoot(document.getElementById("root")!).render(
  <main className="report-page bg-[#f5f5f7] p-8">
    <div className="report-screen mx-auto max-w-6xl space-y-6">
      <ReportMetrics data={reportFixture} />
      <HoursChart data={reportFixture} />
      <div className="sheet-preview">
        <TimeSheet
          data={reportFixture}
          report={reports[0]!}
          companyDocument="Dados demonstrativos"
        />
      </div>
    </div>
    <div className="print-area">
      {reports.map((report) => (
        <TimeSheet
          key={report.member.user_id}
          data={reportFixture}
          report={report}
          companyDocument="Dados demonstrativos"
        />
      ))}
    </div>
  </main>,
);
