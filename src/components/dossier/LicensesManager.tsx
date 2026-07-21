import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useToast } from "@/providers/toast";

const STATUSES = ["VALIDE", "SUSPENDU", "RETIRE", "AUCUN"] as const;
const TONE: Record<string, string> = {
  VALIDE: "var(--success)",
  SUSPENDU: "var(--warning)",
  RETIRE: "var(--danger)",
  AUCUN: "var(--muted)",
};
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

type License = {
  _id: string;
  licenseTypeId: string;
  name: string;
  status: string;
  note: string | null;
};

// Gestion des licences / permis d'un citoyen (§2, bloc B).
export function LicensesManager({
  citizenId,
  licenses,
  canManage,
}: {
  citizenId: Id<"citizens">;
  licenses: License[];
  canManage: boolean;
}) {
  const toast = useToast();
  const options = useQuery(api.citizens.licenseOptions);
  const setLicense = useMutation(api.citizens.licenseSet);
  const removeLicense = useMutation(api.citizens.licenseRemove);
  const [adding, setAdding] = useState<string>("");

  const held = new Set(licenses.map((l) => l.licenseTypeId));
  const available = (options ?? []).filter((o) => !held.has(o._id));

  async function changeStatus(l: License, status: string) {
    await toast.guard(
      setLicense({
        citizenId,
        licenseTypeId: l.licenseTypeId as Id<"licenseTypes">,
        status: status as (typeof STATUSES)[number],
      }),
      "Mise à jour impossible",
    );
  }

  async function add() {
    if (!adding) return;
    const r = await toast.guard(
      setLicense({ citizenId, licenseTypeId: adding as Id<"licenseTypes">, status: "VALIDE" }),
      "Ajout impossible",
    );
    if (r !== undefined) {
      setAdding("");
      toast.success("Licence ajoutée.");
    }
  }

  return (
    <div>
      {licenses.length === 0 ? (
        <div className="text-[12.5px] text-faint">Aucune licence enregistrée.</div>
      ) : (
        <div className="grid grid-cols-2 gap-[10px]">
          {licenses.map((l) => (
            <div
              key={l._id}
              className="flex items-center gap-[10px] rounded-sm border border-border bg-surface-2 px-[13px] py-[10px]"
            >
              <div className="flex-1 text-[13px] font-semibold">{l.name}</div>
              {canManage ? (
                <>
                  <select
                    value={l.status}
                    onChange={(e) => changeStatus(l, e.target.value)}
                    className="h-8 rounded-sm border border-border bg-surface px-2 text-[12px] font-semibold outline-none focus:border-accent"
                    style={{ color: TONE[l.status] }}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {cap(s)}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={async () => {
                      await toast.guard(removeLicense({ id: l._id as Id<"citizenLicenses"> }), "Suppression impossible");
                    }}
                    className="flex h-[28px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface text-faint hover:text-danger"
                    title="Retirer"
                  >
                    <Trash2 className="h-[14px] w-[14px]" />
                  </button>
                </>
              ) : (
                <span
                  className="rounded-[5px] px-[8px] py-[3px] text-[11px] font-semibold"
                  style={{ background: `color-mix(in srgb, ${TONE[l.status]} 12%, transparent)`, color: TONE[l.status] }}
                >
                  {cap(l.status)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && available.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <select
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            className="h-9 flex-1 rounded-sm border border-border bg-surface-2 px-2 text-[12.5px] outline-none focus:border-accent"
          >
            <option value="">Ajouter une licence…</option>
            {available.map((o) => (
              <option key={o._id} value={o._id}>
                {o.name}
              </option>
            ))}
          </select>
          <button
            onClick={add}
            disabled={!adding}
            className="flex items-center gap-[6px] rounded-sm bg-accent px-[12px] py-[7px] text-[12.5px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50"
          >
            <Plus className="h-[14px] w-[14px]" /> Ajouter
          </button>
        </div>
      )}
    </div>
  );
}
