import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X, ChevronUp, ChevronDown } from "lucide-react";
import { useToast } from "@/providers/toast";

export interface Column {
  key: string;
  label: string;
  type?: "text" | "bool" | "color" | "select" | "number";
  options?: { value: string; label: string }[];
  width?: string;
}

type Row = Record<string, unknown> & { _id: string };

// Éditeur générique de référentiel (liste) : ajout / édition inline / suppression (§16).
export function ListEditor({
  title,
  description,
  rows,
  columns,
  onCreate,
  onUpdate,
  onRemove,
  onMove,
}: {
  title: string;
  description?: string;
  rows: Row[] | undefined;
  columns: Column[];
  onCreate: (values: Record<string, unknown>) => Promise<unknown>;
  onUpdate: (id: string, values: Record<string, unknown>) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
  // Fourni uniquement quand l'ordre des lignes porte un sens (hiérarchie).
  onMove?: (id: string, direction: "up" | "down") => Promise<unknown>;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [adding, setAdding] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const blank = () => {
    const o: Record<string, unknown> = {};
    for (const c of columns) o[c.key] = c.type === "bool" ? false : c.type === "select" ? c.options?.[0]?.value ?? "" : "";
    return o;
  };

  function startEdit(r: Row) {
    setAdding(false);
    setEditing(r._id);
    const o: Record<string, unknown> = {};
    for (const c of columns) o[c.key] = r[c.key] ?? (c.type === "bool" ? false : "");
    setDraft(o);
  }

  async function save() {
    const values = { ...draft };
    for (const c of columns) {
      if (c.type === "number" && values[c.key] !== "" && values[c.key] != null)
        values[c.key] = Number(values[c.key]);
    }
    if (adding) {
      const r = await toast.guard(onCreate(values), "Création impossible");
      if (r !== undefined) {
        setAdding(false);
        toast.success("Ajouté.");
      }
    } else if (editing) {
      const r = await toast.guard(onUpdate(editing, values), "Modification impossible");
      if (r !== undefined) {
        setEditing(null);
        toast.success("Modifié.");
      }
    }
  }

  function field(c: Column) {
    const val = draft[c.key];
    if (c.type === "bool") {
      return (
        <input
          type="checkbox"
          checked={!!val}
          onChange={(e) => setDraft({ ...draft, [c.key]: e.target.checked })}
          className="h-4 w-4 accent-[var(--accent)]"
        />
      );
    }
    if (c.type === "color") {
      return <ColorField value={String(val ?? "")} onChange={(v) => setDraft({ ...draft, [c.key]: v })} />;
    }
    if (c.type === "select") {
      return (
        <select
          value={String(val ?? "")}
          onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })}
          className="h-8 w-full rounded-sm border border-border bg-surface px-2 text-[12.5px] outline-none focus:border-accent"
        >
          {c.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        value={String(val ?? "")}
        type={c.type === "number" ? "number" : "text"}
        step="any"
        onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })}
        className="h-8 w-full rounded-sm border border-border bg-surface px-2 text-[12.5px] outline-none focus:border-accent"
      />
    );
  }

  const gridCols = columns.map((c) => c.width ?? "1fr").join(" ") + " auto";

  return (
    <div className="rounded-card border border-border bg-surface">
      <div className="flex items-center gap-3 border-b border-border px-4 py-[13px]">
        <div className="flex-1">
          <h2 className="m-0 text-[14px] font-bold">{title}</h2>
          {description && <div className="mt-[2px] text-[11.5px] text-muted">{description}</div>}
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setAdding(true);
            setDraft(blank());
          }}
          className="flex items-center gap-[6px] rounded-sm bg-accent px-[11px] py-[6px] text-[12px] font-semibold text-accent-contrast hover:brightness-[1.06]"
        >
          <Plus className="h-[14px] w-[14px]" /> Ajouter
        </button>
      </div>

      <div
        className="grid gap-2 border-b border-border px-4 py-[9px] text-[10px] font-bold uppercase tracking-[0.07em] text-faint"
        style={{ gridTemplateColumns: gridCols }}
      >
        {columns.map((c) => (
          <span key={c.key}>{c.label}</span>
        ))}
        <span></span>
      </div>

      {adding && (
        <div className="grid items-center gap-2 border-b border-border bg-surface-2 px-4 py-[9px]" style={{ gridTemplateColumns: gridCols }}>
          {columns.map((c) => (
            <span key={c.key}>{field(c)}</span>
          ))}
          <span className="flex gap-1">
            <IconBtn onClick={save} tone="ok"><Check className="h-4 w-4" /></IconBtn>
            <IconBtn onClick={() => setAdding(false)}><X className="h-4 w-4" /></IconBtn>
          </span>
        </div>
      )}

      {rows === undefined ? (
        <div className="px-4 py-8 text-center text-[13px] text-faint">Chargement…</div>
      ) : rows.length === 0 && !adding ? (
        <div className="px-4 py-8 text-center text-[13px] text-faint">Aucun élément.</div>
      ) : (
        rows.map((r) =>
          editing === r._id ? (
            <div key={r._id} className="grid items-center gap-2 border-b border-border bg-surface-2 px-4 py-[9px]" style={{ gridTemplateColumns: gridCols }}>
              {columns.map((c) => (
                <span key={c.key}>{field(c)}</span>
              ))}
              <span className="flex gap-1">
                <IconBtn onClick={save} tone="ok"><Check className="h-4 w-4" /></IconBtn>
                <IconBtn onClick={() => setEditing(null)}><X className="h-4 w-4" /></IconBtn>
              </span>
            </div>
          ) : (
            <div key={r._id} className="grid items-center gap-2 border-b border-border px-4 py-[9px] text-[12.5px]" style={{ gridTemplateColumns: gridCols }}>
              {columns.map((c) => (
                <span key={c.key} className="min-w-0 truncate">
                  {c.type === "bool" ? (
                    (r[c.key] ? "Oui" : "-")
                  ) : c.type === "color" ? (
                    <span className="flex items-center gap-2">
                      <span className="h-[13px] w-[13px] rounded-[3px] border border-border" style={{ background: String(r[c.key] ?? "transparent") }} />
                      <span className="truncate text-muted">{String(r[c.key] ?? "-")}</span>
                    </span>
                  ) : c.type === "select" ? (
                    c.options?.find((o) => o.value === r[c.key])?.label ?? String(r[c.key] ?? "-")
                  ) : (
                    String(r[c.key] ?? "-")
                  )}
                </span>
              ))}
              <span className="flex items-center gap-1">
                {confirmDel === r._id ? (
                  <>
                    <button
                      onClick={async () => {
                        const res = await toast.guard(onRemove(r._id), "Suppression impossible");
                        setConfirmDel(null);
                        if (res !== undefined) toast.success("Supprimé.");
                      }}
                      className="rounded-[4px] px-[7px] py-[3px] text-[11px] font-semibold text-white"
                      style={{ background: "var(--danger)" }}
                    >
                      Ok
                    </button>
                    <IconBtn onClick={() => setConfirmDel(null)}><X className="h-4 w-4" /></IconBtn>
                  </>
                ) : (
                  <>
                    {onMove && (
                      <>
                        <IconBtn onClick={() => toast.guard(onMove(r._id, "up"), "Déplacement impossible")}><ChevronUp className="h-[14px] w-[14px]" /></IconBtn>
                        <IconBtn onClick={() => toast.guard(onMove(r._id, "down"), "Déplacement impossible")}><ChevronDown className="h-[14px] w-[14px]" /></IconBtn>
                      </>
                    )}
                    <IconBtn onClick={() => startEdit(r)}><Pencil className="h-[14px] w-[14px]" /></IconBtn>
                    <IconBtn onClick={() => setConfirmDel(r._id)} tone="danger"><Trash2 className="h-[14px] w-[14px]" /></IconBtn>
                  </>
                )}
              </span>
            </div>
          ),
        )
      )}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "ok" | "danger";
}) {
  const color = tone === "ok" ? "var(--success)" : tone === "danger" ? "var(--danger)" : "var(--muted)";
  return (
    <button
      onClick={onClick}
      className="flex h-[26px] w-[26px] items-center justify-center rounded-sm border border-border bg-surface-2 hover:border-border-strong"
      style={{ color }}
    >
      {children}
    </button>
  );
}

