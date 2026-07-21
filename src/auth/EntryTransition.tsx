import { useEffect, useState } from "react";

const LEAF = "M50,90 C20,62 0,42 0,26 C0,11 12,0 26,0 C38,0 47,9 50,20 C53,9 62,0 74,0 C88,0 100,11 100,26 C100,42 80,62 50,90 Z";
const MIN_MS = 3000; // durée minimale ; l'app charge en dessous pendant ce temps.

// Transition d'entrée cinématique (§ Station 13) : le trèfle s'assemble, l'anneau se
// trace, le "13" apparaît, "STATION 13 · ACCÈS AUTORISÉ", puis un iris révèle l'app.
export function EntryTransition({
  agentName,
  agentMat,
  onDone,
}: {
  agentName: string;
  agentMat: string;
  onDone: () => void;
}) {
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReveal(true), MIN_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!reveal) return;
    const t = setTimeout(onDone, 720); // laisse l'iris se fermer avant de démonter.
    return () => clearTimeout(t);
  }, [reveal, onDone]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{
        background: "var(--bg)",
        clipPath: reveal ? "circle(0% at 50% 42%)" : "circle(150% at 50% 42%)",
        transition: reveal ? "clip-path .72s cubic-bezier(.7,0,.3,1)" : "none",
      }}
    >
      <div className="relative flex flex-col items-center">
        <svg viewBox="0 0 400 400" style={{ width: 210, height: 210, overflow: "visible" }}>
          <g style={{ transformBox: "view-box", transformOrigin: "200px 200px", animation: "s13RingSpin 3.6s linear infinite" }}>
            <circle cx="200" cy="200" r="164" fill="none" stroke="var(--accent)" strokeWidth="3" strokeDasharray="1030" strokeLinecap="round" opacity="0.85" style={{ animation: "s13Ring 1s ease forwards" }} />
            <circle cx="200" cy="36" r="4" fill="var(--accent)" />
          </g>
          {[45, 135, 225, 315].map((deg, i) => (
            <g key={deg} className="s13-leaf" style={{ animationDelay: `${i * 0.12}s` }}>
              <path d={LEAF} transform={`translate(200,190) rotate(${deg}) scale(1.15) translate(-50,-90)`} fill="var(--accent)" />
            </g>
          ))}
          <g className="s13-leaf" style={{ animationDelay: ".3s" }}>
            <path d="M0,58 C-6,100 8,126 28,136" transform="translate(200,190)" fill="none" stroke="var(--accent)" strokeWidth="14" strokeLinecap="round" />
          </g>
          <circle cx="200" cy="190" r="52" fill="var(--accent)" className="s13-leaf" style={{ animationDelay: ".1s" }} />
          <text
            x="201"
            y="192"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="'Times New Roman',Georgia,serif"
            fontSize="74"
            fontWeight="500"
            fill="var(--bg)"
            style={{ fontVariantNumeric: "lining-nums", animation: "s13Num .5s ease .5s both" }}
          >
            13
          </text>
        </svg>

        <div style={{ overflow: "hidden", marginTop: 10 }}>
          <div className="text-[20px] font-extrabold text-text" style={{ animation: "s13Stamp .6s cubic-bezier(.16,1,.3,1) .55s both" }}>
            STATION 13
          </div>
        </div>
        <div className="mt-2 text-[10.5px] font-bold uppercase tracking-[0.22em] text-accent" style={{ animation: "s13Fade .5s ease .9s both" }}>
          Accès autorisé
        </div>
        <div className="mt-[13px] font-data text-[12px] text-muted" style={{ animation: "s13Fade .5s ease 1.05s both" }}>
          {agentName} · {agentMat}
        </div>
      </div>

      <button
        onClick={() => setReveal(true)}
        className="absolute bottom-[26px] right-[28px] rounded-[20px] border border-border bg-surface px-[15px] py-2 text-[12px] font-semibold text-muted hover:border-accent hover:text-text"
        style={{ animation: "s13Fade .5s ease 1.4s both" }}
      >
        Passer →
      </button>
    </div>
  );
}
