import { useEffect, useState } from "react";

// Décompte 3-2-1 avant le départ de l'épreuve. Purement visuel : il tourne côté
// client sur une durée fixe (l'épreuve est à rythme libre, pas besoin d'une
// synchro à la milliseconde). Fixer la fin au montage garantit un vrai 3-2-1,
// sans être rogné par la latence de propagation du départ serveur.
export function Countdown({ seconds = 3, onDone }: { seconds?: number; onDone: () => void }) {
  const [end] = useState(() => Date.now() + seconds * 1000);
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    const id = setInterval(() => {
      const remaining = end - Date.now();
      if (remaining <= 0) {
        clearInterval(id);
        setLeft(0);
        onDone();
      } else {
        setLeft(Math.ceil(remaining / 1000));
      }
    }, 100);
    return () => clearInterval(id);
  }, [end, onDone]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-[18px]" style={{ animation: "mdtFade .2s ease" }}>
      <div className="text-[12px] font-bold uppercase tracking-[0.22em] text-faint">L'épreuve commence</div>
      <div
        key={left}
        className="font-data text-[120px] font-bold leading-none text-accent"
        style={{ animation: "s13Num .5s cubic-bezier(.16,1,.3,1)", textShadow: "0 0 40px color-mix(in srgb, var(--accent) 45%, transparent)" }}
      >
        {left > 0 ? left : "GO"}
      </div>
      <div className="h-[3px] w-[180px] overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent" style={{ width: `${((seconds - Math.min(left, seconds)) / seconds) * 100}%`, transition: "width .3s linear" }} />
      </div>
    </div>
  );
}

// Minuterie compacte « mm:ss » avec bascule d'alerte quand le temps se réduit.
export function useCountdownLabel(endsAt: number | null): { label: string | null; expired: boolean; urgent: boolean } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return { label: null, expired: false, urgent: false };
  const ms = endsAt - now;
  if (ms <= 0) return { label: "00:00", expired: true, urgent: true };
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return { label: `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`, expired: false, urgent: ms < 30000 };
}
