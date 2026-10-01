// @vitest-environment jsdom

import { act, createRef, useImperativeHandle } from "react";
import { createRoot, type Root } from "react-dom/client";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useMessageLinkMenu } from "./useMessageLinkMenu";

let renderer: ReactTestRenderer | undefined;

afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

describe("message link menu positioning", () => {
  it.each([
    { position: { x: 0, y: 0 }, expected: { x: 120, y: 260 } },
    { position: { x: 145, y: 245 }, expected: { x: 145, y: 245 } },
    { position: { x: 0, y: 245 }, expected: { x: 0, y: 245 } },
    { position: { x: 145, y: 0 }, expected: { x: 145, y: 0 } },
  ])("anchors a menu opened at $position to $expected", async ({ position, expected }) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal(
      "DOMRect",
      class {
        constructor(
          readonly x: number,
          readonly y: number,
          readonly width: number,
          readonly height: number,
        ) {}
      },
    );
    const linkMenuRef = createRef<ReturnType<typeof useMessageLinkMenu>>();
    function TestLinkMenu() {
      const linkMenu = useMessageLinkMenu();
      useImperativeHandle(linkMenuRef, () => linkMenu, [linkMenu]);
      return null;
    }
    const trigger = {
      getBoundingClientRect: () => ({ left: 120, bottom: 260 }),
    } as HTMLElement;

    await act(() => {
      renderer = create(<TestLinkMenu />);
    });
    await act(() => {
      void linkMenuRef.current!.show([{ id: "copy-link", label: "Copy Link" }], position, trigger);
    });

    // Evaluate the virtual anchor consumed by the popup's positioning engine.
    const popup = linkMenuRef.current!.menu?.props.children;
    expect(popup.props.anchor.getBoundingClientRect()).toMatchObject({
      ...expected,
      width: 0,
      height: 0,
    });
  });
});

describe("message link menu keyboard focus", () => {
  let root: Root;
  let container: HTMLDivElement;
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

  // Base UI moves initial focus and returns final focus in animation frames and microtasks.
  async function settle() {
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }

  async function openMenuFromLink() {
    const link = byText("Example");
    link.focus();
    await act(async () => {
      link.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    await settle();
    expect(document.activeElement?.getAttribute("role")).toBe("menuitem");
    return link;
  }

  async function press(key: string, init: KeyboardEventInit = {}) {
    const target = document.activeElement ?? document.body;
    await act(async () => {
      target.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
      );
    });
    await settle();
  }

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<LinkWithMenu />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("closes on Tab and focuses the next tabbable element after the link", async () => {
    await openMenuFromLink();
    await press("Tab");

    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(byText("After"));
    await expect(chosen).resolves.toBeNull();
  });

  it("closes on Shift+Tab and focuses the link", async () => {
    const link = await openMenuFromLink();
    await press("Tab", { shiftKey: true });

    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(link);
    await expect(chosen).resolves.toBeNull();
  });

  it("closes on Escape and focuses the link", async () => {
    const link = await openMenuFromLink();
    await press("Escape");

    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(link);
    await expect(chosen).resolves.toBeNull();
  });
});
