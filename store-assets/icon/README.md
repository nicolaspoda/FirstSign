# Icône App Store — FirstSign

Icône 1024x1024px à exporter depuis le design SVG validé
(fond vert #1D9E75, onde de signal blanche stylisée).
À placer ici sous le nom `icon-1024.png` avant le build EAS.

## Spécifications App Store

- Taille : 1024 × 1024 px
- Format : PNG (sans couche alpha)
- Colorimétrie : sRGB
- Pas de coins arrondis (Apple les applique automatiquement)

## Utilisation EAS

Une fois `icon-1024.png` placé dans ce dossier, référencer le fichier
dans `app.json` → `"icon": "./store-assets/icon/icon-1024.png"`
puis relancer `eas build --platform ios --profile production`.
