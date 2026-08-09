import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "react-router-dom";
import {
  Shield, Users, Settings, Megaphone, MessageSquare, Send, Trash2, Plus, Pin, ChevronUp, ChevronDown, ImagePlus, X, Loader2, Search,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { useToast } from "@/providers/toast";
import { uploadImage } from "@/lib/uploadImage";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { RichTextEditor } from "@/components/common/RichTextEditor";
import { fmtMatricule } from "@/components/common/AgentTag";

type Tab = "accueil" | "membres" | "config";
const dt = (ts: number) => new Date(ts).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function DivisionSpace() {
  const { id } = useParams<{ id: string }>();
  const divisionId = id as Id<"divisions">;
  const home = useQuery(api.divisionSpace.home, { divisionId });
  const [tab, setTab] = useState<Tab>("accueil");

  if (home === undefined) return <div className="p-[22px_26px]"><SkeletonRows rows={5} /></div>;
  if (home === null) return <div className="p-[26px]"><EmptyState title="Accès restreint" message="Vous ne faites pas partie de cette division." /></div>;

  const { division, perms, isLead, canManageLead } = home;
  const has = (p: string) => isLead || perms.includes(p);
  const canConfig = isLead || has("ranks") || has("members") || has("config") || canManageLead;
  const accent = division.color ?? "var(--accent)";

  const TABS: { key: Tab; label: string; icon: typeof Shield }[] = [
    { key: "accueil", label: "Accueil", icon: Shield },
    { key: "membres", label: "Membres", icon: Users },
    ...(canConfig ? [{ key: "config" as Tab, label: "Configuration", icon: Settings }] : []),
  ];

  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[16px] flex items-center gap-[12px]">
        {division.logoUrl ? (
          <img src={division.logoUrl} alt="" className="h-[42px] w-[42px] flex-shrink-0 rounded-[12px] border border-border object-cover" />
        ) : (
          <span className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-[12px]" style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}>
            <Shield className="h-[21px] w-[21px]" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[21px] font-bold tracking-tight">{division.name}</h1>
          <div className="mt-[2px] text-[12.5px] text-muted">
            Division {division.tier === "PRINCIPALE" ? "principale" : "secondaire"} · {home.membersCount} membre(s)
            {home.lead && <> · Lead : {fmtMatricule(home.lead.matricule) ?? ""} {home.lead.name}</>}
          </div>
        </div>
      </div>

      <div className="mb-[16px] flex flex-wrap gap-[2px] rounded-card border border-border bg-surface p-[5px]">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className="flex items-center gap-[6px] rounded-[7px] px-[12px] py-[7px] text-[12.5px] font-semibold hover:bg-surface-2"
            style={tab === t.key ? { background: accent, color: "#fff" } : { color: "var(--muted)" }}>
            <t.icon className="h-[14px] w-[14px]" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "accueil" && <Accueil divisionId={divisionId} home={home} />}
      {tab === "membres" && <Membres divisionId={divisionId} canManage={has("members")} />}
      {tab === "config" && canConfig && <Config divisionId={divisionId} canRanks={has("ranks")} canConfigPres={has("config")} canManageLead={canManageLead} description={division.description} logoUrl={division.logoUrl ?? undefined} />}
    </div>
  );
}

/* ---------- Accueil : présentation + annonces + chat ---------- */
type Home = NonNullable<ReturnType<typeof useQuery<typeof api.divisionSpace.home>>>;
function Accueil({ divisionId, home }: { divisionId: Id<"divisions">; home: Home }) {
  const has = (p: string) => home.isLead || home.perms.includes(p);
  return (
    <div className="grid grid-cols-1 items-start gap-[16px] lg:grid-cols-[1.35fr_1fr]">
      <div className="flex flex-col gap-[16px]">
        {home.division.description && (
          <section className="rounded-card border border-border bg-surface p-[16px]">
            <div className="mb-[8px] text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Présentation</div>
            <div className="text-[13.5px] leading-[1.55]"><RichTextEditor value={home.division.description} editable={false} minHeight={0} /></div>
          </section>
        )}
        <Announcements divisionId={divisionId} announcements={home.announcements} canManage={has("announcements")} />
      </div>
      <Chat divisionId={divisionId} />
    </div>
  );
}

function Announcements({ divisionId, announcements, canManage }: {
  divisionId: Id<"divisions">;
  announcements: Home["announcements"];
  canManage: boolean;
}) {
  const remove = useMutation(api.divisionSpace.announceRemove);
  const [composing, setComposing] = useState(false);
  return (
    <section className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-[15px] py-[10px]">
        <Megaphone className="h-[15px] w-[15px] text-accent" />
        <span className="flex-1 text-[12px] font-bold uppercase tracking-[0.08em]">Annonces</span>
        {canManage && <Button onClick={() => setComposing(true)} className="!py-[4px] !text-[11.5px]"><Plus className="h-[13px] w-[13px]" /> Annonce</Button>}
      </div>
      {announcements.length === 0 ? (
        <div className="px-[15px] py-[16px] text-center text-[12.5px] text-faint">Aucune annonce.</div>
      ) : announcements.map((a) => (
        <div key={a._id} className="border-b border-border px-[15px] py-[12px] last:border-b-0">
          <div className="mb-[4px] flex items-center gap-[8px]">
            {a.pinned && <Pin className="h-[12px] w-[12px] text-accent" />}
            <span className="flex-1 text-[14px] font-bold">{a.title}</span>
            <span className="text-[11px] text-faint">{a.authorName} · {dt(a.at)}</span>
            {(canManage || a.mine) && <button onClick={() => void remove({ id: a._id as Id<"divisionAnnouncements"> })} className="text-faint hover:text-danger"><Trash2 className="h-[12px] w-[12px]" /></button>}
          </div>
          <div className="text-[13px] leading-[1.5]"><RichTextEditor value={a.body} editable={false} minHeight={0} /></div>
          {a.imageUrls.length > 0 && (
            <div className="mt-[8px] flex flex-wrap gap-[8px]">
              {a.imageUrls.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="h-[90px] w-[90px] rounded-sm border border-border object-cover" /></a>)}
            </div>
          )}
        </div>
      ))}
      {composing && <AnnounceModal divisionId={divisionId} onClose={() => setComposing(false)} />}
    </section>
  );
}

