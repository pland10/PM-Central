// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Recharts needs real layout (ResizeObserver + sizes) that jsdom lacks, so stub
// it to passthroughs — this test covers the dashboard's own structure, tiles,
// and computed values, not Recharts internals.
vi.mock("recharts", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const Leaf = () => null;
  return {
    ResponsiveContainer: Pass,
    BarChart: Pass,
    PieChart: Pass,
    Bar: Pass,
    Pie: Pass,
    Cell: Leaf,
    CartesianGrid: Leaf,
    XAxis: Leaf,
    YAxis: Leaf,
    Tooltip: Leaf,
    Legend: Leaf,
    LabelList: Leaf,
  };
});

import { ManagementDashboard } from "@/app/(app)/management/ManagementDashboard";
import type { ManagementKpis } from "@/lib/management-dashboard";

const data: ManagementKpis = {
  weeks: 12,
  generatedAt: "2026-11-13T12:00:00Z",
  workOrders: {
    headline: { open: 27, openedThisWeek: 4, closedThisWeek: 9, medianDaysToClose: 6.5, preventiveShare: 30 },
    openedClosed: [{ week: "2026-11-09", label: "Nov 9", opened: 4, closed: 9 }],
    backlog: [
      { stage: "New WO", count: 12 },
      { stage: "Scheduling in Progress", count: 8 },
    ],
    preventive: { preventive: 8, reactive: 19 },
  },
  accounting: {
    archivedByWeek: [{ week: "2026-11-09", label: "Nov 9", count: 5 }],
    archivedThisWeek: 5,
    recorded: { total: 40, both: 25, qbOnly: 6, rvOnly: 4, neither: 5 },
  },
  collections: {
    headline: { collectedThisWeek: 48250, pendingTotal: 3100, returnedThisWeek: 1, returnedTotalWindow: 3 },
    collectedByWeek: [{ week: "2026-11-09", label: "Nov 9", amount: 48250 }],
    returnsByWeek: [{ week: "2026-11-09", label: "Nov 9", count: 1 }],
  },
};

describe("ManagementDashboard", () => {
  it("renders all KPI sections", () => {
    render(<ManagementDashboard data={data} />);
    expect(screen.getByText("Collections & Rent")).toBeInTheDocument();
    expect(screen.getByText("Work Orders")).toBeInTheDocument();
    expect(screen.getByText("Accounting Ops")).toBeInTheDocument();
  });

  it("shows collections tiles with formatted money and chart cards", () => {
    render(<ManagementDashboard data={data} />);
    expect(within(screen.getByText("Collected this week").parentElement!).getByText("$48,250")).toBeInTheDocument();
    expect(within(screen.getByText("In-flight (pending)").parentElement!).getByText("$3,100")).toBeInTheDocument();
    expect(screen.getByText("Rent collected")).toBeInTheDocument();
    expect(screen.getByText("Returned / NSF")).toBeInTheDocument();
  });

  it("shows the work-order headline tiles", () => {
    render(<ManagementDashboard data={data} />);
    expect(within(screen.getByText("Open").parentElement!).getByText("27")).toBeInTheDocument();
    expect(within(screen.getByText("Closed this week").parentElement!).getByText("9")).toBeInTheDocument();
    expect(within(screen.getByText("Median days to close").parentElement!).getByText("6.5")).toBeInTheDocument();
    expect(within(screen.getByText("Preventive share").parentElement!).getByText("30%")).toBeInTheDocument();
  });

  it("derives Not-in-QuickBooks / Not-in-Rentvine from the recorded breakdown", () => {
    render(<ManagementDashboard data={data} />);
    // not in QB = rvOnly(4) + neither(5) = 9; not in RV = qbOnly(6) + neither(5) = 11
    expect(within(screen.getByText("Not in QuickBooks").parentElement!).getByText("9")).toBeInTheDocument();
    expect(within(screen.getByText("Not in Rentvine").parentElement!).getByText("11")).toBeInTheDocument();
    expect(within(screen.getByText("Archived this week").parentElement!).getByText("5")).toBeInTheDocument();
  });

  it("renders the chart cards", () => {
    render(<ManagementDashboard data={data} />);
    expect(screen.getByText("Opened vs closed")).toBeInTheDocument();
    expect(screen.getByText("Preventive vs reactive")).toBeInTheDocument();
    expect(screen.getByText("Open backlog by stage")).toBeInTheDocument();
    expect(screen.getByText("Rows archived")).toBeInTheDocument();
    expect(screen.getByText("Recorded in QuickBooks / Rentvine")).toBeInTheDocument();
  });
});
