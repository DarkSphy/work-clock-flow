import React from "react";
import { createRoot } from "react-dom/client";
import { Brand, BrandLoading } from "../src/components/brand";
import "../src/styles.css";
createRoot(document.getElementById("root")!).render(
  <>
    <div className="flex items-center justify-between bg-white p-6 text-slate-950">
      <Brand />
      <Brand compact />
    </div>
    <div style={{ background: "#0b1122" }} className="flex items-center justify-between p-6 text-white">
      <Brand />
      <Brand compact />
    </div>
    <BrandLoading />
  </>,
);
