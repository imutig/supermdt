import { useState } from "react";
import { useQuery } from "convex/react";
import { Archive, Search, MessageSquare, Clock, User, GraduationCap, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { Modal } from "@/components/common/Modal";

// Archives des tickets de candidature (Police Academy). Chaque ticket fermé
// définitivement sur Discord est conservé ici avec son journal complet et
// l'historique de ses messages. Recherche par pseudo, prénom/nom ou id Discord.

const STATUS: Record<string, { label: string; emoji: string; color: string }> = {
  EVALUATING: { label: "En évaluation", emoji: "🟡", color: "var(--warning)" },
  PASSED: { label: "Entretien réussi", emoji: "🟢", color: "var(--accent)" },
  PASSED_ABSENT: { label: "Réussi mais absent", emoji: "🟠", color: "var(--warning)" },
  FAILED: { label: "Entretien raté", emoji: "🔴", color: "var(--danger)" },
};

function statusOf(s: string | null) {
  return s ? STATUS[s] ?? null : null;
}

const dt = (ts: number) => new Date(ts).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function LspaTicketArchives() {
  const [search, setSearch] = useState("");
  const archives = useQuery(api.ticketArchives.list, { search: search.trim() || undefined });
  const [selected, setSelected] = useState<Id<"ticketArchives"> | null>(null);

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[16px] flex items-end gap-3">
        <div className="flex-1">
          <h1 className="m-0 text-[21px] font-bold tracking-tight">Candidatures archivées</h1>
          <div className="mt-[3px] text-[13px] text-muted">L'historique complet des tickets de recrutement fermés, conservé pour consultation.</div>
        </div>
      </div>

      <div className="mb-[14px] flex items-center gap-[8px] rounded-sm border border-border bg-surface-2 px-[11px]">
        <Search className="h-[15px] w-[15px] text-faint" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par pseudo, prénom / nom RP ou id Discord…"
          className="h-10 w-full bg-transparent text-[13.5px] outline-none"
        />
        {search && <button onClick={() => setSearch("")} className="text-faint hover:text-text"><X className="h-[14px] w-[14px]" /></button>}
      </div>

      {archives === undefined ? (
        <div className="rounded-card border border-border bg-surface p-4"><SkeletonRows rows={5} /></div>
      ) : archives.length === 0 ? (
        <div className="rounded-card border border-border bg-surface"><EmptyState title="Aucune archive" message={search ? "Aucun ticket ne correspond à cette recherche." : "Les tickets fermés définitivement sur Discord apparaîtront ici."} /></div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          {archives.map((a) => {
            const st = statusOf(a.integrationStatus);
            return (
              <button key={a._id} onClick={() => setSelected(a._id)} className="flex w-full items-center gap-[13px] border-b border-border px-[16px] py-[12px] text-left last:border-b-0 hover:bg-surface-2">
                <span className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-accent"><Archive className="h-[15px] w-[15px]" /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold">{a.name} <span className="text-[12px] font-normal text-faint">@{a.ownerName}</span></div>
                  <div className="mt-[2px] flex flex-wrap items-center gap-[10px] text-[11.5px] text-muted">
                    {a.promotionName && <span className="flex items-center gap-[4px]"><GraduationCap className="h-[12px] w-[12px]" /> {a.promotionName}</span>}
                    <span className="flex items-center gap-[4px]"><MessageSquare className="h-[12px] w-[12px]" /> {a.messageCount} message(s)</span>
                    <span className="flex items-center gap-[4px]"><Clock className="h-[12px] w-[12px]" /> {dt(a.archivedAt)}</span>
                  </div>
                </div>
                {st && <span className="flex-shrink-0 rounded-[6px] px-[8px] py-[3px] text-[11px] font-semibold" style={{ background: `color-mix(in srgb, ${st.color} 13%, transparent)`, color: st.color }}>{st.emoji} {st.label}</span>}
              </button>
            );
          })}
        </div>
      )}

      {selected && <ArchiveDetail id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ArchiveDetail({ id, onClose }: { id: Id<"ticketArchives">; onClose: () => void }) {
  const a = useQuery(api.ticketArchives.get, { id });
  const st = a ? statusOf(a.integrationStatus) : null;

  return (
    <Modal title="Ticket de candidature" icon={<Archive className="h-[17px] w-[17px]" />} onClose={onClose} width={720}
      footer={<button onClick={onClose} className="rounded-sm border border-border bg-surface-2 px-[14px] py-[8px] text-[13px] font-semibold hover:bg-surface">Fermer</button>}
    >
      {a === undefined ? <SkeletonRows rows={5} /> : a === null ? (
        <div className="text-[13px] text-faint">Archive introuvable.</div>
      ) : (
        <div className="flex flex-col gap-[16px]">
          {/* Identité */}
          <div className="rounded-sm border border-border bg-surface-2 p-[12px_14px]">
            <div className="flex items-center gap-[10px]">
              <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-surface text-[12px] font-bold text-muted">
                {`${a.prenom} ${a.nom}`.split(" ").map((x) => x[0]).slice(0, 2).join("")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold">{a.prenom} {a.nom}</div>
                <div className="text-[12px] text-muted">@{a.ownerName} · <span className="font-data">{a.ownerId}</span></div>
              </div>
              {st && <span className="rounded-[6px] px-[8px] py-[3px] text-[11.5px] font-semibold" style={{ background: `color-mix(in srgb, ${st.color} 13%, transparent)`, color: st.color }}>{st.emoji} {st.label}</span>}
            </div>
            <div className="mt-[10px] grid grid-cols-2 gap-[8px] text-[12px]">
              {a.dateNaissance && <Info label="Naissance" value={a.dateNaissance} />}
              {a.promotionName && <Info label="Promotion" value={a.promotionName} />}
              <Info label="Salon" value={`#${a.channelName}`} />
              <Info label="Archivé le" value={dt(a.archivedAt)} />
            </div>
            {a.motivations && (
              <div className="mt-[10px]">
                <div className="mb-[3px] text-[10.5px] font-bold uppercase tracking-[0.07em] text-faint">Motivations</div>
                <div className="whitespace-pre-wrap rounded-sm bg-surface p-[9px_11px] text-[12.5px] text-muted">{a.motivations}</div>
              </div>
            )}
            {a.experiences && (
              <div className="mt-[10px]">
                <div className="mb-[3px] text-[10.5px] font-bold uppercase tracking-[0.07em] text-faint">Expériences professionnelles</div>
                <div className="whitespace-pre-wrap rounded-sm bg-surface p-[9px_11px] text-[12.5px] text-muted">{a.experiences}</div>
              </div>
            )}
            {a.closeReason && (
              <div className="mt-[8px] text-[12px]"><span className="font-semibold text-danger">Raison de fermeture : </span><span className="text-muted">{a.closeReason}</span></div>
            )}
          </div>

          {/* Journal */}
          <div>
            <div className="mb-[7px] flex items-center gap-[6px] text-[11px] font-bold uppercase tracking-[0.08em] text-faint"><Clock className="h-[12px] w-[12px]" /> Journal</div>
            <div className="flex flex-col gap-[2px] border-l-2 border-border pl-[12px]">
              {a.events.length === 0 ? <div className="text-[12px] text-faint">Aucun évènement.</div> : a.events.map((e, i) => (
                <div key={i} className="relative py-[3px] text-[12.5px]">
                  <span className="absolute -left-[17px] top-[9px] h-[7px] w-[7px] rounded-full bg-accent" />
                  <span className="text-text">{e.label}</span>
                  <span className="ml-[6px] text-[11px] text-faint">{dt(e.at)}{e.by ? ` · ${e.by}` : ""}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div>
            <div className="mb-[7px] flex items-center gap-[6px] text-[11px] font-bold uppercase tracking-[0.08em] text-faint"><MessageSquare className="h-[12px] w-[12px]" /> Conversation ({a.messages.length})</div>
            <div className="flex max-h-[340px] flex-col gap-[8px] overflow-y-auto rounded-sm border border-border bg-surface-2 p-[10px_12px]">
              {a.messages.length === 0 ? <div className="text-[12px] text-faint">Aucun message conservé.</div> : a.messages.map((m, i) => (
                <div key={i} className="flex flex-col gap-[2px]">
                  <div className="flex items-center gap-[6px] text-[11.5px]">
                    <User className="h-[11px] w-[11px] text-faint" />
                    <span className="font-semibold" style={{ color: m.bot ? "var(--accent)" : "var(--text)" }}>{m.authorName}{m.bot ? " (bot)" : ""}</span>
                    <span className="text-[10.5px] text-faint">{dt(m.at)}</span>
                  </div>
                  {m.content && <div className="whitespace-pre-wrap pl-[17px] text-[12.5px] text-muted">{m.content}</div>}
                  {m.attachments?.map((url, j) => (
                    <a key={j} href={url} target="_blank" rel="noreferrer" className="truncate pl-[17px] text-[11.5px] text-accent hover:underline">📎 pièce jointe</a>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">{label}</div>
      <div className="text-[12.5px]">{value}</div>
    </div>
  );
}
