// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateUser = vi.fn(() => Promise.resolve({}));
vi.mock("@/lib/auth/supabase-browser", () => ({
  createSupabaseBrowserClient: () => ({ auth: { updateUser } }),
}));

import { DashboardEditProvider, RearrangeButton } from "@/app/(app)/DashboardEdit";
import { DraggablePanels } from "@/app/(app)/DraggablePanels";

const items = ["payments", "workorders", "expirations"].map((id) => ({
  id,
  node: <div data-panel={id}>Panel {id}</div>,
}));

function setup(props: Partial<Parameters<typeof DraggablePanels>[0]> = {}) {
  const user = userEvent.setup();
  const utils = render(
    <DashboardEditProvider>
      <RearrangeButton />
      <DraggablePanels items={items} initialOrder={null} initialHidden={null} canPersist={true} {...props} />
    </DashboardEditProvider>
  );
  // Panels in the main grid (hidden ones render greyed-out in their own section).
  const visibleOrder = () =>
    [...utils.container.querySelectorAll<HTMLElement>("[data-panel]")]
      .filter((el) => !el.closest(".opacity-40"))
      .map((el) => el.dataset.panel);
  const hiddenOrder = () =>
    [...utils.container.querySelectorAll<HTMLElement>(".opacity-40 [data-panel]")].map((el) => el.dataset.panel);
  const panel = (id: string) => utils.container.querySelector(`[data-panel="${id}"]`)!.closest(".relative") as HTMLElement;
  return { user, visibleOrder, hiddenOrder, panel };
}

beforeEach(() => {
  localStorage.clear();
  updateUser.mockClear();
});

describe("DraggablePanels", () => {
  it("shows panels in their default order with no edit controls", () => {
    const { visibleOrder } = setup();
    expect(visibleOrder()).toEqual(["payments", "workorders", "expirations"]);
    expect(screen.queryByRole("button", { name: "Hide panel" })).toBeNull();
  });

  it("hides a panel into the 'Hidden panels' section and saves the choice", async () => {
    const { user, visibleOrder, hiddenOrder, panel } = setup();

    await user.click(screen.getByRole("button", { name: /rearrange/i }));
    await user.click(within(panel("workorders")).getByRole("button", { name: "Hide panel" }));

    expect(visibleOrder()).toEqual(["payments", "expirations"]);
    expect(hiddenOrder()).toEqual(["workorders"]);
    expect(screen.getByText("Hidden panels")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("pmi.dashboardHidden")!)).toEqual(["workorders"]);
    expect(JSON.parse(localStorage.getItem("pmi.dashboardOrder")!)).toEqual(["payments", "expirations", "workorders"]);
    expect(updateUser).toHaveBeenLastCalledWith({
      data: { dashboard_order: ["payments", "expirations", "workorders"], dashboard_hidden: ["workorders"] },
    });
  });

  it("keeps hidden panels out of the dashboard after leaving edit mode", async () => {
    const { user, visibleOrder, hiddenOrder, panel } = setup();

    await user.click(screen.getByRole("button", { name: /rearrange/i }));
    await user.click(within(panel("payments")).getByRole("button", { name: "Hide panel" }));
    await user.click(screen.getByRole("button", { name: /done/i }));

    expect(visibleOrder()).toEqual(["workorders", "expirations"]);
    expect(hiddenOrder()).toEqual([]);
    expect(screen.queryByText("Panel payments")).toBeNull();
  });

  it("shows a hidden panel again at the bottom", async () => {
    const { user, visibleOrder, panel } = setup();

    await user.click(screen.getByRole("button", { name: /rearrange/i }));
    await user.click(within(panel("payments")).getByRole("button", { name: "Hide panel" }));
    await user.click(screen.getByRole("button", { name: "Show" }));

    expect(visibleOrder()).toEqual(["workorders", "expirations", "payments"]);
    expect(screen.queryByText("Hidden panels")).toBeNull();
  });

  it("resets to the default order and clears saved choices", async () => {
    const { user, visibleOrder, panel } = setup();

    await user.click(screen.getByRole("button", { name: /rearrange/i }));
    await user.click(within(panel("payments")).getByRole("button", { name: "Hide panel" }));
    await user.click(screen.getByRole("button", { name: "Reset to default" }));

    expect(visibleOrder()).toEqual(["payments", "workorders", "expirations"]);
    expect(localStorage.getItem("pmi.dashboardOrder")).toBeNull();
    expect(updateUser).toHaveBeenLastCalledWith({ data: { dashboard_order: null, dashboard_hidden: null } });
  });

  it("applies the account's saved order, dropping removed panels and appending new ones", () => {
    const { visibleOrder } = setup({
      initialOrder: ["expirations", "retired-panel", "payments"],
      initialHidden: ["workorders", "retired-panel"],
    });
    expect(visibleOrder()).toEqual(["expirations", "payments"]); // workorders is hidden
  });

  it("falls back to the browser's saved layout when the account has none", () => {
    localStorage.setItem("pmi.dashboardOrder", JSON.stringify(["expirations", "payments", "workorders"]));
    const { visibleOrder } = setup();
    expect(visibleOrder()).toEqual(["expirations", "payments", "workorders"]);
  });

  it("only saves locally when not signed in (Basic Auth)", async () => {
    const { user, panel } = setup({ canPersist: false });

    await user.click(screen.getByRole("button", { name: /rearrange/i }));
    await user.click(within(panel("payments")).getByRole("button", { name: "Hide panel" }));

    expect(localStorage.getItem("pmi.dashboardHidden")).not.toBeNull();
    expect(updateUser).not.toHaveBeenCalled();
  });
});
