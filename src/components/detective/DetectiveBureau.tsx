import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { FolderOpen, Users, Network, FlaskConical, Eye, Search, Bell, Check } from "lucide-react";
import { api } from "@/lib/api";
import type { Id } from "convex/_generated/dataModel";
import { useToast } from "@/providers/toast";
import { DetectiveNavProvider, type DetectiveNav } from "./nav";
import { DialogsProvider } from "./dialogs";
import { CasesSection } from "./CasesSection";
import { CaseDetail } from "./CaseDetail";
import { RegistrySection } from "./RegistrySection";
import { GangsSection } from "./GangsSection";
import { DrugsSection } from "./DrugsSection";
import { SurveillanceSection } from "./SurveillanceSection";
import { inputCls, dtShort } from "./ui";

type Section = "enquetes" | "registre" | "gangs" | "stups" | "surveillance";

export function DetectiveBureau({ divisionId, perms, isLead }: { divisionId: Id<"divisions">; perms: string[]; isLead: boolean }) {
  const has = (p: string) => isLead || perms.includes(p);
  const [section, setSection] = useState<Section>("enquetes");
  const [caseId, setCaseId] = useState<Id<"dbCases"> | null>(null);
  const [openPersonId, setOpenPersonId] = useState<string | null>(null);
  const [openGangId, setOpenGangId] = useState<string | null>(null);

  const nav: DetectiveNav = {
    openCase: (id) => { setSection("enquetes"); setCaseId(id as Id<"dbCases">); },
    openPerson: (id) => { setSection("registre"); setOpenPersonId(id); },
    openGang: (id) => { setSection("gangs"); setOpenGangId(id); },
    openDrugSite: () => { setSection("stups"); },
  };

  const TABS: { key: Section; label: string; icon: typeof Users }[] = [
    { key: "enquetes", label: "Enquêtes", icon: FolderOpen },
    { key: "registre", label: "Registre", icon: Users },
    { key: "gangs", label: "Gangs & Orgs", icon: Network },
    { key: "stups", label: "Stupéfiants", icon: FlaskConical },
    { key: "surveillance", label: "Surveillance", icon: Eye },
  ];

  return (
    <DetectiveNavProvider value={nav}>
      <DialogsProvider>
      <div className="flex flex-col gap-[14px]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 flex-wrap gap-[2px] rounded-card border border-border bg-surface p-[5px]">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => { setSection(t.key); setCaseId(null); }}
                className="flex items-center gap-[6px] rounded-[7px] px-[12px] py-[7px] text-[12.5px] font-semibold hover:bg-surface-2"
                style={section === t.key ? { background: "var(--accent)", color: "var(--accent-contrast)" } : { color: "var(--muted)" }}>
                <t.icon className="h-[14px] w-[14px]" /> {t.label}
              </button>
            ))}
          </div>
          <GlobalSearch divisionId={divisionId} nav={nav} />
          <NotifBell divisionId={divisionId} onOpenCase={(id) => nav.openCase?.(id)} />
        </div>

        {section === "enquetes" && (caseId
          ? <CaseDetail divisionId={divisionId} caseId={caseId} onBack={() => setCaseId(null)} />
          : <CasesSection divisionId={divisionId} canWrite={has("db.cases")} onOpen={setCaseId} />)}
        {section === "registre" && <RegistrySection divisionId={divisionId} canWrite={has("db.registry")} openPersonId={openPersonId} onConsumeOpen={() => setOpenPersonId(null)} />}
        {section === "gangs" && <GangsSection divisionId={divisionId} canWrite={has("db.gangs")} openGangId={openGangId} onConsumeOpen={() => setOpenGangId(null)} />}
        {section === "stups" && <DrugsSection divisionId={divisionId} canWrite={has("db.drugs")} />}
        {section === "surveillance" && <SurveillanceSection divisionId={divisionId} canWrite={has("db.surveillance")} />}
      </div>
      </DialogsProvider>
    </DetectiveNavProvider>
  );
}

