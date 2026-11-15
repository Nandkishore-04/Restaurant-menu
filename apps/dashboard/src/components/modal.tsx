"use client";

import { useEffect, type ReactNode } from "react";

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal aria-label={title}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div className="relative flex max-h-[90dvh] w-full max-w-lg flex-col rounded-2xl border border-border bg-surface shadow-2xl">
        <h2 className="border-b border-border px-6 py-4 text-lg font-semibold">{title}</h2>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">{children}</div>
        <footer className="flex items-center gap-3 border-t border-border px-6 py-4">{footer}</footer>
      </div>
    </div>
  );
}

export const fieldClass =
  "mt-1.5 w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 outline-none focus:border-brand";
