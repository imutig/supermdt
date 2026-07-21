import { useCallback, useEffect, useRef, useState } from "react";

// Glisser-déposer bâti sur les événements pointeur.
//
// L'API HTML5 (draggable / dragstart / drop) n'est pas implémentée dans le
// navigateur embarqué des tablettes in-game (CEF) : le curseur affiche un
// panneau d'interdiction et rien ne se déplace. Les événements pointeur, eux,
// fonctionnent partout - souris, tactile, CEF - et couvrent donc aussi bien le
// poste de bureau que la tablette, avec un seul code.
//
// Les cibles se déclarent par attribut de données, ce qui évite d'entretenir
// un registre : on retrouve la cible sous le pointeur avec elementFromPoint.

export type DragPayload = { type: string; id: string };

// Seuil avant de considérer que l'intention est un glissement et non un clic.
const THRESHOLD = 6;

export type DropTarget = { kind: string; key: string } | null;

export function usePointerDrag(onDrop: (payload: DragPayload, target: DropTarget) => void) {
  const [drag, setDrag] = useState<DragPayload | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [target, setTarget] = useState<DropTarget>(null);

  // Refs : les gestionnaires globaux sont installés une fois et doivent lire
  // l'état courant sans être réinstallés à chaque déplacement.
  const pending = useRef<{ payload: DragPayload; x: number; y: number } | null>(null);
  // Largeur de l'élément saisi : le fantôme la reprend pour garder la même
  // mise en page. Son centrage, lui, est laissé au navigateur.
  const [grab, setGrab] = useState<{ width: number } | null>(null);
  const grabRef = useRef<{ width: number } | null>(null);
  const active = useRef(false);
  const targetRef = useRef<DropTarget>(null);
  // Un glissement se termine par un pointerup, immédiatement suivi d'un click :
  // sans ce garde, lâcher une patrouille ouvrirait aussi son détail.
  const justDragged = useRef(0);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  const resolveTarget = (x: number, y: number): DropTarget => {
    const el = document.elementFromPoint(x, y);
    const hit = el?.closest<HTMLElement>("[data-drop-kind]");
    if (!hit) return null;
    return { kind: hit.dataset.dropKind ?? "", key: hit.dataset.dropKey ?? "" };
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      if (!active.current) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < THRESHOLD) return;
        active.current = true;
        setDrag(p.payload);
        setGrab(grabRef.current);
        // Empêche la sélection de texte pendant le glissement.
        document.body.style.userSelect = "none";
      }
      e.preventDefault();
      setPos({ x: e.clientX, y: e.clientY });
      const t = resolveTarget(e.clientX, e.clientY);
      targetRef.current = t;
      setTarget(t);
    };

    const end = () => {
      const p = pending.current;
      pending.current = null;
      if (active.current && p) {
        dropRef.current(p.payload, targetRef.current);
        justDragged.current = Date.now();
      }
      active.current = false;
      targetRef.current = null;
      document.body.style.userSelect = "";
      setDrag(null);
      setPos(null);
      setTarget(null);
      setGrab(null);
      grabRef.current = null;
    };

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      document.body.style.userSelect = "";
    };
  }, []);

  // À poser sur l'élément déplaçable.
  const dragHandle = useCallback(
    (payload: DragPayload) => ({
      onPointerDown: (e: React.PointerEvent) => {
        // Bouton principal uniquement : le clic droit garde son rôle.
        if (e.button !== 0) return;
        const r = e.currentTarget.getBoundingClientRect();
        grabRef.current = { width: r.width };
        pending.current = { payload, x: e.clientX, y: e.clientY };
      },
      // `touch-action: none` est indispensable : sans lui le navigateur
      // interprète le geste comme un défilement et avale les événements.
      style: { touchAction: "none" as const },
    }),
    [],
  );

  // Vrai si un glissement a effectivement commencé : sert à distinguer un clic
  // d'un dépôt au moment du relâchement.
  const isDragging = drag !== null;
  const didJustDrag = useCallback(() => Date.now() - justDragged.current < 250, []);

  return { drag, pos, grab, target, isDragging, dragHandle, didJustDrag };
}

// Attributs à poser sur une zone de dépôt.
export function dropZone(kind: string, key: string) {
  return { "data-drop-kind": kind, "data-drop-key": key } as Record<string, string>;
}