// Sélecteur de couleur : teintes prédéfinies cohérentes avec la charte, plus
// une pipette système pour une teinte libre. Remplace la saisie hexadécimale
// à l'aveugle, qui laissait passer n'importe quelle chaîne.
const SWATCHES = [
  "#49A24A", "#2E6B2F", "#3B82F6", "#1D4ED8", "#8B5CF6",
  "#D94040", "#E0A030", "#0EA5E9", "#EC4899", "#8A929C",
];

function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = value || "";

  return (
    <span className="relative flex items-center gap-[6px]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={current || "Aucune couleur"}
        className="h-[26px] w-[34px] flex-shrink-0 rounded-sm border border-border hover:border-border-strong"
        style={{
          background: current || "transparent",
          backgroundImage: current ? undefined : "linear-gradient(45deg,transparent 44%,var(--faint) 44%,var(--faint) 56%,transparent 56%)",
        }}
      />
      <span className="truncate font-data text-[11px] text-faint">{current || "auto"}</span>

      {open && (
        <>
          <span className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <span className="absolute left-0 top-full z-30 mt-1 w-[188px] rounded-sm border border-border-strong bg-elev p-[9px] shadow-[0_12px_30px_rgba(0,0,0,.3)]">
            <span className="mb-[7px] flex flex-wrap gap-[6px]">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => { onChange(c); setOpen(false); }}
                  className="h-[22px] w-[22px] rounded-[5px] border hover:border-accent"
                  style={{ background: c, borderColor: current.toUpperCase() === c ? "var(--text)" : "var(--border)" }}
                />
              ))}
            </span>
            <span className="flex items-center gap-[6px]">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(current) ? current : "#49A24A"}
                onChange={(e) => onChange(e.target.value.toUpperCase())}
                className="h-[26px] w-[34px] cursor-pointer rounded-sm border border-border bg-transparent p-0"
              />
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                className="flex-1 rounded-sm border border-border px-2 py-[5px] text-[11.5px] font-semibold text-muted hover:border-border-strong"
              >
                Aucune
              </button>
            </span>
          </span>
        </>
      )}
    </span>
  );
}
