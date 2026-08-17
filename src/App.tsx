import { lazyReload } from "@/lib/lazyReload";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { AppStateProvider, useApp } from "@/providers/app-state";
import { useMe } from "@/hooks/useMe";
import { EntryTransition } from "@/auth/EntryTransition";
import { fmtMatricule } from "@/components/common/AgentTag";
import { AppShell } from "@/components/shell/AppShell";
import { RequirePerm } from "@/components/shell/RequirePerm";
import { Dashboard } from "@/pages/Dashboard";
import { Dossier } from "@/pages/Dossier";
import { Effectif } from "@/pages/Effectif";
import { Organigramme } from "@/pages/Organigramme";
import { Admin } from "@/pages/Admin";
import { Protocoles } from "@/pages/Protocoles";
import { Ressources } from "@/pages/Ressources";
const Carte = lazyReload(() => import("@/pages/Carte").then((m) => ({ default: m.Carte })));
import { Calendrier } from "@/pages/Calendrier";
import { Ceremonies } from "@/pages/Ceremonies";
import { Plaintes } from "@/pages/Plaintes";
import { Armes } from "@/pages/Armes";
import { Calls911 } from "@/pages/Calls911";
import { Vehicules } from "@/pages/Vehicules";
import { Saisies } from "@/pages/Saisies";
import { Dispatch } from "@/pages/Dispatch";
import { Absences } from "@/pages/Absences";
import { Discipline } from "@/pages/Discipline";
import { Services } from "@/pages/Services";
import { CodePenal } from "@/pages/CodePenal";
import { Reglement } from "@/pages/Reglement";
import { MandatsPage } from "@/pages/MandatsPage";
import { Rapports } from "@/pages/Rapports";
const RapportEditor = lazyReload(() => import("@/pages/RapportEditor").then((m) => ({ default: m.RapportEditor })));
import { Contraventions } from "@/pages/Contraventions";
import { Archive } from "@/pages/Archive";
import { DivisionSpace } from "@/pages/DivisionSpace";
const Configuration = lazyReload(() => import("@/pages/Configuration").then((m) => ({ default: m.Configuration })));
const Statistiques = lazyReload(() => import("@/pages/Statistiques").then((m) => ({ default: m.Statistiques })));
const UsageAnalytics = lazyReload(() => import("@/pages/UsageAnalytics").then((m) => ({ default: m.UsageAnalytics })));
const Synchronisation = lazyReload(() => import("@/pages/Synchronisation").then((m) => ({ default: m.Synchronisation })));
import { Profil } from "@/pages/Profil";
import { LoginPage } from "@/auth/LoginPage";
import { JoinPage } from "@/auth/JoinPage";
import { DialogsProvider } from "@/components/detective/dialogs";
import { PermPreviewProvider } from "@/providers/perm-preview";
import { Onboarding } from "@/auth/Onboarding";
import { PendingScreen } from "@/auth/PendingScreen";
import { ChangePasswordScreen } from "@/auth/ChangePasswordScreen";
import { PortalEntry } from "@/portal/PortalEntry";
import { PortalProvider, usePortal } from "@/portal/portal-context";
import { LspaShell } from "@/lspa/LspaShell";
import { LspaDashboard } from "@/lspa/LspaDashboard";
import { LspaCadetHome } from "@/lspa/LspaCadetHome";
import { LspaEffectif } from "@/lspa/LspaEffectif";
import { LspaProfil } from "@/lspa/LspaProfil";
import { LspaHistory } from "@/lspa/LspaHistory";
import { LspaPromotions, LspaPromotion } from "@/lspa/LspaPromotions";
import { LspaTicketArchives } from "@/lspa/LspaTicketArchives";
import { LspaEntretiens } from "@/lspa/LspaEntretiens";
import { LspaFto } from "@/lspa/LspaFto";
import { FtoSheet } from "@/lspa/FtoSheet";
import { LspaFirstLincoln } from "@/lspa/LspaFirstLincoln";
import { FlDossier } from "@/lspa/FlDossier";
import { LspaQuiz } from "@/lspa/LspaQuiz";
const QuizEditor = lazyReload(() => import("@/lspa/QuizEditor").then((m) => ({ default: m.QuizEditor })));
const SessionScreen = lazyReload(() => import("@/lspa/session/SessionScreen").then((m) => ({ default: m.SessionScreen })));
import { usePortals } from "@/hooks/usePortals";
import { useCan } from "@/hooks/useCan";
import { Splash } from "@/auth/Splash";
import { MDT_ENABLED, FEATURES } from "@/lib/features";

export default function App() {
  return (
    <AppStateProvider>
      <PortalProvider>
        <Root />
      </PortalProvider>
    </AppStateProvider>
  );
}

