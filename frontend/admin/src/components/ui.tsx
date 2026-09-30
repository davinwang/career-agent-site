import type { ReactNode, HTMLAttributes } from "react";
import { useT } from "../lib/i18n";
import { IconSpinner, IconClose } from "./icons";

/** Small uppercase section heading with an optional trailing action. */
export function SectionHead({
  title,
  en,
  action,
}: {
  title: string;
  en?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4 border-b pb-3" style={{ borderColor: "var(--rule)" }}>
      <div className="leading-tight">
        <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
        {en && <div className="label text-[0.62rem]">{en}</div>}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = "",
  ...rest
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`card ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  const t = useT();
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-[var(--text-muted)]">
      <IconSpinner width={18} height={18} />
      <span className="label">{label ?? t("common.loading")}</span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-14 text-center" style={{ borderColor: "var(--rule)" }}>
      {icon && <div className="text-[var(--text-muted)] opacity-60">{icon}</div>}
      <div>
        <div className="font-display text-base font-semibold">{title}</div>
        {hint && <div className="mt-1 text-sm text-[var(--text-muted)]">{hint}</div>}
      </div>
      {action}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div
      className="rounded-md border px-4 py-3 text-sm"
      style={{ borderColor: "var(--color-ember-500)", background: "var(--accent-soft)", color: "var(--text)" }}
      role="alert"
    >
      {message}
    </div>
  );
}

const BADGE_TONES: Record<string, { fg: string; bg: string }> = {
  neutral: { fg: "var(--text-muted)", bg: "color-mix(in srgb, var(--rule) 45%, transparent)" },
  accent: { fg: "var(--accent)", bg: "var(--accent-soft)" },
  moss: { fg: "var(--color-moss-500)", bg: "color-mix(in srgb, var(--color-moss-500) 16%, transparent)" },
  warn: { fg: "var(--color-ember-500)", bg: "var(--accent-soft)" },
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONES;
}) {
  const t = BADGE_TONES[tone];
  return (
    <span
      className="label inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.6rem]"
      style={{ color: t.fg, background: t.bg }}
    >
      {children}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={`rise relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-lg border shadow-2xl ${wide ? "max-w-3xl" : "max-w-lg"}`}
        style={{ background: "var(--surface)", borderColor: "var(--rule)" }}
      >
        <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "var(--rule)" }}>
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="focus-ring grid h-8 w-8 place-items-center rounded-md text-[var(--text-muted)] hover:text-[var(--accent)]"
          >
            <IconClose width={18} height={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
