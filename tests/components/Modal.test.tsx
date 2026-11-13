// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "@/components/Modal";

function backdrop() {
  return document.querySelector(".fixed") as HTMLElement;
}

describe("Modal", () => {
  it("closes on a backdrop click by default", () => {
    const onClose = vi.fn();
    render(
      <Modal title="T" onClose={onClose} footer={<button type="button">OK</button>}>
        body
      </Modal>
    );
    fireEvent.click(backdrop());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores backdrop clicks when dismissOnBackdrop is false", () => {
    const onClose = vi.fn();
    render(
      <Modal title="T" onClose={onClose} dismissOnBackdrop={false} footer={<button type="button">OK</button>}>
        body
      </Modal>
    );
    fireEvent.click(backdrop());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("still closes on Escape even when backdrop dismissal is off", () => {
    const onClose = vi.fn();
    render(
      <Modal title="T" onClose={onClose} dismissOnBackdrop={false} footer={<button type="button">OK</button>}>
        body
      </Modal>
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when the dialog body is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal title="T" onClose={onClose} footer={<button type="button">OK</button>}>
        <span>body</span>
      </Modal>
    );
    fireEvent.click(document.querySelector('[role="dialog"]') as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });
});