function AnnounceModal({ divisionId, onClose }: { divisionId: Id<"divisions">; onClose: () => void }) {
  const announce = useMutation(api.divisionSpace.announce);
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Nouvelle annonce" icon={<Megaphone className="h-[17px] w-[17px]" />} onClose={onClose} width={560}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant="primary" loading={busy} disabled={!title.trim()} onClick={async () => {
          setBusy(true);
          const r = await toast.guard(announce({ divisionId, title: title.trim(), body, imageUrls: images, pinned }), "Publication impossible");
          setBusy(false);
          if (r !== undefined) onClose();
        }}>Publier</Button>
      </>}
    >
      <div className="flex flex-col gap-[12px]">
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre" className="h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13.5px] outline-none focus:border-accent" />
        <div className="rounded-sm border border-border bg-surface-2 px-3 py-2"><RichTextEditor value={body} onChange={setBody} placeholder="Contenu de l'annonce…" minHeight={120} /></div>
        <ImagesField images={images} onChange={setImages} />
        <label className="flex items-center gap-[7px] text-[12.5px]"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Épingler en haut</label>
      </div>
    </Modal>
  );
}

function Chat({ divisionId }: { divisionId: Id<"divisions"> }) {
  const messages = useQuery(api.divisionSpace.messages, { divisionId });
  const send = useMutation(api.divisionSpace.sendMessage);
  const del = useMutation(api.divisionSpace.deleteMessage);
  const toast = useToast();
  const [body, setBody] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0); // force-remonte l'éditeur après envoi

  const submit = async () => {
    if (!body.replace(/<[^>]*>/g, "").trim() && images.length === 0) return;
    setBusy(true);
    const r = await toast.guard(send({ divisionId, body, imageUrls: images }), "Envoi impossible");
    setBusy(false);
    if (r !== undefined) { setBody(""); setImages([]); setKey((k) => k + 1); }
  };

  return (
    <section className="flex h-[560px] flex-col overflow-hidden rounded-card border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-[15px] py-[10px]">
        <MessageSquare className="h-[15px] w-[15px] text-accent" />
        <span className="text-[12px] font-bold uppercase tracking-[0.08em]">Chat interne</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-[10px] overflow-y-auto p-[14px]">
        {messages === undefined ? <SkeletonRows rows={4} /> : messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-[12.5px] text-faint">Aucun message. Lancez la conversation.</div>
        ) : messages.map((m) => (
          <div key={m._id} className="group rounded-sm border border-border bg-surface-2 px-[11px] py-[8px]">
            <div className="mb-[2px] flex items-center gap-[6px] text-[11px]">
              <span className="font-semibold">{m.authorName}</span>
              <span className="text-faint">{dt(m.at)}</span>
              <div className="flex-1" />
              {m.canDelete && <button onClick={() => void del({ id: m._id as Id<"divisionMessages"> })} className="text-faint opacity-0 hover:text-danger group-hover:opacity-100"><Trash2 className="h-[12px] w-[12px]" /></button>}
            </div>
            {m.body && <div className="text-[13px] leading-[1.45]"><RichTextEditor value={m.body} editable={false} minHeight={0} /></div>}
            {m.imageUrls.length > 0 && (
              <div className="mt-[6px] flex flex-wrap gap-[6px]">
                {m.imageUrls.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="h-[110px] max-w-[160px] rounded-sm border border-border object-cover" /></a>)}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex-shrink-0 border-t border-border p-[10px]">
        <div className="rounded-sm border border-border bg-surface-2 px-3 py-2"><RichTextEditor key={key} value={body} onChange={setBody} placeholder="Écrire un message…" minHeight={44} /></div>
        <div className="mt-[8px] flex items-center gap-[8px]">
          <ImagesField images={images} onChange={setImages} compact />
          <div className="flex-1" />
          <Button variant="primary" loading={busy} onClick={submit}><Send className="h-[14px] w-[14px]" /> Envoyer</Button>
        </div>
      </div>
    </section>
  );
}

// Champ d'images multiple : miniatures + bouton d'ajout compact.
function ImagesField({ images, onChange, compact }: { images: string[]; onChange: (v: string[]) => void; compact?: boolean }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const size = compact ? 40 : 64;
  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    const url = await toast.guard(uploadImage(file), "Upload impossible");
    setBusy(false);
    if (url) onChange([...images, url]);
  };
  return (
    <div className="flex flex-wrap items-center gap-[8px]">
      {images.map((u, i) => (
        <div key={i} className="relative">
          <img src={u} alt="" className="rounded-sm border border-border object-cover" style={{ width: size, height: size }} />
          <button onClick={() => onChange(images.filter((_, j) => j !== i))} className="absolute -right-[6px] -top-[6px] flex h-[18px] w-[18px] items-center justify-center rounded-full border border-border bg-elev text-faint hover:text-danger"><X className="h-[11px] w-[11px]" /></button>
        </div>
      ))}
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title="Ajouter une image"
        style={{ width: size, height: size }}
        className="flex flex-shrink-0 items-center justify-center rounded-sm border border-dashed border-border bg-surface-2 text-faint hover:border-accent hover:text-accent disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-[16px] w-[16px] animate-spin" /> : <ImagePlus className="h-[16px] w-[16px]" />}
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}

/* ---------- Membres ---------- */
function Membres({ divisionId, canManage }: { divisionId: Id<"divisions">; canManage: boolean }) {
  const list = useQuery(api.divisionSpace.members, { divisionId });
  const ranksData = useQuery(api.divisionSpace.ranks, canManage ? { divisionId } : "skip");
  const assign = useMutation(api.divisionSpace.assignMemberRank);
  const toast = useToast();
  const rankOpts = ranksData?.ranks ?? [];
  if (list === undefined) return <div className="rounded-card border border-border bg-surface p-4"><SkeletonRows rows={5} /></div>;
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      {list.length === 0 ? <EmptyState title="Aucun membre" /> : list.map((m) => (
        <div key={m.agentId} className="flex items-center gap-[12px] border-b border-border px-[16px] py-[11px] last:border-b-0">
          <span className="flex h-[32px] w-[32px] flex-shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-bold text-muted">
            {m.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold">{m.name} {m.isLead && <span className="ml-[4px] rounded-[5px] px-[6px] py-px text-[10px] font-bold uppercase text-accent" style={{ background: "var(--accent-soft)" }}>Lead</span>}</div>
            {fmtMatricule(m.matricule) && <div className="font-data text-[11px] text-faint">{fmtMatricule(m.matricule)}</div>}
          </div>
          {canManage ? (
            <select value={m.rankId ?? ""} onChange={(e) => void toast.guard(assign({ divisionId, agentId: m.agentId as Id<"agents">, rankId: (e.target.value || null) as Id<"divisionRanks"> | null }), "Action impossible")}
              className="h-[30px] rounded-[7px] border border-border bg-surface-2 px-[8px] text-[12px] outline-none">
              <option value="">Sans grade</option>
              {rankOpts.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
            </select>
          ) : m.rankName ? (
            <span className="rounded-[6px] px-[9px] py-[4px] text-[12px] font-semibold" style={{ background: `color-mix(in srgb, ${m.rankColor ?? "var(--muted)"} 14%, transparent)`, color: m.rankColor ?? "var(--muted)" }}>{m.rankName}</span>
          ) : <span className="text-[12px] text-faint">Sans grade</span>}
        </div>
      ))}
    </div>
  );
}

/* ---------- Configuration : grades internes + permissions + présentation + lead ---------- */
function Config({ divisionId, canRanks, canConfigPres, canManageLead, description, logoUrl }: {
  divisionId: Id<"divisions">; canRanks: boolean; canConfigPres: boolean; canManageLead: boolean; description: string; logoUrl?: string;
}) {
  return (
    <div className="flex flex-col gap-[16px]">
      {canManageLead && <LeadConfig divisionId={divisionId} />}
      {canConfigPres && <LogoConfig divisionId={divisionId} logoUrl={logoUrl} />}
      {canConfigPres && <PresentationConfig divisionId={divisionId} description={description} />}
      {canRanks && <RanksConfig divisionId={divisionId} />}
    </div>
  );
}

function LeadConfig({ divisionId }: { divisionId: Id<"divisions"> }) {
  const opts = useQuery(api.divisionSpace.memberOptions, { divisionId });
  const home = useQuery(api.divisionSpace.home, { divisionId });
  const setLead = useMutation(api.divisionSpace.setLead);
  const toast = useToast();
  const [q, setQ] = useState("");
  const currentId = (home?.lead && opts?.find((o) => o.name === home.lead!.name)?._id) ?? null;
  const currentName = home?.lead?.name ?? null;
  const query = q.trim().toLowerCase();
  const filtered = (opts ?? []).filter((o) => {
    if (!query) return true;
    return `${o.name} ${fmtMatricule(o.matricule) ?? ""}`.toLowerCase().includes(query);
  }).slice(0, 8);
  return (
    <section className="rounded-card border border-border bg-surface p-[16px]">
      <div className="mb-[8px] text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Lead de la division</div>
      <div className="mb-[10px] text-[12.5px] text-muted">Le Lead a un accès complet à la configuration de la division. Recherche-le parmi les membres.</div>
      {currentId && (
        <div className="mb-[10px] flex items-center justify-between rounded-sm border border-border bg-surface-2 px-3 py-2 text-[13px]">
          <span>Lead actuel : <b>{currentName}</b></span>
          <button
            onClick={() => void toast.guard(setLead({ divisionId, agentId: null }), "Action impossible")}
            className="text-[12px] text-danger hover:underline"
          >Retirer</button>
        </div>
      )}
      <div className="relative max-w-[420px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un membre…"
          className="h-10 w-full rounded-sm border border-border bg-surface-2 pl-9 pr-3 text-[13px] outline-none focus:border-accent"
        />
      </div>
      {q.trim() && (
        <div className="mt-[8px] max-w-[420px] overflow-hidden rounded-sm border border-border">
          {filtered.length === 0 && <div className="px-3 py-2 text-[12.5px] text-faint">Aucun membre.</div>}
          {filtered.map((o) => (
            <button
              key={o._id}
              onClick={() => { void toast.guard(setLead({ divisionId, agentId: o._id }), "Action impossible"); setQ(""); }}
              disabled={o._id === currentId}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-surface-2 disabled:opacity-50"
            >
              <span className="text-faint">{fmtMatricule(o.matricule) ?? ""}</span>
              <span>{o.name}</span>
              {o._id === currentId && <span className="ml-auto text-[11px] text-accent">Lead</span>}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function LogoConfig({ divisionId, logoUrl }: { divisionId: Id<"divisions">; logoUrl?: string }) {
  const setLogo = useMutation(api.divisionSpace.setLogo);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pick = async (file: File) => {
    setBusy(true);
    try {
      const url = await uploadImage(file);
      await toast.guard(setLogo({ divisionId, url }), "Enregistrement impossible");
    } finally { setBusy(false); }
  };
  return (
    <section className="rounded-card border border-border bg-surface p-[16px]">
      <div className="mb-[8px] text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Logo de la division</div>
      <div className="mb-[10px] text-[12.5px] text-muted">Remplace l'icône par défaut dans la barre latérale et l'en-tête.</div>
      <div className="flex items-center gap-3">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-14 w-14 rounded-[12px] border border-border object-cover" />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-[12px] border border-border bg-surface-2 text-faint"><Shield className="h-6 w-6" /></span>
        )}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />
        <Button variant="secondary" loading={busy} onClick={() => inputRef.current?.click()}>{logoUrl ? "Changer" : "Ajouter un logo"}</Button>
        {logoUrl && <Button variant="ghost" onClick={() => void toast.guard(setLogo({ divisionId, url: null }), "Action impossible")}>Retirer</Button>}
      </div>
    </section>
  );
}

function PresentationConfig({ divisionId, description }: { divisionId: Id<"divisions">; description: string }) {
  const setDescription = useMutation(api.divisionSpace.setDescription);
  const toast = useToast();
  const [val, setVal] = useState(description);
  const [busy, setBusy] = useState(false);
  return (
    <section className="rounded-card border border-border bg-surface p-[16px]">
      <div className="mb-[8px] text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Présentation</div>
      <div className="rounded-sm border border-border bg-surface-2 px-3 py-2"><RichTextEditor value={val} onChange={setVal} placeholder="Décris la division, sa mission, ses règles…" minHeight={120} /></div>
      <div className="mt-[10px] flex justify-end">
        <Button variant="primary" loading={busy} onClick={async () => { setBusy(true); await toast.guard(setDescription({ divisionId, description: val }), "Enregistrement impossible"); setBusy(false); }}>Enregistrer</Button>
      </div>
    </section>
  );
}

function RanksConfig({ divisionId }: { divisionId: Id<"divisions"> }) {
  const data = useQuery(api.divisionSpace.ranks, { divisionId });
  const create = useMutation(api.divisionSpace.rankCreate);
  const move = useMutation(api.divisionSpace.rankMove);
  const remove = useMutation(api.divisionSpace.rankRemove);
  const setPerms = useMutation(api.divisionSpace.setRankPerms);
  const rename = useMutation(api.divisionSpace.rankUpdate);
  const toast = useToast();
  const [newName, setNewName] = useState("");
  if (data === undefined) return <section className="rounded-card border border-border bg-surface p-4"><SkeletonRows rows={3} /></section>;
  const { ranks, catalog } = data;
  return (
    <section className="rounded-card border border-border bg-surface p-[16px]">
      <div className="mb-[10px] text-[11px] font-bold uppercase tracking-[0.08em] text-faint">Grades internes & permissions</div>
      <div className="flex flex-col gap-[10px]">
        {ranks.map((r, idx) => (
          <div key={r._id} className="rounded-card border border-border bg-surface-2 p-[11px]">
            <div className="mb-[8px] flex items-center gap-[8px]">
              <div className="flex flex-col">
                <button disabled={idx === 0} onClick={() => void move({ rankId: r._id as Id<"divisionRanks">, direction: "up" })} className="text-faint hover:text-text disabled:opacity-30"><ChevronUp className="h-[13px] w-[13px]" /></button>
                <button disabled={idx === ranks.length - 1} onClick={() => void move({ rankId: r._id as Id<"divisionRanks">, direction: "down" })} className="text-faint hover:text-text disabled:opacity-30"><ChevronDown className="h-[13px] w-[13px]" /></button>
              </div>
              <input defaultValue={r.name} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== r.name) void rename({ rankId: r._id as Id<"divisionRanks">, name: e.target.value.trim() }); }}
                className="h-8 flex-1 rounded-sm border border-border bg-surface px-2 text-[13px] font-semibold outline-none focus:border-accent" />
              <button onClick={() => { if (confirm("Supprimer ce grade ?")) void remove({ rankId: r._id as Id<"divisionRanks"> }); }} className="text-faint hover:text-danger"><Trash2 className="h-[14px] w-[14px]" /></button>
            </div>
            <div className="flex flex-wrap gap-[6px]">
              {catalog.map((c) => {
                const on = r.perms.includes(c.slug);
                return (
                  <button key={c.slug} onClick={() => void setPerms({ rankId: r._id as Id<"divisionRanks">, perms: on ? r.perms.filter((p) => p !== c.slug) : [...r.perms, c.slug] })}
                    className="rounded-[6px] border px-[8px] py-[4px] text-[11.5px] font-semibold"
                    style={on ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent)" } : { borderColor: "var(--border)", background: "var(--surface)", color: "var(--muted)" }}>
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {ranks.length === 0 && <div className="rounded-sm border border-dashed border-border px-3 py-[10px] text-center text-[12px] text-faint">Aucun grade interne. Ajoutes-en un.</div>}
        <div className="flex items-center gap-[8px]">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nouveau grade (ex. Instructeur, Opérateur…)" className="h-9 flex-1 rounded-sm border border-border bg-surface-2 px-2 text-[13px] outline-none focus:border-accent" />
          <Button variant="primary" disabled={!newName.trim()} onClick={async () => { const r = await toast.guard(create({ divisionId, name: newName.trim() }), "Création impossible"); if (r !== undefined) setNewName(""); }}><Plus className="h-[14px] w-[14px]" /> Ajouter</Button>
        </div>
      </div>
    </section>
  );
}