// Le choix du portail précède la connexion : c'est le premier écran du site.
// Tant qu'aucune surface n'est retenue, on n'affiche ni le MDT ni la LSPA.
function Root() {
  const { portal, ready } = usePortal();
  const location = useLocation();
  // Lien d'invitation « Rejoindre » : page dédiée, accessible avant tout choix
  // de portail et sans connexion. Elle gère elle-même l'inscription puis l'entrée.
  if (location.pathname.startsWith("/rejoindre/")) {
    return (
      <Routes>
        <Route path="/rejoindre/:code" element={<JoinPage />} />
      </Routes>
    );
  }
  if (!ready) return <Splash />;
  if (!portal) return <PortalEntry />;
  return (
    <>
      <AuthLoading>
        <Splash />
      </AuthLoading>
      <Unauthenticated>
        <LoginPage />
      </Unauthenticated>
      <Authenticated>
        <Gated />
      </Authenticated>
    </>
  );
}

// Écran de bascule, une fois connecté. Il réutilise l'écran d'entrée et se
// contente d'y ajouter la navigation vers la surface retenue.
function PortalSwitch({ canMdt }: { canMdt: boolean }) {
  const navigate = useNavigate();
  return (
    <PortalEntry
      mdtDenied={!canMdt}
      onChosen={(p) => navigate(p === "lspa" ? "/lspa" : "/", { replace: true })}
    />
  );
}

// Accueil du portail académie : tableau de bord de l'encadrement, accueil
// personnel pour les cadets, ou redirection vers la formation terrain pour les
// agents extérieurs à la Police Academy.
function LspaHome() {
  const { can, ready } = useCan();
  const me = useMe();
  if (!ready || me === undefined) return <Splash />;
  if (!can("lspa.view")) return <Navigate to="/lspa/fto" replace />;
  return me?.grade?.academyOnly ? <LspaCadetHome /> : <LspaDashboard />;
}

