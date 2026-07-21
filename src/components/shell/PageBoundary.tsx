import { Component, type ReactNode } from "react";
import { ShieldAlert } from "lucide-react";

// Filet de sécurité autour du contenu de page.
//
// convex/react relaie les erreurs serveur pendant le rendu : une requête
// refusée par le contrôle de permission faisait tomber toute l'application,
// barre de navigation comprise, laissant un écran noir. La page concernée
// affiche désormais un message et le reste du MDT continue de fonctionner.
//
// Ce filet ne remplace pas les gardes de permission : il évite qu'un oubli,
// aujourd'hui ou plus tard, ne rende le MDT inutilisable.
type Props = { children: ReactNode; resetKey?: string };
type State = { error: Error | null };

export class PageBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    // Changer de page efface l'erreur, sinon elle survivrait à la navigation.
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const denied = /Permission refusée|Non authentifié/i.test(error.message);
    return (
      <div className="p-[22px_26px]">
        <div className="mx-auto max-w-[520px] rounded-card border border-border bg-surface p-8 text-center">
          <ShieldAlert
            className="mx-auto mb-4 h-[34px] w-[34px]"
            style={{ color: denied ? "var(--warning)" : "var(--danger)" }}
          />
          <h2 className="m-0 text-[15px] font-bold">
            {denied ? "Accès non autorisé" : "Cette page n'a pas pu s'afficher"}
          </h2>
          <p className="mt-[8px] mb-0 text-[12.5px] leading-[1.55] text-muted">
            {denied
              ? "Vous n'avez pas les droits nécessaires pour consulter cette section. Demandez-les à l'État-Major si vous pensez qu'il s'agit d'une erreur."
              : "Une erreur est survenue. Le reste du MDT reste utilisable ; vous pouvez changer de page."}
          </p>
        </div>
      </div>
    );
  }
}
