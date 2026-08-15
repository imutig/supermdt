import { Fragment, useState } from "react";
import { Search, X, RefreshCw } from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/api";
import { AgentTag } from "@/components/common/AgentTag";
import { AuditDetailModal } from "@/components/admin/AuditDetailModal";
import { actionLabel, resourceLabel } from "@/lib/auditLabels";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonRows } from "@/components/common/Skeleton";
import { useToast } from "@/providers/toast";
import { useDialogs } from "@/components/detective/dialogs";
import { useNavigate } from "react-router-dom";
import { usePermPreview } from "@/providers/perm-preview";

const TABS = [
  { key: "validation", label: "Validation" },
  { key: "invitations", label: "Invitations" },
  { key: "permissions", label: "Permissions" },
  { key: "discord", label: "Commandes Discord" },
  { key: "defcon", label: "DEFCON" },
  { key: "audit", label: "Journal d'audit" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function Admin() {
  const [tab, setTab] = useState<TabKey>("validation");
  return (
    <div className="p-[22px_26px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="mb-[18px] flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Administration</h1>
        <div className="flex-1" />
        <NexusSyncButton />
      </div>
      <div className="mb-[18px] flex flex-wrap gap-[2px] rounded-card border border-border bg-surface p-[5px]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="rounded-[7px] px-[13px] py-[7px] text-[12.5px] font-semibold hover:bg-surface-2"
            style={tab === t.key ? { background: "var(--accent)", color: "#fff" } : { color: "var(--muted)" }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "validation" && <ValidationTab />}
      {tab === "invitations" && <InvitationsTab />}
      {tab === "permissions" && <PermissionsTab />}
      {tab === "discord" && <DiscordCommandsTab />}
      {tab === "defcon" && <DefconTab />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}

/* ============ Synchronisation Nexus (données citoyens/armes/véhicules) ============ */
function NexusSyncButton() {
  const canSync = useQuery(api.migration.canSync);
  const runSync = useAction(api.migration.runSync);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!canSync) return null;
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = (await runSync({})) as {
            ok?: boolean; error?: string;
            citoyens?: { ajoutes: number }; armes?: { ajoutes: number }; vehicules?: { ajoutes: number } | null;
          };
          if (r?.ok) {
            toast.success(`Synchronisé : +${r.citoyens?.ajoutes ?? 0} citoyens, +${r.vehicules?.ajoutes ?? 0} véhicules, +${r.armes?.ajoutes ?? 0} armes.`);
          } else {
            toast.error(r?.error ? `Synchronisation échouée : ${r.error}` : "Synchronisation échouée.");
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Synchronisation impossible.");
        }
        setBusy(false);
      }}
      className="mdt-press flex items-center gap-[7px] rounded-[9px] border border-border bg-surface-2 px-[13px] py-[8px] text-[13px] font-semibold text-text hover:border-border-strong disabled:opacity-60"
    >
      <RefreshCw className={`h-[15px] w-[15px] ${busy ? "animate-spin" : ""}`} />
      {busy ? "Synchronisation…" : "Synchroniser les données depuis le Nexus"}
    </button>
  );
}

/* ============ Validation ============ */
function ValidationTab() {
  const pending = useQuery(api.agents.pending);
  const opts = useQuery(api.config.options);

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="border-b border-border px-4 py-[13px] text-[13.5px] font-bold">
        Inscriptions en attente
      </div>
      {pending === undefined || opts === undefined ? (
        <div className="p-4"><SkeletonRows rows={3} /></div>
      ) : pending.length === 0 ? (
        <EmptyState compact title="Aucune inscription en attente" message="Les nouvelles demandes de compte apparaîtront ici." />
      ) : (
        pending.map((a) => (
          <ValidationRow key={a._id} agent={a} grades={opts.grades} />
        ))
      )}
    </div>
  );
}

