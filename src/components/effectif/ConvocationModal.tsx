import { useState } from "react";
import { X } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { useToast } from "@/providers/toast";
import { AgentSelect } from "@/components/common/AgentSelect";

const FIELD = "h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] outline-none focus:border-accent";

// Convocation d'un agent devant l'IA : agent recensé (ping via Discord lié) ou
// ID Discord saisi à la main, avec motif + date.
export function ConvocationModal({ initialAgentId, onClose }: { initialAgentId?: Id<"agents">; onClose: () => void }) {
  const roster = useQuery(api.agents.pickerList);
  const create = useMutation(api.convocations.create);
  const toast = useToast();
  const [mode, setMode] = useState<"agent" | "discord">("agent");
  const [agentId, setAgentId] = useState<string>(initialAgentId ?? "");
  const [discordId, setDiscordId] = useState("");
  const [motif, setMotif] = useState("");
  const [convokedAtWall, setConvokedAtWall] = useState("");
  const [lieu, setLieu] = useState("");
  const [busy, setBusy] = useState(false);

  const valid = motif.trim() && (mode === "agent" ? !!agentId : /^\d{17,20}$/.test(discordId.trim()));

  async function submit() {
    if (!valid) return;
    setBusy(true);
    const r = await toast.guard(create({
      agentId: mode === "agent" ? (agentId as Id<"agents">) : undefined,
      discordId: mode === "discord" ? discordId.trim() : undefined,
      motif: motif.trim(),
      convokedAtWall: convokedAtWall || undefined,
      lieu: lieu.trim() || undefined,
    }), "Convocation impossible");
    setBusy(false);
    if (r !== undefined) { toast.success("Convocation envoyée."); onClose(); }
  }

  return (
    <div onClick={(e) => { e.stopPropagation(); onClose(); }} className="fixed inset-0 z-[70] flex justify-end" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-[460px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]" style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <h2 className="m-0 flex-1 text-[15px] font-bold">Nouvelle convocation</h2>
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-[18px] py-4">
          <div>
            <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Convoqué</div>
            <div className="mb-2 flex gap-1">
              <button onClick={() => setMode("agent")} className="rounded-[5px] border px-[9px] py-[4px] text-[11.5px] font-semibold" style={mode === "agent" ? { borderColor: "var(--accent)", color: "var(--accent)" } : { borderColor: "var(--border)", color: "var(--muted)" }}>Agent recensé</button>
              <button onClick={() => setMode("discord")} className="rounded-[5px] border px-[9px] py-[4px] text-[11.5px] font-semibold" style={mode === "discord" ? { borderColor: "var(--accent)", color: "var(--accent)" } : { borderColor: "var(--border)", color: "var(--muted)" }}>ID Discord</button>
            </div>
            {mode === "agent" ? (
              <AgentSelect roster={roster ?? []} value={agentId || null} onChange={(id) => setAgentId(id ?? "")} />
            ) : (
              <>
                <input value={discordId} onChange={(e) => setDiscordId(e.target.value)} placeholder="ID Discord (17 à 20 chiffres)" className={`${FIELD} font-data`} />
                <div className="mt-1 text-[11px] text-faint">À utiliser si le compte de l'agent n'est pas lié.</div>
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Date (Paris)</div>
              <input type="datetime-local" value={convokedAtWall} onChange={(e) => setConvokedAtWall(e.target.value)} className={FIELD} />
            </div>
            <div>
              <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Lieu (optionnel)</div>
              <input value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder="Ex. Bureau IA, Station 13" className={FIELD} />
            </div>
          </div>
          <div>
            <div className="mb-[6px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Infos supplémentaires</div>
            <textarea value={motif} onChange={(e) => setMotif(e.target.value)} rows={4} className="w-full resize-y rounded-sm border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-accent" />
          </div>
        </div>
        <div className="flex flex-shrink-0 gap-2 border-t border-border px-[18px] py-4">
          <button onClick={onClose} className="rounded-sm border border-border bg-surface-2 px-4 py-[10px] text-[13px] font-semibold hover:border-border-strong">Annuler</button>
          <button onClick={submit} disabled={busy || !valid} className="flex-1 rounded-sm bg-accent px-4 py-[10px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">{busy ? "…" : "Convoquer"}</button>
        </div>
      </div>
    </div>
  );
}
