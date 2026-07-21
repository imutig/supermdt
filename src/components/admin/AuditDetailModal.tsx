import { X } from "lucide-react";
import { useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { AgentTag } from "@/components/common/AgentTag";
import { actionLabel, resourceLabel, fieldLabel } from "@/lib/auditLabels";

function fmtValue(v: unknown): string {
  if (v == null) return "-";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "-";
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "number") return v.toLocaleString("fr-FR");
  return String(v);
}

export function AuditDetailModal({
  id,
  onClose,
}: {
  id: Id<"auditLog">;
  onClose: () => void;
}) {
  const entry = useQuery(api.audit.get, { id });

  // Ensemble des clés modifiées (avant ∪ après).
  const before = (entry?.before ?? null) as Record<string, unknown> | null;
  const after = (entry?.after ?? null) as Record<string, unknown> | null;
  const diffKeys = Array.from(
    new Set([...(before ? Object.keys(before) : []), ...(after ? Object.keys(after) : [])]),
  );

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex justify-end"
      style={{
        background: "var(--scrim)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        animation: "mdtFade .15s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-[560px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]"
        style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}
      >
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <div className="flex-1">
            <h2 className="m-0 text-[15px] font-bold">Détail du journal</h2>
            <div className="mt-[2px] text-[12px] text-muted">
              {entry ? new Date(entry.at).toLocaleString("fr-FR") : "…"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-[18px] overflow-y-auto px-[18px] py-4">
          {entry === undefined ? (
            <div className="text-[13px] text-muted">Chargement…</div>
          ) : entry === null ? (
            <div className="text-[13px] text-muted">Entrée introuvable.</div>
          ) : (
            <>
              {/* Phrase résumée */}
              <div className="rounded-sm border border-border bg-surface-2 px-[14px] py-[12px] text-[13.5px] leading-[1.5]">
                <AgentTag
                  agent={{ matricule: entry.actorMatricule, name: entry.actorName }}
                  className="font-semibold"
                />{" "}
                {actionLabel(entry.action)}
                {entry.resourceLabel ? (
                  <>
                    {" "}
                    · <b>{entry.resourceLabel}</b>
                  </>
                ) : null}
              </div>

              {/* Métadonnées structurées */}
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border">
                <F label="Action">
                  <span className="font-data text-[12px]">{entry.action}</span>
                </F>
                <F label="Type de ressource">{resourceLabel(entry.resourceType)}</F>
                <F label="Ressource">{entry.resourceLabel ?? "-"}</F>
                <F label="Grade acteur">{entry.actor?.gradeName ?? (entry.actor?.isOwner ? "Owner" : "-")}</F>
              </div>

              {/* Diff avant / après */}
              {diffKeys.length > 0 && (
                <div>
                  <div className="mb-[8px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">
                    Modifications
                  </div>
                  <div className="overflow-hidden rounded-sm border border-border">
                    <div className="grid grid-cols-[1fr_1.2fr_1.2fr] gap-2 border-b border-border bg-surface-2 px-3 py-[7px] text-[10px] font-bold uppercase tracking-[0.06em] text-faint">
                      <span>Champ</span>
                      <span>Avant</span>
                      <span>Après</span>
                    </div>
                    {diffKeys.map((k) => {
                      const b = before?.[k];
                      const a = after?.[k];
                      const changed = fmtValue(b) !== fmtValue(a);
                      return (
                        <div
                          key={k}
                          className="grid grid-cols-[1fr_1.2fr_1.2fr] gap-2 border-b border-border px-3 py-[8px] text-[12px]"
                        >
                          <span className="font-semibold">{fieldLabel(k)}</span>
                          <span className="text-muted">{fmtValue(b)}</span>
                          <span style={changed ? { color: "var(--accent)", fontWeight: 600 } : undefined}>
                            {fmtValue(a)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Métadonnées libres */}
              {entry.metadata != null && (
                <div>
                  <div className="mb-[8px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">
                    Informations complémentaires
                  </div>
                  <div className="flex flex-col gap-px overflow-hidden rounded-sm border border-border bg-border">
                    {Object.entries(entry.metadata as Record<string, unknown>).map(([k, val]) => (
                      <div key={k} className="flex gap-3 bg-surface-2 px-3 py-[8px] text-[12px]">
                        <span className="min-w-[130px] font-semibold">{fieldLabel(k)}</span>
                        <span className="text-muted">{fmtValue(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-2 px-3 py-[10px]">
      <div className="mb-[3px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
        {label}
      </div>
      <div className="text-[13px]">{children}</div>
    </div>
  );
}