function ValidationRow({
  agent,
  grades,
}: {
  agent: { _id: Id<"agents">; nomRP: string; prenomRP: string; login: string };
  grades: { _id: Id<"grades">; name: string; corps: string; academyOnly?: boolean }[];
}) {
  const validate = useMutation(api.agents.validate);
  const reject = useMutation(api.agents.reject);
  const [gradeId, setGradeId] = useState("");
  const [matricule, setMatricule] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const effectiveGrade = gradeId || grades[0]?._id || "";
  // Un cadet n'a pas de numéro de badge : le champ disparaît pour ce grade.
  const isCadet = grades.find((g) => g._id === effectiveGrade)?.academyOnly === true;

  async function doValidate() {
    setErr(null);
    let m: number | undefined;
    if (!isCadet) {
      m = parseInt(matricule);
      if (!m || m < 1 || m > 99999) {
        setErr("Numéro de badge (5 chiffres) requis.");
        return;
      }
    }
    setBusy(true);
    try {
      await validate({
        agentId: agent._id,
        gradeId: effectiveGrade as Id<"grades">,
        divisionIds: [],
        matricule: m,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-border px-4 py-4">
      <div className="mb-3 flex items-center gap-[10px]">
        <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] border border-border bg-surface-2 text-[11px] font-bold text-muted">
          {`${agent.prenomRP.charAt(0)}${agent.nomRP.charAt(0)}`.toUpperCase()}
        </div>
        <div>
          <div className="text-[13.5px] font-semibold">
            {agent.prenomRP} {agent.nomRP}
          </div>
          <div className="font-data text-[11px] text-faint">{agent.login}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-[5px] block text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Grade</span>
          <select
            value={effectiveGrade}
            onChange={(e) => setGradeId(e.target.value)}
            className="h-9 w-[180px] rounded-sm border border-border bg-surface-2 px-2 text-[13px] text-text outline-none focus:border-accent"
          >
            {grades.map((g) => (
              <option key={g._id} value={g._id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        {!isCadet && (
          <label className="block">
            <span className="mb-[5px] block text-[10px] font-bold uppercase tracking-[0.08em] text-faint">N° de badge</span>
            <input
              value={matricule}
              onChange={(e) => setMatricule(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
              placeholder="5 chiffres"
              className="h-9 w-[100px] rounded-sm border border-border bg-surface-2 px-2 text-center font-data text-[13px] text-text outline-none focus:border-accent"
            />
          </label>
        )}
        {isCadet && (
          <div className="self-end pb-[7px] text-[11.5px] text-faint">Cadet : numéro de badge attribué à l'assermentation.</div>
        )}
        <div className="flex-1" />
        <div className="flex gap-2">
          <button
            onClick={() => reject({ agentId: agent._id })}
            className="rounded-sm border border-border bg-surface-2 px-3 py-2 text-[12.5px] font-semibold text-muted hover:border-danger hover:text-danger"
          >
            Rejeter
          </button>
          <button
            onClick={doValidate}
            disabled={busy}
            className="rounded-sm bg-accent px-4 py-2 text-[12.5px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50"
          >
            {busy ? "..." : "Valider"}
          </button>
        </div>
      </div>
      {err && <div className="mt-2 text-[12px] text-danger">{err}</div>}
    </div>
  );
}

/* ============ Invitations ============ */
function InvitationsTab() {
  const invites = useQuery(api.invitations.list);
  const create = useMutation(api.invitations.create);
  const revoke = useMutation(api.invitations.revoke);
  const [type, setType] = useState<"SINGLE" | "MULTI">("SINGLE");
  const [expires, setExpires] = useState("");
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const code = await create({
        type,
        expiresInHours: expires ? parseInt(expires) : undefined,
        maxUses: type === "MULTI" ? 20 : undefined,
      });
      setLastCode(code);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="rounded-card border border-border bg-surface p-4">
        <div className="mb-3 text-[13.5px] font-bold">Générer une invitation</div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-[5px] block text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as "SINGLE" | "MULTI")}
              className="h-9 w-[200px] rounded-sm border border-border bg-surface-2 px-2 text-[13px] text-text outline-none focus:border-accent"
            >
              <option value="SINGLE">Usage unique</option>
              <option value="MULTI">Multi-usage (20)</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-[5px] block text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
              Expiration (heures, optionnel)
            </span>
            <input
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              placeholder="ex. 24"
              className="h-9 w-[150px] rounded-sm border border-border bg-surface-2 px-2 text-[13px] text-text outline-none focus:border-accent"
            />
          </label>
          <button
            onClick={generate}
            disabled={busy}
            className="h-9 rounded-sm bg-accent px-4 text-[12.5px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50"
          >
            {busy ? "..." : "Générer"}
          </button>
        </div>
        {lastCode && (
          <div className="mt-3 flex items-center gap-3 rounded-sm border border-accent bg-accent-soft px-4 py-3">
            <span className="text-[12px] text-muted">Nouveau code :</span>
            <span className="font-data text-[16px] font-bold text-accent">{lastCode}</span>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="grid grid-cols-[1.2fr_.8fr_.8fr_.9fr_1fr_.6fr] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
          <span>Code</span>
          <span>Type</span>
          <span>Usages</span>
          <span>Statut</span>
          <span>Créé par</span>
          <span></span>
        </div>
        {(invites ?? []).length === 0 && <EmptyState compact title="Aucune invitation" />}
        {(invites ?? []).map((i) => (
          <div
            key={i._id}
            className="grid grid-cols-[1.2fr_.8fr_.8fr_.9fr_1fr_.6fr] items-center gap-3 border-b border-border px-4 py-3"
          >
            <span className="font-data text-[13px] font-semibold">{i.code}</span>
            <span className="text-[12.5px] text-muted">{i.type === "SINGLE" ? "Unique" : "Multi"}</span>
            <span className="font-data text-[12.5px]">
              {i.usesCount}/{i.maxUses}
            </span>
            <span
              className="text-[12px] font-semibold"
              style={{ color: i.usable ? "var(--success)" : "var(--muted)" }}
            >
              {i.revoked ? "Révoquée" : i.usable ? "Active" : "Épuisée"}
            </span>
            <span className="text-[12px] text-muted">{i.creator}</span>
            <span className="text-right">
              {!i.revoked && (
                <button
                  onClick={() => revoke({ id: i._id })}
                  className="text-[12px] font-semibold text-muted hover:text-danger"
                >
                  Révoquer
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============ DEFCON ============ */
function DefconTab() {
  const current = useQuery(api.defcon.current);
  const levels = useQuery(api.defcon.listLevels);
  const setDefcon = useMutation(api.defcon.setDefcon);
  const [duration, setDuration] = useState("");

  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <div className="mb-1 text-[13.5px] font-bold">Niveau d'alerte global (DEFCON)</div>
      <div className="mb-4 text-[12.5px] text-muted">
        Niveau courant :{" "}
        <b style={{ color: current?.color ?? "var(--muted)" }}>{current?.name ?? "..."}</b>. Il
        s'applique instantanément à tous les agents et pilote le calcul des amendes.
      </div>
      <label className="mb-4 block">
        <span className="mb-[5px] block text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
          Durée (minutes, optionnel - sinon jusqu'au prochain changement)
        </span>
        <input
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder="ex. 120"
          className="h-9 w-[180px] rounded-sm border border-border bg-surface-2 px-2 text-[13px] text-text outline-none focus:border-accent"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {(levels ?? []).map((l) => {
          const isCurrent = current?._id === l._id;
          return (
            <button
              key={l._id}
              onClick={() =>
                setDefcon({ levelId: l._id, durationMinutes: duration ? parseInt(duration) : undefined })
              }
              className="flex items-center gap-2 rounded-sm border px-[14px] py-[10px] text-[13px] font-semibold"
              style={{
                borderColor: isCurrent ? l.color : "var(--border)",
                background: isCurrent ? `color-mix(in srgb, ${l.color} 14%, transparent)` : "var(--surface-2)",
                color: l.color,
              }}
            >
              <span className="h-[9px] w-[9px] rounded-full" style={{ background: l.color }} />
              {l.name}
              <span className="font-data text-[11px] opacity-70">×{l.fineMultiplier}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============ Commandes Discord (accès) ============ */
function DiscordCommandsTab() {
  const data = useQuery(api.discordAccess.list);
  const setAccess = useMutation(api.discordAccess.set);

  if (data === undefined) {
    return <div className="rounded-card border border-border bg-surface p-10 text-center text-[13px] text-faint">Chargement...</div>;
  }
  return (
    <div className="rounded-card border border-border bg-surface p-[18px]">
      <div className="mb-[4px] text-[14px] font-bold">Accès aux commandes Discord</div>
      <div className="mb-[16px] text-[12.5px] text-muted">
        Pour chaque commande : un <b>grade minimum</b> (compte lié) et/ou une liste d'<b>IDs de rôle Discord</b> autorisés (séparés par des virgules). Les deux se combinent (l'un OU l'autre suffit). Laissé vide = <b>ouvert à tous</b>.
      </div>
      <div className="flex flex-col gap-[8px]">
        {data.commands.map((c) => (
          <CmdAccessRow key={c.command} cmd={c} grades={data.grades} onSave={(minGradeId, roleIds) => setAccess({ command: c.command, minGradeId: minGradeId ?? undefined, roleIds })} />
        ))}
      </div>
    </div>
  );
}

function CmdAccessRow({
  cmd,
  grades,
  onSave,
}: {
  cmd: { command: string; label: string; minGradeId: Id<"grades"> | null; roleIds: string[] };
  grades: { _id: Id<"grades">; name: string; position: number }[];
  onSave: (minGradeId: Id<"grades"> | null, roleIds: string[]) => Promise<unknown>;
}) {
  const toast = useToast();
  const [roles, setRoles] = useState(cmd.roleIds.join(", "));
  const [grade, setGrade] = useState<string>(cmd.minGradeId ?? "");

  const save = (nextGrade: string, nextRoles: string) => {
    const roleIds = nextRoles.split(",").map((r) => r.trim()).filter(Boolean);
    void toast.guard(onSave((nextGrade || null) as Id<"grades"> | null, roleIds), "Enregistrement impossible");
  };

  return (
    <div className="grid grid-cols-[1.4fr_1fr_1.6fr] items-center gap-3 rounded-sm border border-border bg-surface-2 px-[12px] py-[9px]">
      <span className="font-data text-[12.5px] font-semibold">{cmd.label}</span>
      <select
        value={grade}
        onChange={(e) => { setGrade(e.target.value); save(e.target.value, roles); }}
        className="h-9 w-full rounded-sm border border-border bg-surface px-2 text-[12.5px] outline-none focus:border-accent"
      >
        <option value="">Ouvert à tous</option>
        {grades.map((g) => <option key={g._id} value={g._id}>À partir de {g.name}</option>)}
      </select>
      <input
        value={roles}
        onChange={(e) => setRoles(e.target.value)}
        onBlur={() => save(grade, roles)}
        placeholder="IDs de rôle Discord (ex. 1434..., 1509...)"
        className="h-9 w-full rounded-sm border border-border bg-surface px-2 font-data text-[12px] outline-none focus:border-accent"
      />
    </div>
  );
}

/* ============ Permissions (RBAC) ============ */
// Regroupement des permissions par section, dans l'ordre du menu, avec libellés
// lisibles (au lieu des domaines techniques bruts).
const PERM_SECTIONS: { domain: string; label: string }[] = [
  { domain: "config", label: "Configuration & rôles" },
  { domain: "effectif", label: "Effectif" },
  { domain: "discipline", label: "Discipline" },
  { domain: "absences", label: "Absences" },
  { domain: "calendrier", label: "Calendrier" },
  { domain: "ceremonies", label: "Cérémonies" },
  { domain: "formations", label: "Formations" },
  { domain: "fto", label: "FTO" },
  { domain: "citoyens", label: "Citoyens" },
  { domain: "casier", label: "Casiers" },
  { domain: "contraventions", label: "Contraventions" },
  { domain: "mandats", label: "Mandats" },
  { domain: "plaintes", label: "Plaintes" },
  { domain: "depositions", label: "Dépositions" },
  { domain: "saisies", label: "Saisies" },
  { domain: "armes", label: "Armes" },
  { domain: "vehicules", label: "Véhicules" },
  { domain: "flotte", label: "Flotte" },
  { domain: "dispatch", label: "Dispatch" },
  { domain: "service", label: "Service" },
  { domain: "services", label: "Services" },
  { domain: "bolo", label: "BOLO" },
  { domain: "carte", label: "Carte" },
  { domain: "codepenal", label: "Code pénal" },
  { domain: "protocoles", label: "Protocoles" },
  { domain: "rapports", label: "Rapports" },
  { domain: "stats", label: "Statistiques" },
  { domain: "finances", label: "Finances" },
  { domain: "defcon", label: "DEFCON" },
  { domain: "archive", label: "Archives" },
  { domain: "audit", label: "Journal d'audit" },
  { domain: "invites", label: "Invitations" },
  { domain: "lspa", label: "Académie (LSPA)" },
];

function PermissionsTab() {
  const data = useQuery(api.config.permissionMatrix);
  const setPerm = useMutation(api.config.setGradePermission);
  const setAllPerm = useMutation(api.config.setPermissionAllGrades);
  const copyPerms = useMutation(api.config.copyGradePermissions);
  const dialogs = useDialogs();
  const toast = useToast();
  const navigate = useNavigate();
  const { setPreview } = usePermPreview();
  const [q, setQ] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const [copyTo, setCopyTo] = useState("");
  const [previewPick, setPreviewPick] = useState("");

  async function doCopy() {
    if (!copyFrom || !copyTo || copyFrom === copyTo || !data) return;
    const fromName = data.grades.find((g) => g._id === copyFrom)?.name ?? "?";
    const toName = data.grades.find((g) => g._id === copyTo)?.name ?? "?";
    const ok = await dialogs.confirm({
      title: "Copier les permissions",
      message: `Remplacer toutes les permissions de « ${toName} » par celles de « ${fromName} » ? Cette action écrase les permissions actuelles du grade cible.`,
      confirmLabel: "Copier",
      danger: true,
    });
    if (!ok) return;
    const r = await toast.guard(copyPerms({ fromGradeId: copyFrom as Id<"grades">, toGradeId: copyTo as Id<"grades"> }), "Copie impossible");
    if (r !== undefined) toast.success(`Permissions copiées vers « ${toName} » (${r.count}).`);
  }

  if (data === undefined) {
    return (
      <div className="rounded-card border border-border bg-surface p-10 text-center text-[13px] text-faint">
        Chargement...
      </div>
    );
  }
  const granted = new Set(data.granted);

  // Recherche insensible à la casse et aux accents, sur le libellé, le domaine
  // et le slug : la matrice dépasse la centaine de lignes, retrouver une
  // permission précise à l'oeil devient vite pénible.
  const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const needle = norm(q.trim());
  const matching = needle
    ? data.permissions.filter((p) => norm(`${p.description} ${p.domain} ${p.slug}`).includes(needle))
    : data.permissions;

  const byDomain = new Map<string, typeof data.permissions>();
  for (const p of matching) {
    if (!byDomain.has(p.domain)) byDomain.set(p.domain, []);
    byDomain.get(p.domain)!.push(p);
  }
  // Sections dans l'ordre du menu (libellés lisibles), puis tout domaine non
  // répertorié, en dernier, sous son nom brut.
  const orderedSections: { domain: string; label: string; perms: typeof data.permissions }[] = [
    ...PERM_SECTIONS.filter((s) => byDomain.has(s.domain)).map((s) => ({ ...s, perms: byDomain.get(s.domain)! })),
    ...[...byDomain.keys()]
      .filter((d) => !PERM_SECTIONS.some((s) => s.domain === d))
      .map((d) => ({ domain: d, label: d, perms: byDomain.get(d)! })),
  ];

  return (
    <div className="rounded-card border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex h-9 min-w-[260px] flex-1 items-center gap-2 rounded-sm border border-border bg-surface-2 px-3">
          <Search className="h-4 w-4 flex-shrink-0 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher une permission (libellé, domaine, slug)…"
            className="h-full flex-1 bg-transparent text-[13px] outline-none"
          />
          {q && (
            <button onClick={() => setQ("")} className="flex-shrink-0 text-faint hover:text-text" title="Effacer">
              <X className="h-[15px] w-[15px]" />
            </button>
          )}
        </div>
        <span className="font-data text-[11.5px] text-faint">
          {matching.length} / {data.permissions.length}
        </span>
      </div>
      <div className="border-b border-border px-4 py-[10px] text-[12.5px] text-muted">
        Coche pour attribuer une permission à un grade. L'owner conserve tous les droits quoi qu'il arrive.
      </div>
      {/* Prévisualiser le MDT en tant qu'un grade */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2 px-4 py-[10px]">
        <span className="text-[11.5px] font-semibold text-muted">Prévisualiser en tant que</span>
        <select value={previewPick} onChange={(e) => setPreviewPick(e.target.value)} className="h-8 rounded-sm border border-border bg-surface px-2 text-[12px] outline-none focus:border-accent">
          <option value="">- grade -</option>
          {data.grades.map((g) => <option key={g._id} value={g._id}>{g.name}</option>)}
        </select>
        <button
          onClick={() => {
            const g = data.grades.find((x) => x._id === previewPick);
            if (!g) return;
            setPreview(previewPick as Id<"grades">, g.name);
            navigate("/");
          }}
          disabled={!previewPick}
          className="h-8 rounded-sm bg-accent px-3 text-[12px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-40"
        >
          Prévisualiser
        </button>
        <span className="text-[11px] text-faint">Le MDT s'affiche comme ce grade le verrait. Une barre « Quitter l'aperçu » apparaît en bas.</span>
      </div>
      {/* Copier les permissions d'un grade vers un autre */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2 px-4 py-[10px]">
        <span className="text-[11.5px] font-semibold text-muted">Copier depuis</span>
        <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className="h-8 rounded-sm border border-border bg-surface px-2 text-[12px] outline-none focus:border-accent">
          <option value="">- grade source -</option>
          {data.grades.map((g) => <option key={g._id} value={g._id}>{g.name}</option>)}
        </select>
        <span className="text-[11.5px] font-semibold text-muted">vers</span>
        <select value={copyTo} onChange={(e) => setCopyTo(e.target.value)} className="h-8 rounded-sm border border-border bg-surface px-2 text-[12px] outline-none focus:border-accent">
          <option value="">- grade cible -</option>
          {data.grades.map((g) => <option key={g._id} value={g._id}>{g.name}</option>)}
        </select>
        <button
          onClick={doCopy}
          disabled={!copyFrom || !copyTo || copyFrom === copyTo}
          className="h-8 rounded-sm bg-accent px-3 text-[12px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-40"
        >
          Copier
        </button>
      </div>
      {matching.length === 0 ? (
        <div className="px-4 py-10 text-center text-[13px] text-faint">
          Aucune permission ne correspond à « {q} ».
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th
                className="border-b border-border bg-surface px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.06em] text-faint"
                style={{ position: "sticky", left: 0, zIndex: 2, minWidth: 220 }}
              >
                Permission
              </th>
              {data.grades.map((g) => (
                <th
                  key={g._id}
                  className="border-b border-l border-border px-2 py-2 text-center text-[10px] font-bold text-faint"
                  style={{ minWidth: 60, writingMode: "vertical-rl" }}
                  title={g.name}
                >
                  {g.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orderedSections.map(({ domain, label, perms }) => (
              <Fragment key={domain}>
                <tr>
                  <td
                    colSpan={data.grades.length + 1}
                    className="bg-surface-2 px-3 py-[6px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint"
                    style={{ position: "sticky", left: 0 }}
                  >
                    {label}
                  </td>
                </tr>
                {perms.map((p) => {
                  const allOn = data.grades.length > 0 && data.grades.every((g) => granted.has(`${g._id}:${p._id}`));
                  const someOn = data.grades.some((g) => granted.has(`${g._id}:${p._id}`));
                  return (
                  <tr key={p._id} className="hover:bg-surface-2">
                    <td
                      className="border-b border-border bg-surface px-3 py-[6px]"
                      style={{ position: "sticky", left: 0, zIndex: 1 }}
                      title={p.slug}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={allOn}
                          ref={(el) => { if (el) el.indeterminate = someOn && !allOn; }}
                          onChange={() => setAllPerm({ permissionId: p._id, grant: !allOn })}
                          className="cursor-pointer"
                          title="Cocher / décocher pour tous les grades"
                        />
                        <span className="text-[12px]">{p.description}</span>
                      </span>
                    </td>
                    {data.grades.map((g) => {
                      const on = granted.has(`${g._id}:${p._id}`);
                      return (
                        <td key={g._id} className="border-b border-l border-border text-center">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) =>
                              setPerm({ gradeId: g._id, permissionId: p._id, grant: e.target.checked })
                            }
                            className="cursor-pointer"
                          />
                        </td>
                      );
                    })}
                  </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

/* ============ Audit ============ */
function AuditTab() {
  const [view, setView] = useState<"actions" | "consultations">("actions");
  return (
    <div>
      <div className="mb-[12px] flex gap-[6px]">
        {([["actions", "Actions"], ["consultations", "Consultations"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setView(k)}
            className="rounded-sm px-[12px] py-[7px] text-[12.5px] font-semibold"
            style={view === k ? { background: "var(--accent)", color: "#fff" } : { background: "var(--surface-2)", color: "var(--muted)" }}
          >
            {label}
          </button>
        ))}
      </div>
      {view === "actions" ? <AuditActions /> : <AuditAccess />}
    </div>
  );
}

// Journal des consultations de dossiers (accessLog).
function AuditAccess() {
  const rows = useQuery(api.audit.accessRecent);
  const KIND: Record<string, string> = { SEARCH: "Recherche", LOOKUP: "Consultation", EXPORT: "Export" };
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="grid grid-cols-[1.2fr_1.6fr_.8fr_2fr] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
        <span>Quand</span><span>Agent</span><span>Type</span><span>Cible</span>
      </div>
      {rows === undefined ? (
        <div className="p-4"><SkeletonRows rows={5} /></div>
      ) : rows.length === 0 ? (
        <EmptyState compact title="Aucune consultation" message="Les consultations de dossiers apparaîtront ici." />
      ) : (
        rows.map((r) => (
          <div key={r._id} className="grid grid-cols-[1.2fr_1.6fr_.8fr_2fr] items-center gap-3 border-b border-border px-4 py-[10px]">
            <span className="font-data text-[11.5px] text-muted">{new Date(r.at).toLocaleString("fr-FR")}</span>
            <span className="text-[12.5px]"><AgentTag agent={{ matricule: r.actorMatricule, name: r.actorName }} className="font-semibold" /></span>
            <span className="text-[11.5px] text-muted">{KIND[r.kind] ?? r.kind}</span>
            <span className="truncate text-[12.5px] text-muted">{r.resourceLabel ?? r.query ?? <span className="text-faint">-</span>}</span>
          </div>
        ))
      )}
    </div>
  );
}

function AuditActions() {
  const rows = useQuery(api.audit.recent);
  const [detailId, setDetailId] = useState<Id<"auditLog"> | null>(null);
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="grid grid-cols-[1.2fr_2.4fr_1.4fr_.5fr] gap-3 border-b border-border px-4 py-[11px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
        <span>Quand</span>
        <span>Évènement</span>
        <span>Ressource</span>
        <span></span>
      </div>
      {rows === undefined ? (
        <div className="p-4"><SkeletonRows rows={5} /></div>
      ) : rows.length === 0 ? (
        <EmptyState compact title="Aucune entrée" message="Le journal d'audit est vide." />
      ) : (
        rows.map((r) => (
          <div
            key={r._id}
            onClick={() => setDetailId(r._id)}
            className="grid cursor-pointer grid-cols-[1.2fr_2.4fr_1.4fr_.5fr] items-center gap-3 border-b border-border px-4 py-[10px] hover:bg-surface-2"
          >
            <span className="font-data text-[11.5px] text-muted">
              {new Date(r.at).toLocaleString("fr-FR")}
            </span>
            <span className="text-[12.5px]">
              <AgentTag
                agent={{ matricule: r.actorMatricule, name: r.actorName }}
                className="font-semibold"
              />{" "}
              <span className="text-muted">{actionLabel(r.action)}</span>
            </span>
            <span className="text-[12.5px] text-muted">
              {r.resourceLabel ? (
                r.resourceLabel
              ) : (
                <span className="text-faint">{resourceLabel(r.resourceType)}</span>
              )}
            </span>
            <span className="flex items-center justify-end gap-2 text-[11px] text-faint">
              {r.hasDiff && (
                <span
                  className="rounded-[4px] px-[6px] py-[1px] font-semibold"
                  style={{
                    background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                    color: "var(--accent)",
                  }}
                >
                  diff
                </span>
              )}
              <span className="text-accent">→</span>
            </span>
          </div>
        ))
      )}
      {detailId && <AuditDetailModal id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
