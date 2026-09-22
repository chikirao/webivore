import { useEffect, useRef, useState } from "react";
import { FileHtmlIcon, FileImageIcon, PackageIcon, UploadSimpleIcon, XIcon } from "@phosphor-icons/react";
import type { ImportKind } from "./local-import";
import { detectImportKind } from "./local-import";
import { Plate } from "./ui/Plate";

const options: { kind: ImportKind; label: string; detail: string; accept: string; icon: typeof PackageIcon }[] = [
  { kind: "level", label: "WEBIVORE level", detail: "Open an exported .webivore.json map", accept: ".webivore.json,application/json", icon: PackageIcon },
  { kind: "html", label: "HTML page", detail: "Safe simplified local conversion", accept: ".html,.htm,text/html", icon: FileHtmlIcon },
  { kind: "image", label: "Page image", detail: "PNG, JPEG or WebP screenshot", accept: ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp", icon: FileImageIcon },
];

export function ImportDialog({ open, busy, status, error, onClose, onCancel, onImport }: {
  open: boolean;
  busy: boolean;
  status: string;
  error: string;
  onClose: () => void;
  onCancel: () => void;
  onImport: (file: File, kind?: ImportKind) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [picker, setPicker] = useState<(typeof options)[number] | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("button")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") (busy ? onCancel : onClose)();
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = [...panel.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), [href], [tabindex]:not([tabindex="-1"])',
      )].filter((element) => element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [open, busy, onCancel, onClose]);
  if (!open) return null;
  const choose = (option: (typeof options)[number]) => {
    setPicker(option);
    if (input.current) {
      input.current.accept = option.accept;
      input.current.value = "";
      input.current.click();
    }
  };
  return (
    <div className="import-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <Plate shape="cut" cut={28} fill="var(--paper)" line="var(--ink)" lineWidth={4} className="import-sheet">
        <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="import-title" aria-describedby="import-note">
          <button className="import-close" onClick={busy ? onCancel : onClose} aria-label={busy ? "Cancel import" : "Close import"}>
            <XIcon weight="bold" />
          </button>
          <span className="label">Local / private</span>
          <h2 id="import-title" className="display">Import file</h2>
          <p id="import-note">Files stay in this browser. Nothing is uploaded to the snapshot API.</p>
          <div className="import-options">
            {options.map((option) => {
              const Icon = option.icon;
              return (
                <button key={option.kind} disabled={busy} onClick={() => choose(option)}>
                  <Icon weight="bold" />
                  <span><b>{option.label}</b><small>{option.detail}</small></span>
                </button>
              );
            })}
          </div>
          <div
            className={`import-drop${dragging ? " is-dragging" : ""}`}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files[0];
              if (file && !busy) onImport(file, detectImportKind(file) ?? undefined);
            }}
          >
            <UploadSimpleIcon weight="bold" />
            <span>or drop one supported file here</span>
          </div>
          {status && <p className="import-progress" role="status">{status}</p>}
          {error && <p className="import-error" role="alert">{error}</p>}
          {busy && <button className="import-cancel" onClick={onCancel}>Cancel</button>}
          <input
            ref={input}
            className="sr-only"
            type="file"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImport(file, picker?.kind);
            }}
          />
        </div>
      </Plate>
    </div>
  );
}