function GlobalSearch({ divisionId, nav }: { divisionId: Id<"divisions">; nav: DetectiveNav }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const res = useQuery(api.detectiveSearch.global, q.trim() ? { divisionId, q } : "skip");
  const groups = res ? [
    { key: "cases", label: "Enquêtes", items: res.cases.map((c) => ({ id: c._id as string, label: `#${c.number} ${c.title}`, act: () => nav.openCase?.(c._id) })) },
    { key: "persons", label: "Personnes", items: res.persons.map((p) => ({ id: p._id as string, label: p.name, act: () => nav.openPerson?.(p._id) })) },
    { key: "gangs", label: "Organisations", items: res.gangs.map((g) => ({ id: g._id as string, label: g.name, act: () => nav.openGang?.(g._id) })) },
    { key: "drugSites", label: "Stupéfiants", items: res.drugSites.map((d) => ({ id: d._id as string, label: d.name, act: () => nav.openDrugSite?.(d._id) })) },
  ].filter((g) => g.items.length > 0) : [];
  return (
    <div className="relative w-[240px]">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder="Recherche du bureau…" className={`${inputCls} pl-9`} />
      {open && q.trim() && (
        <div className="absolute right-0 z-30 mt-1 max-h-[360px] w-[320px] overflow-y-auto rounded-sm border border-border-strong bg-elev p-1 shadow-[0_14px_36px_rgba(0,0,0,.3)]">
          {groups.length === 0 && <div className="px-3 py-2 text-[12.5px] text-faint">Aucun résultat.</div>}
          {groups.map((g) => (
            <div key={g.key} className="mb-1">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-faint">{g.label}</div>
              {g.items.map((it) => (
                <button key={it.id} onMouseDown={(e) => { e.preventDefault(); it.act(); setOpen(false); setQ(""); }}
                  className="block w-full truncate rounded-sm px-3 py-1.5 text-left text-[13px] hover:bg-surface-2">{it.label}</button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NotifBell({ divisionId, onOpenCase }: { divisionId: Id<"divisions">; onOpenCase: (id: Id<"dbCases">) => void }) {
  const count = useQuery(api.detectiveNotif.unreadCount, { divisionId }) ?? 0;
  const list = useQuery(api.detectiveNotif.myNotifications, { divisionId });
  const markRead = useMutation(api.detectiveNotif.markRead);
  const markAll = useMutation(api.detectiveNotif.markAllRead);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="relative flex h-10 w-10 items-center justify-center rounded-sm border border-border bg-surface-2 hover:border-border-strong">
        <Bell className="h-[18px] w-[18px] text-muted" />
        {count > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{count}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 max-h-[400px] w-[320px] overflow-y-auto rounded-sm border border-border-strong bg-elev shadow-[0_14px_36px_rgba(0,0,0,.3)]">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-faint">Notifications</span>
              {count > 0 && <button onClick={() => toast.guard(markAll({ divisionId }), "")} className="flex items-center gap-1 text-[11px] text-accent hover:underline"><Check className="h-3 w-3" /> Tout lire</button>}
            </div>
            {list === undefined ? <div className="px-3 py-3 text-[12.5px] text-faint">…</div> : list.length === 0 ? <div className="px-3 py-4 text-center text-[12.5px] text-faint">Aucune notification.</div> : (
              list.map((n) => (
                <button key={n._id} onClick={() => { void markRead({ id: n._id }); if (n.caseId) { onOpenCase(n.caseId); setOpen(false); } }}
                  className="block w-full border-b border-border px-3 py-2 text-left last:border-0 hover:bg-surface-2" style={n.read ? undefined : { background: "color-mix(in srgb, var(--accent) 6%, transparent)" }}>
                  <div className="text-[12.5px]">{n.text}</div>
                  <div className="mt-0.5 text-[10.5px] text-faint">{dtShort(n.at)}</div>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
