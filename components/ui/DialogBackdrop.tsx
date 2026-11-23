"use client";

import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";

type ScrollLockSnapshot = {
  scrollY: number;
  body: {
    overflow: string;
    position: string;
    top: string;
    right: string;
    left: string;
    width: string;
  };
  htmlOverflow: string;
};

let scrollLockCount = 0;
let scrollLockSnapshot: ScrollLockSnapshot | null = null;
let dialogSequence = 0;

const focusableSelector = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[contenteditable]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableElements(scope: HTMLElement) {
  return Array.from(
    scope.querySelectorAll<HTMLElement>(focusableSelector),
  ).filter((element) => {
    const style = window.getComputedStyle(element);
    return style.visibility !== "hidden" && style.display !== "none";
  });
}

function ensureDialogSemantics(root: HTMLElement, closeLabel: string) {
  const firstChild = Array.from(root.children).find(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  const dialog =
    root.querySelector<HTMLElement>(
      '[role="dialog"], [role="alertdialog"], .dialog, .dialog-card, .home-manager-dialog, .absence-dialog, .announcement-popup',
    ) ??
    firstChild ??
    root;
  if (!dialog) return root;

  if (!dialog.getAttribute("role")) dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  if (
    !dialog.hasAttribute("aria-label") &&
    !dialog.hasAttribute("aria-labelledby")
  ) {
    const heading = dialog.querySelector<HTMLElement>(
      "h1, h2, h3, [data-dialog-title]",
    );
    if (heading) {
      if (!heading.id) {
        dialogSequence += 1;
        heading.id = `dialog-title-${dialogSequence}`;
      }
      dialog.setAttribute("aria-labelledby", heading.id);
    } else {
      dialog.setAttribute("aria-label", "Dialog");
    }
  }

  const closeButton = dialog.querySelector<HTMLElement>(
    ".dialog-header > button, .dialog-heading > button, header > button",
  );
  if (closeButton && !closeButton.getAttribute("aria-label")) {
    closeButton.setAttribute("aria-label", closeLabel);
  }
  return dialog;
}

function lockPageScroll() {
  scrollLockCount += 1;
  if (scrollLockCount > 1) return;

  const body = document.body;
  const html = document.documentElement;
  scrollLockSnapshot = {
    scrollY: window.scrollY,
    body: {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      right: body.style.right,
      left: body.style.left,
      width: body.style.width,
    },
    htmlOverflow: html.style.overflow,
  };

  html.style.overflow = "hidden";
  body.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${scrollLockSnapshot.scrollY}px`;
  body.style.right = "0";
  body.style.left = "0";
  body.style.width = "100%";
}

function unlockPageScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount > 0 || !scrollLockSnapshot) return;

  const snapshot = scrollLockSnapshot;
  scrollLockSnapshot = null;
  const body = document.body;
  document.documentElement.style.overflow = snapshot.htmlOverflow;
  body.style.overflow = snapshot.body.overflow;
  body.style.position = snapshot.body.position;
  body.style.top = snapshot.body.top;
  body.style.right = snapshot.body.right;
  body.style.left = snapshot.body.left;
  body.style.width = snapshot.body.width;
  window.scrollTo(0, snapshot.scrollY);
}

export function DialogBackdrop({
  children,
  onClose,
  className = "dialog-backdrop",
  confirmWhenDirty = true,
}: {
  children: ReactNode;
  onClose: () => void;
  className?: string;
  confirmWhenDirty?: boolean;
}) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    lockPageScroll();
    const root = rootRef.current;
    if (!root) return unlockPageScroll;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = ensureDialogSemantics(root, t("Close"));
    const siblings = Array.from(document.body.children).filter(
      (element) => element !== root,
    ) as HTMLElement[];
    const siblingState = siblings.map((element) => ({
      element,
      ariaHidden: element.getAttribute("aria-hidden"),
      inert: (element as HTMLElement & { inert?: boolean }).inert ?? false,
    }));
    siblings.forEach((element) => {
      (element as HTMLElement & { inert?: boolean }).inert = true;
      element.setAttribute("aria-hidden", "true");
    });

    const focusTarget =
      dialog.querySelector<HTMLElement>("[data-dialog-initial-focus]") ??
      dialog.querySelector<HTMLElement>(
        "h1, h2, h3, input, select, textarea, button",
      );
    if (focusTarget) {
      if (!focusTarget.matches(focusableSelector)) {
        focusTarget.setAttribute("tabindex", "-1");
      }
      window.requestAnimationFrame(() => focusTarget.focus());
    }

    return () => {
      siblingState.forEach(({ element, ariaHidden, inert }) => {
        (element as HTMLElement & { inert?: boolean }).inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
      unlockPageScroll();
      window.requestAnimationFrame(() => previousFocusRef.current?.focus());
    };
  }, [mounted, t]);

  useEffect(() => {
    if (!mounted || !confirming) return;
    const confirmation =
      rootRef.current?.querySelector<HTMLElement>(".dialog-confirm");
    const target = confirmation?.querySelector<HTMLElement>("button");
    window.requestAnimationFrame(() => target?.focus());
  }, [confirming, mounted]);

  useEffect(() => {
    if (!mounted) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (confirming) setConfirming(false);
      else if (dirty && confirmWhenDirty) setConfirming(true);
      else onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [confirmWhenDirty, confirming, dirty, mounted, onClose]);

  function requestClose() {
    if (dirty && confirmWhenDirty) setConfirming(true);
    else onClose();
  }

  if (!mounted) return null;

  return createPortal(
    <div
      ref={rootRef}
      className={className}
      role="presentation"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const scope = confirming
          ? rootRef.current?.querySelector<HTMLElement>(".dialog-confirm")
          : (rootRef.current?.querySelector<HTMLElement>(
              '[role="dialog"], [role="alertdialog"], .dialog, .dialog-card, .home-manager-dialog, .absence-dialog, .announcement-popup',
            ) ??
            (rootRef.current?.firstElementChild instanceof HTMLElement
              ? rootRef.current.firstElementChild
              : undefined));
        if (!scope) return;
        const items = focusableElements(scope);
        if (items.length === 0) {
          event.preventDefault();
          scope.focus();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onInputCapture={() => setDirty(true)}
      onChangeCapture={() => setDirty(true)}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      {children}
      {confirming && (
        <div className="dialog-confirm-layer" role="presentation">
          <section
            className="dialog-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-dialog-title"
          >
            <span>
              <AlertTriangle size={21} />
            </span>
            <h3 id="discard-dialog-title">{t("Discard unsaved changes?")}</h3>
            <p>{t("The information you entered will not be saved.")}</p>
            <div>
              <button
                className="button ghost-button"
                type="button"
                onClick={() => setConfirming(false)}
              >
                {t("Continue editing")}
              </button>
              <button
                className="button danger-button"
                type="button"
                onClick={onClose}
              >
                {t("Discard and close")}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>,
    document.body,
  );
}
