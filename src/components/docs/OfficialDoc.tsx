import { useRef, useState, type ReactNode, type RefObject } from "react";
import { X, Download, Send } from "lucide-react";
import { toPng } from "html-to-image";
import { useAction } from "convex/react";
import { api } from "@/lib/api";
import { useMe } from "@/hooks/useMe";
import { fmtMatricule } from "@/components/common/AgentTag";
import { useToast } from "@/providers/toast";

export type DocEmbed = {
  title: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
};

// Feuille du document officiel : en-tête au logo, corps, pied signé et cacheté.
// Isolée du modal pour pouvoir être rendue hors écran lors d'un envoi automatique.
export function DocSheet({
  title,
  subtitle,
  reference,
  innerRef,
  children,
}: {
  title: string;
  subtitle: string;
  reference: string;
  innerRef?: RefObject<HTMLDivElement>;
  children: ReactNode;
}) {
  const me = useMe();
  const officerName = me ? `${fmtMatricule(me.agent.matricule) ?? ""} ${me.agent.prenomRP} ${me.agent.nomRP}`.trim() : "-";

  return (
    <div ref={innerRef} className="h-fit bg-white p-[48px] text-[#0b0d10]" style={{ width: 820, flexShrink: 0, fontFamily: "'Inter',system-ui,sans-serif" }}>
      <div className="flex items-center gap-4 border-b-2 pb-4" style={{ borderColor: "#49A24A" }}>
        <img src="/logos/logo-badge-light.svg" alt="Station 13" style={{ width: 70, height: 70 }} />
        <div className="flex-1">
          <div className="text-[19px] font-extrabold tracking-tight">LSPD · Station 13</div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.15em]" style={{ color: "#2E6B2F" }}>Los Santos Police Department · Newton Street</div>
        </div>
        <div className="text-right text-[10.5px]" style={{ color: "#5c626e" }}>
          <div className="font-data font-semibold">{reference}</div>
          <div>Émis le {new Date().toLocaleDateString("fr-FR")}</div>
        </div>
      </div>

      <h1 className="mb-1 mt-6 text-center text-[22px] font-extrabold uppercase tracking-[0.06em]">{title}</h1>
      <div className="mb-6 text-center text-[11.5px]" style={{ color: "#5c626e" }}>{subtitle}</div>

      {children}

      <div className="mt-8 flex items-end justify-between border-t pt-4 text-[11px]" style={{ borderColor: "#e5e8ec", color: "#5c626e" }}>
        <div>
          <div>Délivré par {officerName}</div>
          <div>LSPD · Station 13 · Lucky Thirteen</div>
          <div className="mt-1">Fait à Los Santos, le {new Date().toLocaleDateString("fr-FR")}</div>
        </div>
        <div className="relative flex items-end gap-4">
          <div className="text-center">
            <div className="leading-none" style={{ fontFamily: "'Dancing Script',cursive", fontSize: 30, fontWeight: 700, color: "#12233b" }}>
              {me ? `${me.agent.prenomRP} ${me.agent.nomRP}` : "Station 13"}
            </div>
            <div className="mt-1 h-[1px] w-[170px]" style={{ background: "#cfd4db" }} />
            <div className="mt-1 text-[10px] uppercase tracking-[0.08em]" style={{ color: "#98a0ab" }}>Signature de l'agent</div>
          </div>
          <Stamp />
        </div>
      </div>
    </div>
  );
}

// Rend le document en PNG. Les logos sont des SVG distants : on attend leur
// chargement, sinon la capture sort avec des trous.
export async function snapshotDoc(node: HTMLElement) {
  const images = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    images.map((img) =>
      img.complete ? Promise.resolve() : new Promise((res) => { img.onload = res; img.onerror = res; }),
    ),
  );
  return await toPng(node, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true, style: { margin: "0" } });
}

