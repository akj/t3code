import { useCallback, useEffect, useRef, useState } from "react";

import { Menu, MenuItem, MenuPopup } from "../ui/menu";

interface LinkMenuItem {
  id: string;
  label: string;
}

interface LinkMenuState {
  items: readonly LinkMenuItem[];
  trigger: HTMLElement;
  position: { x: number; y: number };
}

const FOCUSABLE_SELECTOR =
  'a[href],button,input,select,textarea,summary,iframe,[tabindex],[contenteditable]:not([contenteditable="false"])';

/**
 * Focuses the first element after `from` in document order that accepts focus,
 * skipping the menu popup and Base UI focus guards. Returns false if none did.
 */
function focusNextAfter(from: HTMLElement, popup: HTMLElement): boolean {
  for (const candidate of from.ownerDocument.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) {
    if (
      !(from.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING) ||
      from.contains(candidate) ||
      popup.contains(candidate) ||
      candidate.tabIndex < 0 ||
      candidate.hasAttribute("data-base-ui-focus-guard")
    ) {
      continue;
    }
    // Hidden, inert, and disabled elements ignore focus(), so let the browser decide.
    candidate.focus();
    if (candidate.ownerDocument.activeElement === candidate) return true;
  }
  return false;
}

/** Keeps message link focus and menu focus in the same accessibility tree. */
export function useMessageLinkMenu() {
  const [state, setState] = useState<LinkMenuState | null>(null);
  const pending = useRef<((value: string | null) => void) | null>(null);
  // Set when Tab already moved focus past the link, so closing must not pull it back.
  const tabbedPast = useRef(false);
  const complete = useCallback((value: string | null) => {
    const resolve = pending.current;
    pending.current = null;
    setState(null);
    resolve?.(value);
  }, []);

  useEffect(() => () => pending.current?.(null), []);

  const show = useCallback(
    <T extends string>(
      items: readonly { id: T; label: string }[],
      position: { x: number; y: number },
      trigger: HTMLElement,
    ): Promise<T | null> => {
      pending.current?.(null);
      pending.current = null;
      if (items.length === 0) {
        setState(null);
        return Promise.resolve(null);
      }
      if (position.x === 0 && position.y === 0) {
        const bounds = trigger.getBoundingClientRect();
        position = { x: bounds.left, y: bounds.bottom };
      }
      return new Promise((resolve) => {
        tabbedPast.current = false;
        pending.current = (value) => resolve(value as T | null);
        setState({ items, position, trigger });
      });
    },
    [],
  );

  const menu = state && (
    <Menu
      defaultOpen
      onOpenChange={(open) => {
        if (!open) complete(null);
      }}
    >
      <MenuPopup
        align="start"
        sideOffset={0}
        anchor={{
          getBoundingClientRect: () => new DOMRect(state.position.x, state.position.y, 0, 0),
        }}
        aria-label="Link options"
        finalFocus={() => (tabbedPast.current ? false : state.trigger)}
        // Base UI handles Shift+Tab, but forward Tab relies on focus guards that only a
        // MenuTrigger renders. Leave the menu as if it had been opened from the link.
        onKeyDown={(event) => {
          if (event.key !== "Tab" || event.shiftKey) return;
          event.preventDefault();
          tabbedPast.current = focusNextAfter(state.trigger, event.currentTarget);
          complete(null);
        }}
        onFocus={(event) => {
          if (event.target === event.currentTarget) {
            event.currentTarget.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
          }
        }}
      >
        {state.items.map((item) => (
          <MenuItem key={item.id} onClick={() => complete(item.id)}>
            {item.label}
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );

  return { show, menu };
}
