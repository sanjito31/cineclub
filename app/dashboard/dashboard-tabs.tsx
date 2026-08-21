"use client";

import { useState, type ReactNode } from "react";

export function DashboardTabs({
  activeCount,
  completedCount,
  activeContent,
  completedContent,
}: {
  activeCount: number;
  completedCount: number;
  activeContent: ReactNode;
  completedContent: ReactNode;
}) {
  const [tab, setTab] = useState<"active" | "completed">("active");

  return (
    <div className="dashboard-tabs">
      <div className="dashboard-tab-bar" role="tablist">
        <button
          className={`dashboard-tab${tab === "active" ? " is-active" : ""}`}
          role="tab"
          aria-selected={tab === "active"}
          onClick={() => setTab("active")}
        >
          Active
          <span className="dashboard-tab-count">{activeCount}</span>
        </button>
        <button
          className={`dashboard-tab${tab === "completed" ? " is-active" : ""}`}
          role="tab"
          aria-selected={tab === "completed"}
          onClick={() => setTab("completed")}
        >
          Completed
          <span className="dashboard-tab-count">{completedCount}</span>
        </button>
      </div>
      <div role="tabpanel">
        {tab === "active" ? activeContent : completedContent}
      </div>
    </div>
  );
}
