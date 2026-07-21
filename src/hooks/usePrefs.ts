import { useSyncExternalStore } from "react";

// Préférences UI locales (par navigateur), synchronisées entre composants.
export type Prefs = {
  sidebarCollapsible: boolean; // sidebar réduite en icônes
  sidebarHoverExpand: boolean; // ... et se déploie au survol
  dispatchCompact: boolean; // cartes de patrouille resserrées en hauteur
};

const DEFAULTS: Prefs = {
  sidebarCollapsible: false,
  sidebarHoverExpand: true,
  dispatchCompact: false,
};
const KEY = "mdt.prefs";

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

let current = read();
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Le stockage local sert de cache : il évite un clignotement au premier rendu,
// avant que les préférences du compte ne soient remontées par le serveur.
function persistLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* stockage indisponible */
  }
}

// Passerelle vers le serveur, branchée par le shell une fois l'agent connu.
let pushRemote: ((patch: Partial<Prefs>) => void) | null = null;
export function registerPrefsSync(fn: ((patch: Partial<Prefs>) => void) | null) {
  pushRemote = fn;
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  current = { ...current, [key]: value };
  persistLocal();
  listeners.forEach((l) => l());
  // Les préférences appartiennent à l'agent : elles doivent le suivre quel que
  // soit le poste depuis lequel il se connecte.
  pushRemote?.({ [key]: value } as Partial<Prefs>);
}

// Applique les préférences venues du serveur, sans les renvoyer.
export function hydratePrefs(remote: Partial<Prefs> | null | undefined) {
  if (!remote) return;
  const next = { ...current };
  let changed = false;
  for (const k of Object.keys(DEFAULTS) as (keyof Prefs)[]) {
    const v = remote[k];
    if (typeof v === "boolean" && v !== next[k]) { (next[k] as boolean) = v; changed = true; }
  }
  if (!changed) return;
  current = next;
  persistLocal();
  listeners.forEach((l) => l());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, () => current, () => DEFAULTS);
}
