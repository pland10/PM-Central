// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Combobox } from "@/components/Combobox";

const OPTIONS = Array.from({ length: 40 }, (_, i) => `${i + 1} Main St · Town`).concat([
  "8204 138th Street · Jamaica — Unit 1",
  "8204 138th Street · Jamaica — Unit 2",
]);

function Harness(props: { strict?: boolean; onCommit?: (v: string) => void; initial?: string }) {
  const [v, setV] = useState(props.initial ?? "");
  return (
    <Combobox
      ariaLabel="property"
      options={OPTIONS}
      value={v}
      onChange={setV}
      onCommit={props.onCommit}
      strict={props.strict}
      limit={8}
    />
  );
}

describe("Combobox", () => {
  it("shows at most `limit` matches plus a keep-typing hint", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("property"), "1");
    expect(screen.getAllByRole("option")).toHaveLength(8);
    expect(screen.getByText(/more — keep typing/)).toBeInTheDocument();
  });

  it("narrows as you type multiple words", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("property"), "jamaica 2");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["8204 138th Street · Jamaica — Unit 2"]);
  });

  it("picks with the mouse and commits once", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    const input = screen.getByLabelText("property");
    await user.type(input, "unit 1");
    await user.click(screen.getByRole("option", { name: "8204 138th Street · Jamaica — Unit 1" }));
    expect(input).toHaveValue("8204 138th Street · Jamaica — Unit 1");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    await user.tab(); // blur after a pick doesn't commit again
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("8204 138th Street · Jamaica — Unit 1");
  });

  it("strict: Enter takes the top match; arrows move the highlight", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<Harness strict onCommit={onCommit} />);
    const input = screen.getByLabelText("property");
    await user.type(input, "jamaica");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(input).toHaveValue("8204 138th Street · Jamaica — Unit 2");
    expect(onCommit).toHaveBeenCalledWith("8204 138th Street · Jamaica — Unit 2");
  });

  it("free text (not strict): Enter keeps what you typed", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    const input = screen.getByLabelText("property");
    await user.type(input, "1 Main{Enter}");
    expect(input).toHaveValue("1 Main");
    expect(onCommit).toHaveBeenCalledWith("1 Main");
  });

  it("Escape closes the list; blur commits a changed value", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} initial="old" />);
    const input = screen.getByLabelText("property");
    await user.clear(input);
    await user.type(input, "new");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    await user.tab();
    expect(onCommit).toHaveBeenCalledWith("new");
  });

  it("blur without a change doesn't commit", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} initial="same" />);
    await user.click(screen.getByLabelText("property"));
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });
});
