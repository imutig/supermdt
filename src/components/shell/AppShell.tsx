import { Suspense, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useApp } from "@/providers/app-state";
import { LoadingScreen } from "@/components/common/Loader";
import { TopBar } from "./TopBar";
import { FicheBanner } from "./FicheBanner";
import { NavRail } from "./NavRail";
import { PrefsBridge } from "./PrefsBridge";
import { SearchOverlay } from "@/components/search/SearchOverlay";
import { CalcModal } from "@/components/calc/CalcModal";
import { MandatModal } from "@/components/mandat/MandatModal";

export function AppShell() {
  const location = useLocation();
  const { focus, exitFocus } = useApp();
  // La clé sur le pathname remonte le conteneur à chaque navigation -> animation d'apparition de page.
  const routeKey = "/" + (location.pathname.split("/")[1] ?? "");

  // Le mode concentré appartient à la page qui l'a demandé : on en sort en
  // naviguant ailleurs, sinon l'agent se retrouve sans navigation.
  useEffect(() => { exitFocus(); }, [routeKey, exitFocus]);
  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col">
        {!focus && <TopBar />}
        {!focus && <FicheBanner />}
        <div className="flex min-h-0 flex-1">
          {!focus && <NavRail />}
          <main className="min-w-0 flex-1 overflow-y-auto">
            {/* flex-col : permet aux pages "pleine hauteur" (Dispatch) de s'étirer via flex-1,
                sans changer les pages dimensionnées par leur contenu. */}
            <div key={routeKey} className="mdt-page flex min-h-full flex-col">
              <Suspense fallback={<LoadingScreen label="Chargement…" />}>
                <Outlet />
              </Suspense>
            </div>
          </main>
        </div>
      </div>

      <PrefsBridge />

      {/* Surfaces flottantes */}
      <SearchOverlay />
      <CalcModal />
      <MandatModal />
    </div>
  );
}
