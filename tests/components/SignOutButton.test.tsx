// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/auth/supabase-browser", () => ({ createSupabaseBrowserClient: () => ({ auth: { signOut: vi.fn() } }) }));

import { SignOutButton } from "@/components/SignOutButton";

describe("SignOutButton", () => {
  it("is light by default", () => {
    render(<SignOutButton />);
    expect(screen.getByRole("button", { name: "Sign out" }).className).toMatch(/border-slate-300/);
  });

  it("has a dark-bar style that stays readable on the dark header", () => {
    render(<SignOutButton dark />);
    const b = screen.getByRole("button", { name: "Sign out" });
    expect(b.className).toMatch(/text-slate-200/);
    expect(b.className).toMatch(/border-white\/20/);
    expect(b.className).not.toMatch(/text-slate-600/);
  });
});
