import { useEffect, useRef, useState } from "react";
import { LogOut, Camera, IdCard, ChevronDown, X, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { api } from "@/lib/api";
import { useMe } from "@/hooks/useMe";
import { useToast } from "@/providers/toast";
import { fmtMatricule } from "@/components/common/AgentTag";
import { ImageUpload } from "@/components/common/ImageUpload";
import { FicheRenseignementModal } from "@/components/effectif/FicheRenseignementModal";

export function ProfileMenu() {
  const me = useMe();
  const { signOut } = useAuthActions();
  const setAvatar = useMutation(api.agents.setAvatar);
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState(false);
  const [fiche, setFiche] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const prenom = me?.agent.prenomRP ?? "";
  const nom = me?.agent.nomRP ?? "";
  const displayName = me ? `${prenom.charAt(0)}. ${nom}`.trim() : "…";
  const matricule = fmtMatricule(me?.agent.matricule) ?? "#-";
  const gradeName = me?.agent.isOwner ? "Owner" : (me?.grade?.name ?? "-");
  const initials = `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase() || "??";
  const avatar = me?.agent.avatarUrl ?? null;

  return (
    <div className="relative flex items-center gap-[10px] border-l border-border pl-[14px]" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="mdt-press flex items-center gap-[10px]">
        <div className="text-right leading-[1.15]">
          <div className="text-[13px] font-semibold">{displayName}</div>
          <div className="text-[11px] text-muted"><span className="font-data">{matricule}</span> · {gradeName}</div>
        </div>
        <Avatar url={avatar} initials={initials} size={34} />
        <ChevronDown className="h-[14px] w-[14px] text-faint" />
      </button>

      {open && (
        <div className="absolute right-0 top-[46px] z-[70] w-[230px] overflow-hidden rounded-[10px] border border-border-strong bg-elev shadow-[0_16px_50px_var(--shadow)] mdt-pop">
          <div className="flex items-center gap-[10px] border-b border-border px-[14px] py-[12px]">
            <Avatar url={avatar} initials={initials} size={40} />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-bold">{prenom} {nom}</div>
              <div className="text-[11.5px] text-muted"><span className="font-data text-accent">{matricule}</span> · {gradeName}</div>
            </div>
          </div>
          <MenuItem icon={User} label="Mon profil" onClick={() => { navigate("/profil"); setOpen(false); }} />
          <MenuItem icon={Camera} label="Photo de profil" onClick={() => { setPhoto(true); setOpen(false); }} />
          <MenuItem icon={IdCard} label="Fiche de renseignement" onClick={() => { setFiche(true); setOpen(false); }} />
          <div className="border-t border-border" />
          <MenuItem icon={LogOut} label="Se déconnecter" danger onClick={() => signOut()} />
        </div>
      )}

      {photo && (
        <div onClick={() => setPhoto(false)} className="fixed inset-0 z-[80] flex items-center justify-center" style={{ background: "var(--scrim)", backdropFilter: "blur(6px)" }}>
          <div onClick={(e) => e.stopPropagation()} className="w-[320px] rounded-card border border-border-strong bg-elev p-5 shadow-[0_24px_70px_rgba(0,0,0,.4)] mdt-pop">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="m-0 flex-1 text-[15px] font-bold">Photo de profil</h2>
              <button onClick={() => setPhoto(false)} className="flex h-[28px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
            </div>
            <div className="mx-auto w-[180px]">
              <ImageUpload value={avatar} onChange={async (url) => { await toast.guard(setAvatar({ url: url ?? undefined }), "Impossible"); }} />
            </div>
            <div className="mt-3 text-center text-[11.5px] text-muted">Cette photo apparaît dans l'organigramme et l'effectif.</div>
          </div>
        </div>
      )}

      {fiche && <FicheRenseignementModal onClose={() => setFiche(false)} />}
    </div>
  );
}

function Avatar({ url, initials, size }: { url: string | null; initials: string; size: number }) {
  return url ? (
    <img src={url} alt="" className="rounded-[9px] border border-border object-cover" style={{ width: size, height: size }} />
  ) : (
    <div className="flex items-center justify-center rounded-[9px] border border-border bg-surface-2 font-bold text-muted" style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials}</div>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: typeof Camera; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-[10px] px-[14px] py-[10px] text-left text-[13px] font-medium hover:bg-surface-2" style={{ color: danger ? "var(--danger)" : "var(--text)" }}>
      <Icon className="h-[16px] w-[16px]" style={{ color: danger ? "var(--danger)" : "var(--faint)" }} />
      {label}
    </button>
  );
}
