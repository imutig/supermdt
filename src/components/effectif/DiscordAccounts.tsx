import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { X, Send, Link2Off, Link2, Search, Copy, Clock } from "lucide-react";
import { api, type Id } from "@/lib/api";
import { useToast } from "@/providers/toast";
import { fmtMatricule } from "@/components/common/AgentTag";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";

// Panneau « Comptes Discord » : membres LSPD synchronisés par le bot, avec leur
// statut de liaison. On envoie un compte (invitation + MP par le bot), on relie
// un agent existant, ou on délie. La synchro et les MP sont pilotés par le bot.
export function DiscordAccounts({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const members = useQuery(api.discordLink.list);
  const roster = useQuery(api.agents.roster);
  const sendAccount = useMutation(api.discordLink.sendAccount);
  const linkExisting = useMutation(api.discordLink.linkExisting);
  const unlink = useMutation(api.discordLink.unlink);

  const [q, setQ] = useState("");
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [linkFor, setLinkFor] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return members ?? [];
    return (members ?? []).filter(
      (m) => m.displayName.toLowerCase().includes(t) || m.username.toLowerCase().includes(t) || (m.linked?.name ?? "").toLowerCase().includes(t),
    );
  }, [members, q]);

  async function onSend(discordId: string) {
    const code = await toast.guard(sendAccount({ discordId }), "Envoi impossible");
    if (code) {
      setCodes((c) => ({ ...c, [discordId]: code }));
      toast.success("Invitation créée. Le bot envoie le MP au membre.");
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex justify-end"
      style={{ background: "var(--scrim)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "mdtFade .15s ease" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-[560px] max-w-[94vw] flex-col border-l border-border-strong bg-elev shadow-[-24px_0_70px_rgba(0,0,0,.3)]"
        style={{ animation: "mdtSlide .26s cubic-bezier(.16,1,.3,1)" }}
      >
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-[18px] py-4">
          <div className="flex-1">
            <h2 className="m-0 text-[15px] font-bold">Comptes Discord</h2>
            <div className="mt-[2px] text-[12px] text-muted">
              {members ? `${members.length} membre${members.length > 1 ? "s" : ""} LSPD synchronisé${members.length > 1 ? "s" : ""}` : "…"}
            </div>
          </div>
          <button onClick={onClose} className="flex h-[30px] w-[30px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-shrink-0 border-b border-border px-[18px] py-3">
          <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-3">
            <Search className="h-[15px] w-[15px] text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un membre…"
              className="h-9 flex-1 bg-transparent text-[13px] outline-none"
            />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-[10px] overflow-y-auto px-[18px] py-4">
          {members === undefined && <SkeletonRows rows={6} />}
          {members && members.length === 0 && (
            <EmptyState
              title="Aucun membre synchronisé"
              message="Le bot synchronise les membres portant le rôle LSPD toutes les 10 minutes. Vérifie qu'il tourne et que le Server Members Intent est activé."
            />
          )}
          {filtered.map((m) => {
            const code = codes[m.discordId];
            return (
              <div key={m.discordId} className="rounded-sm border border-border bg-surface-2 px-[13px] py-[11px]">
                <div className="flex items-center gap-[10px]">
                  <div className="flex h-[32px] w-[32px] items-center justify-center rounded-[7px] border border-border bg-surface text-[11px] font-bold text-muted">
                    {m.displayName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold">{m.displayName}</div>
                    <div className="truncate text-[11.5px] text-faint">
                      @{m.username}{!m.linked && m.detectedGrade ? ` · grade détecté : ${m.detectedGrade}` : ""}
                    </div>
                  </div>
                  {m.linked ? (
                    <span className="inline-flex items-center gap-[6px] rounded-[5px] px-[8px] py-[3px] text-[11px] font-semibold" style={{ background: "color-mix(in srgb, var(--success) 14%, transparent)", color: "var(--success)" }}>
                      <span className="h-[6px] w-[6px] rounded-full" style={{ background: "var(--success)" }} /> Relié
                    </span>
                  ) : m.invitePending ? (
                    <span className="inline-flex items-center gap-[6px] rounded-[5px] px-[8px] py-[3px] text-[11px] font-semibold" style={{ background: "color-mix(in srgb, var(--warning) 14%, transparent)", color: "var(--warning)" }}>
                      <Clock className="h-[12px] w-[12px]" /> MP en attente
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-[6px] rounded-[5px] bg-surface px-[8px] py-[3px] text-[11px] font-semibold text-muted">Non relié</span>
                  )}
                </div>

                {m.linked && (
                  <div className="mt-[9px] flex items-center gap-2 border-t border-border pt-[9px]">
                    <span className="font-data text-[11px] text-accent">{fmtMatricule(m.linked.matricule) ?? "-"}</span>
                    <span className="flex-1 truncate text-[12.5px] font-semibold">{m.linked.name}</span>
                    <span className="text-[11.5px] text-muted">{m.linked.gradeName ?? "-"}</span>
                    <button
                      onClick={() => toast.guard(unlink({ agentId: m.linked!.agentId }), "Action impossible").then((r) => r !== undefined && toast.success("Compte délié."))}
                      title="Délier"
                      className="flex items-center gap-[5px] rounded-sm border border-border bg-surface px-[9px] py-[6px] text-[11.5px] font-semibold text-muted hover:border-danger hover:text-danger"
                    >
                      <Link2Off className="h-[13px] w-[13px]" /> Délier
                    </button>
                  </div>
                )}

                {!m.linked && (
                  <div className="mt-[9px] border-t border-border pt-[9px]">
                    {code ? (
                      <div className="rounded-sm border p-[10px]" style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}>
                        <div className="mb-[6px] text-[11.5px] font-semibold" style={{ color: "var(--accent)" }}>
                          Le bot envoie un lien de création (pré-rempli) à ce membre par MP.
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 select-all rounded-sm border border-border bg-surface px-3 py-[8px] font-data text-[13px] font-bold tracking-[0.06em]">/rejoindre/{code}</code>
                          <button
                            onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}/rejoindre/${code}`); toast.success("Lien copié."); }}
                            className="flex items-center gap-[5px] rounded-sm border border-border bg-surface px-[10px] py-[8px] text-[12px] font-semibold text-muted hover:border-border-strong"
                          >
                            <Copy className="h-[13px] w-[13px]" /> Copier le lien
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => onSend(m.discordId)}
                          className="flex items-center gap-[6px] rounded-sm bg-accent px-[12px] py-[7px] text-[12px] font-semibold text-accent-contrast hover:brightness-[1.06]"
                        >
                          <Send className="h-[14px] w-[14px]" /> Envoyer un compte
                        </button>
                        <button
                          onClick={() => setLinkFor(linkFor === m.discordId ? null : m.discordId)}
                          className="flex items-center gap-[6px] rounded-sm border border-border bg-surface px-[12px] py-[7px] text-[12px] font-semibold text-muted hover:border-border-strong"
                        >
                          <Link2 className="h-[14px] w-[14px]" /> Relier un agent existant
                        </button>
                      </div>
                    )}

                    {linkFor === m.discordId && !code && (
                      <AgentPicker
                        roster={roster ?? []}
                        onPick={async (agentId) => {
                          const r = await toast.guard(linkExisting({ agentId, discordId: m.discordId }), "Liaison impossible");
                          if (r !== undefined) { toast.success("Agent relié au Discord."); setLinkFor(null); }
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Petit sélecteur d'agent (recherche par nom / matricule) pour la liaison manuelle.
function AgentPicker({
  roster,
  onPick,
}: {
  roster: { _id: Id<"agents">; prenomRP: string; nomRP: string; matricule: number | null | undefined; grade: string | null }[];
  onPick: (agentId: Id<"agents">) => void;
}) {
  const [term, setTerm] = useState("");
  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    const base = t
      ? roster.filter((a) => `${a.prenomRP} ${a.nomRP}`.toLowerCase().includes(t) || String(a.matricule ?? "").includes(t))
      : roster;
    return base.slice(0, 8);
  }, [roster, term]);

  return (
    <div className="mt-[9px] rounded-sm border border-border bg-surface p-[10px]">
      <div className="mb-[8px] flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-3">
        <Search className="h-[14px] w-[14px] text-faint" />
        <input
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Nom ou matricule…"
          className="h-8 flex-1 bg-transparent text-[12.5px] outline-none"
        />
      </div>
      {rows.length === 0 ? (
        <div className="px-1 py-2 text-[12px] text-faint">Aucun agent.</div>
      ) : (
        <div className="flex flex-col gap-px overflow-hidden rounded-sm border border-border bg-border">
          {rows.map((a) => (
            <button
              key={a._id}
              onClick={() => onPick(a._id)}
              className="flex items-center gap-2 bg-surface-2 px-3 py-[8px] text-left text-[12.5px] hover:bg-surface"
            >
              <span className="font-data text-[11px] text-accent">{fmtMatricule(a.matricule) ?? "-"}</span>
              <span className="flex-1 truncate font-semibold">{a.prenomRP} {a.nomRP}</span>
              <span className="text-[11.5px] text-muted">{a.grade ?? "-"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