// Aperçu plein écran avec téléchargement et envoi Discord manuel.
export function OfficialDoc({
  toolbarTitle,
  subtitle,
  title,
  reference,
  filename,
  discordEvent,
  discordEmbed,
  discordPath,
  children,
  onClose,
}: {
  toolbarTitle: string;
  subtitle: string;
  title: string;
  reference: string;
  filename: string;
  discordEvent: string;
  discordEmbed: DocEmbed;
  discordPath?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const docRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"png" | "discord" | null>(null);
  const postDocument = useAction(api.webhooks.postDocument);
  const toast = useToast();

  async function download() {
    if (!docRef.current) return;
    setBusy("png");
    try {
      const a = document.createElement("a");
      a.download = filename;
      a.href = await snapshotDoc(docRef.current);
      a.click();
    } finally {
      setBusy(null);
    }
  }

  async function sendDiscord() {
    if (!docRef.current) return;
    setBusy("discord");
    try {
      const dataUrl = await snapshotDoc(docRef.current);
      const res = await toast.guard(
        postDocument({ event: discordEvent, filename, base64: dataUrl.split(",")[1], embed: discordEmbed, path: discordPath }),
        "Envoi impossible",
      );
      if (res === "ok") toast.success("Document envoyé sur Discord.");
      else if (res) toast.warning(`Discord : ${res}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col" style={{ background: "rgba(0,0,0,.6)" }}>
      <div className="flex flex-shrink-0 items-center gap-3 bg-elev px-5 py-3 shadow">
        <span className="text-[13px] font-bold">{toolbarTitle}</span>
        <div className="flex-1" />
        <button onClick={sendDiscord} disabled={busy !== null} className="mdt-press flex items-center gap-[7px] rounded-[9px] border border-border bg-surface-2 px-[14px] py-[8px] text-[13px] font-semibold text-muted hover:border-border-strong disabled:opacity-50">
          <Send className="h-[15px] w-[15px]" /> {busy === "discord" ? "Envoi…" : "Envoyer sur Discord"}
        </button>
        <button onClick={download} disabled={busy !== null} className="mdt-press flex items-center gap-[7px] rounded-[9px] bg-accent px-[14px] py-[8px] text-[13px] font-semibold text-accent-contrast hover:brightness-[1.06] disabled:opacity-50">
          <Download className="h-[15px] w-[15px]" /> {busy === "png" ? "Génération…" : "Télécharger (image)"}
        </button>
        <button onClick={onClose} className="flex h-[34px] w-[34px] items-center justify-center rounded-sm border border-border bg-surface-2 text-muted hover:border-border-strong"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex flex-1 justify-center overflow-auto p-6">
        <div className="h-fit shadow-[0_10px_40px_rgba(0,0,0,.3)]">
          <DocSheet title={title} subtitle={subtitle} reference={reference} innerRef={docRef}>
            {children}
          </DocSheet>
        </div>
      </div>
    </div>
  );
}

// Cachet officiel auto-généré : entièrement noir, texte circulaire symétrique, trèfle central.
export function Stamp() {
  const ink = "#0d0d0d";
  return (
    <svg viewBox="0 0 200 200" width="120" height="120" style={{ transform: "rotate(-7deg)", opacity: 0.9 }} aria-label="Cachet officiel">
      <defs>
        {/* Deux arcs de MÊME rayon (86) : le texte reste centré dans la bande entre les deux cercles. */}
        <path id="s13-top" d="M 14,100 A 86,86 0 0 1 186,100" fill="none" />
        <path id="s13-bot" d="M 14,100 A 86,86 0 0 0 186,100" fill="none" />
      </defs>
      <circle cx="100" cy="100" r="95" fill="none" stroke={ink} strokeWidth={2.5} />
      <circle cx="100" cy="100" r="76" fill="none" stroke={ink} strokeWidth={1.5} />
      <text fill={ink} fontSize={15} fontWeight={700} letterSpacing="1.4" dominantBaseline="central" fontFamily="'Inter',sans-serif">
        <textPath href="#s13-top" startOffset="50%" textAnchor="middle">LSPD · STATION 13</textPath>
      </text>
      <text fill={ink} fontSize={13} fontWeight={700} letterSpacing="2" dominantBaseline="central" fontFamily="'Inter',sans-serif">
        <textPath href="#s13-bot" startOffset="50%" textAnchor="middle">SERVICE OFFICIEL</textPath>
      </text>
      <circle cx="14" cy="100" r="2.4" fill={ink} />
      <circle cx="186" cy="100" r="2.4" fill={ink} />
      <image href="/logos/logo-mark.svg" x="67" y="67" width="66" height="66" style={{ filter: "brightness(0)" }} />
    </svg>
  );
}

export function DocBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: "#2E6B2F" }}>{title}</div>
      {children}
    </>
  );
}

export function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9.5px] font-bold uppercase tracking-[0.06em]" style={{ color: "#98a0ab" }}>{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border p-3 text-center" style={{ borderColor: "#e5e8ec" }}>
      <div className="text-[9.5px] font-bold uppercase tracking-[0.06em]" style={{ color: "#98a0ab" }}>{label}</div>
      <div className="mt-1 font-data text-[17px] font-bold">{value}</div>
    </div>
  );
}
