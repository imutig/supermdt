#!/usr/bin/env bash
# ---------------------------------------------------------------------
#  Compilation du règlement intérieur du LSPD
#  Usage :  ./build.sh
# ---------------------------------------------------------------------
set -e
cd "$(dirname "$0")"

if ! command -v xelatex >/dev/null 2>&1; then
  echo "xelatex est introuvable."
  echo "Installez une distribution LaTeX (TeX Live, MacTeX ou MiKTeX),"
  echo "ou utilisez Overleaf : voir LISEZ-MOI.md."
  exit 1
fi

echo "→ Passe 1/3 (contenu)"
xelatex -interaction=nonstopmode reglement.tex > /dev/null || true
echo "→ Passe 2/3 (sommaire et renvois)"
xelatex -interaction=nonstopmode reglement.tex > /dev/null || true
echo "→ Passe 3/3 (pagination définitive)"
xelatex -interaction=nonstopmode reglement.tex > /dev/null

# Nettoyage des fichiers temporaires
rm -f reglement.aux reglement.log reglement.out reglement.toc

if [ -f reglement.pdf ]; then
  echo
  echo "✓ reglement.pdf généré ($(du -h reglement.pdf | cut -f1))."
else
  echo "✗ La compilation a échoué. Relancez sans redirection pour voir l'erreur :"
  echo "  xelatex reglement.tex"
  exit 1
fi