function Gated() {
  const me = useMe();
  const location = useLocation();
  const { canMdt, academyBlocked, ready: portalsReady } = usePortals();
  const { portal } = usePortal();
  const { entryPending, endEntry } = useApp();
  if (me === undefined) return <Splash />;
  if (me === null) return <Onboarding />;

  const status = me.agent.status;
  if (status === "PENDING") return <PendingScreen />;
  if (status === "INACTIVE" || status === "SUSPENDED")
    return <PendingScreen suspended until={me.agent.suspendedUntil ?? null} reason={me.agent.suspendedReason ?? null} />;
  // Mot de passe temporaire : aucun accès au MDT tant qu'il n'est pas remplacé.
  if (me.agent.mustChangePassword) return <ChangePasswordScreen />;
  // Cadet écarté de sa promo : plus d'accès tant qu'il n'est pas réintégré.
  if (portalsReady && academyBlocked) return <PendingScreen academy />;

  // Un cadet n'a pas accès au MDT : toute route hors académie le renvoie sur
  // son portail, plutôt que de lui refuser page après page. Quand le MDT est
  // désactivé, l'écran de bascule /portail n'existe plus non plus.
  const inLspa = location.pathname.startsWith("/lspa") || (MDT_ENABLED && location.pathname === "/portail");
  if (portalsReady && !canMdt && !inLspa) return <Navigate to="/lspa" replace />;
  // Le portail retenu à l'entrée fixe la surface : on ne bascule que par
  // l'écran de choix, jamais par une URL laissée dans l'historique. MDT coupé =
  // LSPA imposée pour tout le monde.
  if ((!MDT_ENABLED || portal === "lspa") && !inLspa) return <Navigate to="/lspa" replace />;

  return (
    <PermPreviewProvider>
    <DialogsProvider>
      {entryPending && (
        <EntryTransition
          agentName={`${me.agent.prenomRP.charAt(0)}. ${me.agent.nomRP}`}
          agentMat={fmtMatricule(me.agent.matricule) ?? "#--"}
          onDone={endEntry}
        />
      )}
    <Routes>
      {/* Bascule entre les deux surfaces, hors de toute enveloppe. C'est le même
          écran qu'à l'entrée du site : le choix reste mémorisé. */}
      <Route path="/portail" element={<PortalSwitch canMdt={canMdt} />} />

      {/* Portail de l'académie. Ouvert à tout agent : ceux qui ne sont pas de la
          Police Academy n'y voient que la formation terrain (Officiers 1). */}
      <Route path="/lspa" element={<LspaShell />}>
        <Route index element={<LspaHome />} />
        <Route path="effectif" element={<RequirePerm perm="lspa.effectif.view"><LspaEffectif /></RequirePerm>} />
        <Route path="promotions" element={<RequirePerm perm="lspa.effectif.view"><LspaPromotions /></RequirePerm>} />
        <Route path="promotions/:id" element={<RequirePerm perm="lspa.effectif.view"><LspaPromotion /></RequirePerm>} />
        <Route path="candidatures" element={<RequirePerm perm="lspa.effectif.view"><LspaTicketArchives /></RequirePerm>} />
        <Route path="entretiens" element={<LspaEntretiens />} />
        <Route path="fto" element={<LspaFto />} />
        <Route path="fto/:id" element={<FtoSheet />} />
        <Route path="first-lincoln" element={<LspaFirstLincoln />} />
        <Route path="first-lincoln/:id" element={<FlDossier />} />
        <Route path="quiz" element={<RequirePerm perm="lspa.view"><LspaQuiz /></RequirePerm>} />
        <Route path="quiz/:id" element={<RequirePerm perm="lspa.quiz.view"><QuizEditor /></RequirePerm>} />
        <Route path="historique" element={<RequirePerm perm="lspa.session.manage"><LspaHistory /></RequirePerm>} />
        <Route path="session/:id" element={<SessionScreen />} />
        {/* Profil propre à l'académie (identité + préférences, sans le contenu
            opérationnel du MDT). L'administration, elle, est bien la même. */}
        <Route path="profil" element={<LspaProfil />} />
        <Route path="admin" element={<RequirePerm perm="effectif.validate"><Admin /></RequirePerm>} />
        <Route path="*" element={<Navigate to="/lspa" replace />} />
      </Route>

      <Route element={<AppShell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/profil" element={<Profil />} />
        <Route path="/citoyen/:id" element={<RequirePerm perm="citoyens.view"><Dossier /></RequirePerm>} />
        <Route path="/effectif" element={<RequirePerm perm="effectif.view"><Effectif /></RequirePerm>} />
        <Route path="/organigramme" element={<RequirePerm perm="effectif.view"><Organigramme /></RequirePerm>} />
        <Route path="/protocoles" element={<RequirePerm perm="protocoles.view"><Protocoles /></RequirePerm>} />
        <Route path="/ressources" element={<RequirePerm perm="formations.view"><Ressources /></RequirePerm>} />
        <Route path="/carte" element={<Carte />} />
        <Route path="/calendrier" element={<RequirePerm perm="calendrier.view"><Calendrier /></RequirePerm>} />
        <Route path="/ceremonies" element={<RequirePerm perm="ceremonies.manage"><Ceremonies /></RequirePerm>} />
        {FEATURES.plaintes && <Route path="/plaintes" element={<RequirePerm perm="plaintes.view"><Plaintes /></RequirePerm>} />}
        <Route path="/armes" element={<RequirePerm perm="armes.view"><Armes /></RequirePerm>} />
        <Route path="/vehicules" element={<RequirePerm perm={["vehicules.view", "flotte.view"]}><Vehicules /></RequirePerm>} />
        <Route path="/saisies" element={<RequirePerm perm="saisies.view"><Saisies /></RequirePerm>} />
        <Route path="/dispatch" element={FEATURES.dispatch ? <RequirePerm perm="dispatch.view"><Dispatch /></RequirePerm> : <Navigate to="/" replace />} />
        <Route path="/911" element={<RequirePerm perm={["n911.view", "n911.operate"]}><Calls911 /></RequirePerm>} />
        <Route path="/absences" element={<RequirePerm perm="absences.request"><Absences /></RequirePerm>} />
        <Route path="/discipline" element={<RequirePerm perm="discipline.view"><Discipline /></RequirePerm>} />
        <Route path="/services" element={FEATURES.service ? <RequirePerm perm="service.self"><Services /></RequirePerm> : <Navigate to="/" replace />} />
        <Route path="/codepenal" element={<RequirePerm perm="codepenal.view"><CodePenal /></RequirePerm>} />
        <Route path="/reglement" element={<Reglement />} />
        <Route path="/mandats" element={<RequirePerm perm="mandats.view"><MandatsPage /></RequirePerm>} />
        <Route path="/rapports" element={<RequirePerm perm="rapports.view"><Rapports /></RequirePerm>} />
        <Route path="/rapport/:id" element={<RequirePerm perm="rapports.view"><RapportEditor /></RequirePerm>} />
        <Route path="/contraventions" element={<RequirePerm perm="contraventions.view"><Contraventions /></RequirePerm>} />
        <Route path="/archive" element={<RequirePerm perm="archive.view"><Archive /></RequirePerm>} />
        <Route path="/division/:id" element={<DivisionSpace />} />
        <Route path="/statistiques" element={<RequirePerm perm="stats.view"><Statistiques /></RequirePerm>} />
        <Route path="/analytics" element={<RequirePerm perm="audit.view"><UsageAnalytics /></RequirePerm>} />
        <Route path="/config" element={<RequirePerm perm="rbac.manage"><Configuration /></RequirePerm>} />
        <Route path="/synchronisation" element={<RequirePerm perm="rbac.manage"><Synchronisation /></RequirePerm>} />
        <Route path="/admin" element={<RequirePerm perm="effectif.validate"><Admin /></RequirePerm>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </DialogsProvider>
    </PermPreviewProvider>
  );
}
