import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { useMessageLinkMenu } from "./useMessageLinkMenu";

describe("message link menu positioning", () => {
  it.each([
    { position: { x: 0, y: 0 }, expected: { x: 120, y: 260 } },
    { position: { x: 145, y: 245 }, expected: { x: 145, y: 245 } },
    { position: { x: 0, y: 245 }, expected: { x: 0, y: 245 } },
    { position: { x: 145, y: 0 }, expected: { x: 145, y: 0 } },
  ])("opens a menu requested at $position at $expected", async ({ position, expected }) => {
    function TestLinkMenu() {
      const { show, menu } = useMessageLinkMenu();
      return (
        <>
          <a
            href="https://example.com"
            style={{ position: "fixed", left: 120, top: 240, width: 80, height: 20 }}
            onContextMenu={(event) => {
              event.preventDefault();
              void show(
                [{ id: "copy-link", label: "Copy Link" }],
                { x: event.clientX, y: event.clientY },
                event.currentTarget,
              );
            }}
          >
            Example
          </a>
          {menu}
        </>
      );
    }
    await using screen = await render(<TestLinkMenu />, { router: false });

    // A keyboard-opened context menu reports (0, 0).
    await act(() => {
      screen.container.querySelector("a")!.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: position.x,
          clientY: position.y,
        }),
      );
    });

    // Base UI nudges the popup up to 5px off its anchor; the cases differ by far more.
    await vi.waitFor(() => {
      const menu = document.querySelector<HTMLElement>('[role="menu"]');
      expect(menu).not.toBeNull();
      const bounds = menu!.getBoundingClientRect();
      expect(Math.abs(bounds.left - expected.x)).toBeLessThanOrEqual(5);
      expect(Math.abs(bounds.top - expected.y)).toBeLessThanOrEqual(5);
    });
  });
});

describe("message link menu keyboard focus", () => {
  let chosen: Promise<string | null>;

  function LinkWithMenu() {
    const { show, menu } = useMessageLinkMenu();
    return (
      <>
        <button type="button">Before</button>
        {menu}
        <a
          href="https://example.com"
          onContextMenu={(event) => {
            event.preventDefault();
            chosen = show(
              [
                { id: "copy-link", label: "Copy link" },
                { id: "open-link", label: "Open link" },
              ],
              { x: event.clientX, y: event.clientY },
              event.currentTarget,
            );
          }}
        >
          Example
        </a>
        <span tabIndex={-1}>Not tabbable</span>
        <button type="button" disabled>
          Disabled
        </button>
        <button type="button">After</button>
      </>
    );
  }

  function byText(text: string) {
    const element = [...document.querySelectorAll<HTMLElement>("a, button, [role=menuitem]")].find(
      (candidate) => candidate.textContent === text,
    );
    if (!element) throw new Error(`No element with text "${text}"`);
    return element;
  }

  // Base UI moves initial focus and returns final focus asynchronously.
  async function openMenuFromLink() {
    const link = byText("Example");
    link.focus();
    await act(() => {
      link.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    await vi.waitFor(() => {
      expect(document.activeElement?.getAttribute("role")).toBe("menuitem");
    });
    return link;
  }

  async function press(key: string, init: KeyboardEventInit = {}) {
    const target = document.activeElement ?? document.body;
    await act(() => {
      target.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
      );
    });
  }

  it("closes on Tab and focuses the next tabbable element after the link", async () => {
    await using _screen = await render(<LinkWithMenu />, { router: false });
    await openMenuFromLink();
    await press("Tab");

    await vi.waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeNull();
      expect(document.activeElement).toBe(byText("After"));
    });
    await expect(chosen).resolves.toBeNull();
  });

  it("closes on Shift+Tab and focuses the link", async () => {
    await using _screen = await render(<LinkWithMenu />, { router: false });
    const link = await openMenuFromLink();
    await press("Tab", { shiftKey: true });

    await vi.waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeNull();
      expect(document.activeElement).toBe(link);
    });
    await expect(chosen).resolves.toBeNull();
  });

  it("closes on Escape and focuses the link", async () => {
    await using _screen = await render(<LinkWithMenu />, { router: false });
    const link = await openMenuFromLink();
    await press("Escape");

    await vi.waitFor(() => {
      expect(document.querySelector('[role="menu"]')).toBeNull();
      expect(document.activeElement).toBe(link);
    });
    await expect(chosen).resolves.toBeNull();
  });
});
