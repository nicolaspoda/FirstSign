# CONTEXT.md — BurnoutApp

> Document de contexte pour reprendre le développement dans une nouvelle session
> (Claude Code ou claude.ai). Mis à jour le 2026-06-11.

---

## 1. Idée de l'app / positionnement

**Tagline** : *« Détectez les signes avant-coureurs du burnout avant qu'il ne soit trop tard »*

**BurnoutApp** est une application mobile (iOS/Android/Web via Expo) de **prévention et
détection précoce du burnout professionnel**, positionnée comme un outil
d'auto-évaluation et d'accompagnement quotidien — pas un dispositif médical, pas un
substitut à un professionnel de santé.

**Proposition de valeur :**
- Un **diagnostic standardisé et reconnu** (CBI — Copenhagen Burnout Inventory,
  19 questions), un outil scientifique validé et libre de droits pour évaluer
  l'épuisement professionnel sur 3 dimensions.
- Un **suivi hebdomadaire léger** (check-in en 4 curseurs : énergie, motivation, stress,
  équilibre pro-perso) qui transforme un diagnostic ponctuel en suivi de tendance dans
  le temps, avec alerte automatique en cas de dégradation.
- Un **plan d'action personnalisé sur 8 semaines**, généré selon le niveau de risque
  (faible/modéré/élevé/critique) et le profil dominant (épuisement / cynisme /
  perte d'efficacité).
- Une **bibliothèque d'exercices guidés** (respiration, pleine conscience,
  restructuration cognitive) avec minuteur.
- Un **compagnon IA conversationnel** (Gemini) qui connaît le profil de l'utilisateur
  et peut discuter de son état, avec un disclaimer clair sur ses limites.

**Niche** : burnout professionnel spécifiquement (pas bien-être généraliste, pas santé
mentale au sens large) — public visé : salariés/cadres en questionnement sur leur état
d'épuisement professionnel, recherchant un premier diagnostic actionnable sans rendez-vous.

**Modèle économique** : freemium.
- **Gratuit** : diagnostic CBI complet + dashboard + check-in hebdo + historique limité
  (2 dernières semaines) + 3 messages IA/mois.
- **Premium** (abonnement via RevenueCat — 7,99€/mois ou 59,99€/an) : plan d'action
  8 semaines, historique illimité, IA illimitée, bibliothèque d'exercices.
- **B2B** (phase 3, voir section 5) : 4-8€/employé/mois, vendu aux RH — dashboard
  agrégé et anonymisé pour les équipes.

**Concurrent principal** : BurnoutGuard (4,99$/mois) — un tracker simple, sans
questionnaire scientifique (MBI/CBI) ni programme structuré. Avantage BurnoutApp :
CBI scientifique + programme 8 semaines + IA personnalisée.

**Évaluation actuelle** : ~6,5/10 en tant que produit commercial — voir section 5
pour la roadmap détaillée vers 9/10.

---

## 2. Décisions produit importantes déjà prises

- **MBI → CBI** : le Maslach Burnout Inventory (payant) a été remplacé par le
  Copenhagen Burnout Inventory, libre de droits et scientifiquement validé.
- **Gemini 2.5 Flash plutôt qu'un modèle Anthropic** pour le compagnon IA — choix
  motivé par la gratuité de l'API Gemini.
- **Android avant iOS** pour le lancement : compte développeur Google (25$, unique)
  vs compte développeur Apple (99$/an) — cf. section 5, point 11. iOS sera abordé
  une fois que l'app génère des revenus.
- **CBI sans dimension « clients »** : la dimension « épuisement lié aux clients » du
  CBI original a été remplacée par « personnes avec qui on travaille » (collègues,
  managers, etc.), plus pertinente pour un public salarié au sens large (cf. section
  4.2 / `lib/burnout.ts` pour le détail des 19 questions).

---

## 3. Stack technique complète

### Frontend
- **Expo SDK 54** (`expo: "54"`) — ⚠️ voir AGENTS.md, ne jamais bumper sans vérifier
  la version supportée par Expo Go (`https://exp.host/--/api/v2/versions`)
- **Expo Router ~6.0.24** — routing fichiers, route groups : `(auth)`, `(onboarding)`, `(tabs)`
- **React 19.1.0** / **React Native 0.81.5**
- **react-native-reanimated ~4.1.1** + **react-native-worklets** — animations (jauges,
  transitions de cartes, indicateur de frappe, etc.)
- **react-native-screens**, **react-native-safe-area-context**
- **@expo/vector-icons** (Ionicons)
- **@react-native-community/netinfo** — bandeau "hors ligne"
- **@react-native-async-storage/async-storage** — cache local (dashboard, réponses
  d'assessment en attente)
- **expo-notifications** — rappel hebdomadaire de check-in
- **expo-secure-store**, **expo-constants**, **expo-font**, **expo-splash-screen**,
  **expo-status-bar**, **expo-linking**
- **TypeScript ~5.9.2**

### Backend
- **Supabase** (Postgres + Auth + Edge Functions Deno + Row Level Security)
  - `@supabase/supabase-js ^2.108.1`
  - 1 migration : `supabase/migrations/20260602000001_initial_schema.sql`
  - 4 Edge Functions : `calculate-burnout-score`, `generate-action-plan`, `ai-companion`,
    `delete-account`
- **Gemini 2.5 Flash** (API Google) — moteur du compagnon IA, appelé depuis
  l'edge function `ai-companion` (`thinkingBudget: 0`, `maxOutputTokens: 1024`)

### Paiements
- **react-native-purchases ^10.2.2** (RevenueCat) — natif uniquement.
  Fallback sur `profiles.subscription_tier` (lecture DB) en web et en Expo Go,
  car RevenueCat nécessite un development build.

### Config Expo notable (`app.json`)
- `scheme: "burnout-app"`, bundle id `com.burnoutapp` (iOS/Android)
- EAS project id configuré (`extra.eas.projectId`)
- Couleur de marque : `#1D9E75` (splash screen, icône adaptive Android)
- Pas de champ `description` actuellement (à ajouter, cf. section 5, point 1)

### Config EAS (`eas.json`)
- Profils `development` (dev client iOS simulator), `preview` (Android APK interne),
  `production` (Android app-bundle, `autoIncrement`)
- `submit.production.android` référence `./google-service-account.json` —
  **fichier absent du repo** (à fournir avant `eas submit`, cf. section 5, point 11)

---

## 4. Fonctionnalités implémentées

### 4.1 Authentification (`lib/auth.ts`, `hooks/useAuth.ts`, `app/(auth)/*`)
- Inscription email/mot de passe avec écran "vérifiez votre email" (gestion du cas
  `identities.length === 0` = compte déjà existant, message anti-énumération)
- Connexion, déconnexion (confirmation à 2 étapes)
- Mot de passe oublié → email de reset
- Messages d'erreur Supabase traduits en français (`getAuthErrorMessage`)
- Trigger Postgres `handle_new_user()` : crée automatiquement une ligne `profiles`
  (tier `free`) à l'inscription
- Guard de session global dans `app/_layout.tsx` (redirections selon session +
  existence d'un assessment)

**Statut : 100% fonctionnel.**

### 4.2 Diagnostic CBI (onboarding) (`app/(onboarding)/*`, `lib/burnout.ts`,
`supabase/functions/calculate-burnout-score`)
- Questionnaire **Copenhagen Burnout Inventory (CBI), 19 questions**, réponses sur
  5 boutons textuels (échelle "fréquence" ou "intensité" selon la question, valeurs
  0/25/50/75/100), 3 dimensions : Épuisement personnel (6 questions), Épuisement
  professionnel (7 questions, dont `work_7` inversée avant calcul), Épuisement
  relationnel (6 questions)
- Ordre d'affichage **mixé** entre les 3 dimensions (recommandation officielle CBI
  pour limiter les biais de réponse) ; sauvegarde automatique des réponses en cours
  via AsyncStorage (`pending_assessment_answers`) pour reprendre le questionnaire
  après une fermeture
- UI animée (slide entre questions, barre de progression sur 19 questions, badges
  colorés par dimension)
- Calcul des scores **côté serveur** (edge function `calculate-burnout-score`) :
  score par dimension = moyenne des réponses (0-100), score global = moyenne des
  3 dimensions ; seuils CBI pour le `risk_level` : 0-49 low, 50-74 medium,
  75-89 high, 90+ critical
- Écran de résultats (`results.tsx`) : jauges animées par dimension (toutes /100),
  description textuelle par dimension et par niveau de risque, comparaison avec
  le diagnostic précédent (deltas, flèches d'évolution), planification du rappel
  hebdomadaire, invalidation du cache dashboard, mention CBI en bas de page
- `plan-preview.tsx` : aperçu des 3 premières actions de la semaine 1 après génération
  du plan
- `welcome.tsx` contient déjà l'accroche "Détectez votre burnout avant qu'il soit trop
  tard" — proche de la tagline officielle mais à harmoniser (cf. section 5, point 1)
- `context.tsx` : écran d'onboarding enrichi affiché **uniquement après le tout premier
  diagnostic** (pas de diagnostic précédent) **et** si le contexte n'a pas encore été
  renseigné (`profiles.sector`, `remote_work`, `main_stress_source` tous `NULL`).
  4 questions à choix unique (secteur d'activité, télétravail, rôle, principale source
  de stress), bouton "Continuer" désactivé tant que les 4 ne sont pas répondues, lien
  "Passer" qui enregistre `NULL` partout. Dans les deux cas, enchaîne ensuite sur la
  génération du plan d'action (`generateActionPlan` + `plan-preview`), exactement comme
  le CTA "Créer mon plan d'action" de `results.tsx`.

**Statut : 100% fonctionnel.** Tier : **gratuit**.

### 4.3 Dashboard (`app/(tabs)/index.tsx`, `hooks/useBurnoutData.ts`)
- Score global /100 + badge de risque coloré
- Badge de tendance (amélioration/stable/déclin) via `detectTrend()`
- Bandeau d'alerte rouge si `shouldAlert()` détecte 3 check-ins en chute monotone
  (drop total ≥ 2 points)
- Graphique en barres : évolution du score de bien-être sur 4 semaines
- Formulaire de check-in hebdomadaire (4 steppers 1-10 : énergie, motivation, stress,
  équilibre), upsert avec contrainte unique `(user_id, week_number, year)`
- Cache AsyncStorage 5 min (`useBurnoutData`) avec affichage immédiat puis sync
- États vides (pas encore de diagnostic) gérés

**Statut : 100% fonctionnel.** Tier : **gratuit + premium** (identique pour les deux).

### 4.4 Historique (`app/(tabs)/history.tsx`)
- Liste des check-ins (date, semaine ISO, score de bien-être, mini-barres par métrique)
- **Gratuit : 2 derniers check-ins seulement** (`FREE_LIMIT = 2`)
- **Premium : historique illimité**, bloc d'upsell pour les utilisateurs gratuits

**Statut : 100% fonctionnel.**

### 4.5 Plan d'action 8 semaines (`app/(tabs)/plan.tsx`, `lib/planProgress.ts`,
`supabase/functions/generate-action-plan`)
- Génération d'un programme **8 semaines × 3 actions** via **Gemini 2.5 Flash**
  (`responseMimeType: 'application/json'` + `responseSchema`), à partir du profil
  CBI complet (3 dimensions + `risk_level`), du contexte utilisateur (secteur,
  télétravail, rôle de manager, source de stress principale) et de la tendance des
  4 derniers check-ins. Prompt système en français, règles de progressivité
  (semaine 1 simple → semaine 8 avancée), adaptation selon le niveau de risque
  (critical/high → récupération immédiate semaines 1-2 ; medium/low → prévention),
  actions dédiées délégation/management si manager, et déconnexion/rituels si
  full remote
- Réponse Gemini parsée et validée (8 semaines × 3 actions avec `title`,
  `description`, `duration`, `category`) ; en cas d'erreur de parsing/validation ou
  d'échec de l'appel Gemini, **fallback automatique** sur les 4 jeux de templates
  statiques historiques (critical/high/medium/low), pour ne jamais casser le flow
- Vérification serveur du tier premium (`profiles.subscription_tier === 'premium'`),
  comme dans `ai-companion` : sinon `403 PREMIUM_REQUIRED`, géré côté client par
  `lib/api.ts` (`generateActionPlan`) et affiché via `PaywallModal` dans
  `results.tsx`, `context.tsx` et `plan.tsx`
- Suivi de progression : % global, semaine en cours, **streaks** (semaine = "réussie"
  si toutes les actions sont cochées ET un check-in existe dans la fenêtre de la
  semaine), meilleure streak
- Actions cochables, persistées dans `action_plans.completed_actions`
- États : pas de diagnostic / diagnostic sans plan / plan actif / plan terminé
  (avec CTA "Refaire")
- Lien vers la bibliothèque d'exercices (premium)

**Statut : 100% fonctionnel.** Tier : **premium** (gating client ET serveur).

### 4.6 Bibliothèque d'exercices (`app/exercises.tsx`, `lib/exercises.ts`)
- 14 exercices (5 respiration, 5 pleine conscience, 5 restructuration cognitive 
  — vérifier le compte exact dans `lib/exercises.ts`), chacun avec instructions
  détaillées en français, niveau (débutant/intermédiaire/avancé), durée
- Modal plein écran avec minuteur fonctionnel (play/pause/reset)
- Écran verrouillé + paywall si non premium

**Statut : 100% fonctionnel.** Tier : **premium**.

### 4.7 Compagnon IA (`app/(tabs)/chat.tsx`, `supabase/functions/ai-companion`)
- Chat avec rendu enrichi (gras, listes), indicateur de frappe animé
- Prompt système personnalisé avec les scores du dernier diagnostic
- Appel **Gemini 2.5 Flash**, gestion des erreurs 429/503 (`SERVICE_UNAVAILABLE`)
- Historique de conversation sauvegardé (`ai_conversations`)
- Limite **3 conversations/mois** pour les utilisateurs gratuits — **vérifiée
  côté serveur ET client** (la seule des 3 edge functions à le faire correctement)
- Disclaimer "ne remplace pas un professionnel de santé"
- Utilise le **dernier diagnostic CBI** + les **12 dernières semaines de check-ins**
  comme contexte, avec analyse des tendances (énergie, stress, motivation, semaines
  consécutives en dégradation) — l'IA peut commenter proactivement les évolutions
- Utilise aussi le **contexte utilisateur** collecté à l'onboarding enrichi (secteur,
  télétravail, rôle de manager, principale source de stress, cf. section 4.2 et
  schéma de base de données) lorsqu'il est renseigné

**Statut : 100% fonctionnel.** Tier : **gratuit (3/mois) + premium (illimité)**.

### 4.8 Abonnement / Paywall (`lib/subscription.ts`, `components/PaywallModal.tsx`)
- `checkSubscription()` : RevenueCat sur natif (entitlement `premium`),
  fallback DB (`profiles.subscription_tier`) sur web/Expo Go
- `canAccess(feature)` basé sur `FEATURES_BY_TIER`
- `PaywallModal` : présentation des bénéfices, achat annuel (59,99€, badge -33%) ou
  mensuel (7,99€) — **pas de bouton "Restaurer mes achats"** (cf. section 5, point 10)

**Statut : partiel** — logique de détection plateforme/fallback complète, mais achats
RevenueCat réels non testables sans development build + clé API configurée
(`EXPO_PUBLIC_REVENUECAT_KEY` non renseignée).
Incohérence mineure : les features `checkin_2weeks`/`ai_3messages` sont définies mais
jamais vérifiées via `canAccess` (limites codées en dur ailleurs) — cf. section 5,
"Nettoyage mineur".

### 4.9 Profil (`app/(tabs)/profile.tsx`)
- Avatar (initiales), badge de tier, carte d'upgrade si gratuit
- Liste des fonctionnalités par tier
- Déconnexion (confirmation 2 étapes)
- Lien "Mode dev" (visible seulement en `__DEV__`)
- Liens légaux CGU/confidentialité → **placeholders `#` non fonctionnels**
- "Version 1.0.0"
- **Bouton "Supprimer mon compte"** (texte rouge, sous un séparateur après les liens
  légaux) : confirmation cross-platform (web: `window.confirm`, natif: `Alert.alert`),
  appelle l'edge function `delete-account` (JWT vérifié côté serveur), affiche un
  spinner pendant la suppression, redirige vers `/(auth)/login` après succès.
  Fonction client `deleteAccount()` dans `lib/auth.ts`.
  Edge function : `supabase/functions/delete-account/index.ts` — suppression dans
  l'ordre : `ai_conversations` → `action_plans` → `checkins` → `assessments` →
  `profiles` → `auth.users` (`admin.deleteUser`).

**Statut : partiel** — voir section 5, point 7 (CGU/confidentialité manquantes).
Suppression de compte : **100% fonctionnel**.

### 4.10 Notifications (`lib/notifications.ts`)
- Rappel hebdomadaire (lundi 9h) "Faites votre check-in burnout de la semaine"
- No-op propre sur web

**Statut : 100% fonctionnel** sur natif. Tier : gratuit + premium.

### 4.11 Outils de développement (`app/dev-tools.tsx`)
- Visible uniquement si `__DEV__` (strippé en prod par Metro)
- Simuler 4 semaines de check-ins (tendance croissante)
- Simuler une dégradation (déclenche l'alerte)
- Créer un 2e diagnostic (risque critique)
- Basculer premium/free
- Supprimer les données de test / reset complet (DB + cache)

**Statut : 100% fonctionnel.**

### 4.12 Layout / navigation globale (`app/_layout.tsx`, `app/(tabs)/_layout.tsx`)
- Bandeau hors-ligne (NetInfo)
- Tabs : Accueil, Historique, Plan, Chat, Profil
- Guard de session + redirections (auth ↔ onboarding ↔ tabs)

**Statut : 100% fonctionnel.**

---

## 5. Roadmap vers le 9/10

### Phase 1 — Rapide (quelques jours, 100% gratuit) → objectif 7,5/10

- [x] **1. Repositionnement messaging**
  Faire passer tous les textes de l'app de "mesurer ton burnout" vers "détecter les
  signes avant-coureurs" (tagline officielle, cf. section 1).
  Fichiers concernés : `app/(onboarding)/welcome.tsx` (déjà proche, à harmoniser),
  `app/(onboarding)/results.tsx`, `app/(tabs)/profile.tsx`, `app.json` (ajouter un
  champ `description`, actuellement absent), et tous les textes UI pertinents.

- [x] **2. IA avec historique complet**
  Modifier `supabase/functions/ai-companion/index.ts` pour injecter les 12 dernières
  semaines de check-ins (table `checkins`) dans le contexte envoyé à Gemini, en plus
  du dernier diagnostic CBI déjà utilisé. Exemple de ce que l'IA pourra dire :
  "Je vois que ton énergie baisse depuis 3 semaines consécutives."

- [x] **3. Suppression du compte**
  Bouton "Supprimer mon compte" dans `app/(tabs)/profile.tsx`. Doit supprimer toutes
  les données Supabase de l'utilisateur (`profiles`, `assessments`, `checkins`,
  `action_plans`, `ai_conversations`) puis le compte `auth.users` (edge function avec
  service role, ou `supabase.auth.admin.deleteUser`). Obligatoire pour l'App Store.

### Phase 2 — Différenciation (1-2 semaines, 100% gratuit) → objectif 8,5/10

- [x] **4. Score de risque prédictif**
  Algorithme calculant un % de risque de dégradation dans les 4 prochaines semaines,
  basé sur : la tendance des check-ins, l'évolution du score CBI, et la fréquence
  d'utilisation. À afficher dans le dashboard, ex. : "Risque de dégradation : 73% ⚠️".
  Fichiers : `lib/burnout.ts`, `app/(tabs)/index.tsx`.

- [x] **5. Plan d'action IA dynamique**
  Remplacer les 4 jeux de templates statiques (critical/high/medium/low, cf. 4.5) par
  une génération Gemini basée sur le profil CBI complet + le contexte utilisateur
  collecté au point 6. Fichier : `supabase/functions/generate-action-plan/index.ts`.

- [x] **6. Onboarding enrichi**
  Collecter 3-4 informations après le CBI : secteur d'activité, télétravail
  (oui/non/hybride), rôle (manager ou non), principale source de stress — pour
  personnaliser le plan d'action et le compagnon IA.
  Nouveau fichier : `app/(onboarding)/context.tsx`.

- [ ] **7. CGU + Politique de confidentialité**
  Remplacer les liens placeholder `Linking.openURL('#')` dans `app/(tabs)/profile.tsx`
  par de vraies URLs (pages à héberger sur Notion ou GitHub Pages).

### Phase 3 — Lancement (3-4 semaines) → objectif 9/10

- [ ] **8. Dashboard B2B RH**
  Nouvelle section accessible via un code entreprise. Fonctionnalités : score burnout
  agrégé anonymisé de l'équipe, alertes équipes à risque (seuil minimum 10 personnes
  pour le RGPD), rapport mensuel automatique, sans identification individuelle
  possible. Nouveaux fichiers : `app/b2b/`, `lib/b2b.ts`.

- [ ] **9. Sécurité Edge Functions**
  - [x] `generate-action-plan` n'a aucune vérification serveur du tier premium —
    **fait au point 5** : vérification `profiles.subscription_tier === 'premium'`
    côté serveur (`403 PREMIUM_REQUIRED`), comme dans `ai-companion`.
  - Les 3 edge functions (`calculate-burnout-score`, `generate-action-plan`,
    `ai-companion`) tournent avec la service role key et font confiance au `user_id`
    envoyé par le client dans le body, sans vérifier qu'il correspond au JWT de la
    requête. → Extraire l'`user_id` du JWT (`supabase.auth.getUser()` côté edge
    function) plutôt que de l'accepter depuis le client.

- [ ] **10. Restauration des achats RevenueCat**
  Bouton "Restaurer mes achats" dans `components/PaywallModal.tsx`, appelant
  `Purchases.restorePurchases()`. Obligatoire pour l'App Store. Nécessite aussi de
  renseigner `EXPO_PUBLIC_REVENUECAT_KEY` et de tester via un development build.

- [ ] **11. Build natif Android**
  `eas.json` a déjà des profils `preview` (APK interne) et `production`
  (app-bundle, `autoIncrement`) pour Android, mais `google-service-account.json`
  (requis pour `eas submit`) est absent du repo. Finaliser la config et soumettre sur
  Google Play Store (25$ unique). Stratégie confirmée : Android d'abord, iOS ensuite
  une fois l'app génératrice de revenus (cf. section 2).

- [ ] **12. Validation terrain**
  20-50 bêta-testeurs pendant 4 semaines. Collecter les retours, itérer. C'est ce qui
  fait passer de 8,5 à 9/10.

### Nettoyage mineur (sans urgence)

- Les features `checkin_2weeks` et `ai_3messages` dans `lib/subscription.ts` ne sont
  jamais utilisées via `canAccess()` — soit les utiliser réellement (remplacer les
  constantes codées en dur `FREE_LIMIT`/`FREE_MONTHLY_LIMIT`), soit les supprimer.

---

## 6. Décisions architecturales importantes

- **Calcul des scores CBI côté serveur** (`calculate-burnout-score`) — la copie dans
  `lib/burnout.ts` existe pour les constantes/types partagés (questions, libellés
  d'échelle), mais la source de vérité du scoring est l'edge function.
- **Cache AsyncStorage 5 min** sur les données du dashboard (`useBurnoutData`) :
  affichage immédiat des données en cache puis refresh en arrière-plan, pour éviter
  un écran vide au lancement. Invalidé explicitement après un nouveau diagnostic
  (`clearBurnoutCache`).
- **Streaks du plan d'action** : une semaine ne compte dans la streak que si *toutes*
  ses actions sont cochées *et* qu'un check-in existe dans la fenêtre de dates de
  cette semaine (`lib/planProgress.ts`). La semaine en cours (non terminée) est
  exclue du calcul de streak sauf si elle est déjà entièrement complétée.
- **Détection de plateforme pour les abonnements** : `Constants.appOwnership === 'expo'`
  (Expo Go) et `Platform.OS === 'web'` déclenchent un fallback DB plutôt que
  RevenueCat, qui ne fonctionne qu'en development/production build natif.
- **Outils de dev strippés en production** via `if (!__DEV__) return null;` en tête
  de composant — Metro élimine le code mort de la branche, donc `app/dev-tools.tsx`
  n'alourdit pas le bundle de prod.
- **`deleteTestData` (dev-tools) effectue ses suppressions séquentiellement**
  (pas en `Promise.all`) — plusieurs requêtes HTTPS concurrentes vers le même host
  depuis un appareil physique en Wi-Fi peuvent provoquer des erreurs réseau sur
  Expo Go ; le séquentiel est plus fiable et permet d'identifier la table en échec.
- **Limite IA gratuite (3 messages/mois)** vérifiée à la fois côté client (UX,
  affichage du compteur) et côté serveur (`ai-companion`, source de vérité) — modèle
  à reproduire pour `generate-action-plan` (voir section 5, point 9).
- **Rappel hebdomadaire de check-in** programmé automatiquement à la fin du diagnostic
  (`results.tsx`), pas configurable par l'utilisateur actuellement.
- **Score de risque prédictif** (`lib/burnout.ts`, `calculateRiskScore`) : calcule un
  score 0-100 de risque de dégradation dans les 4 prochaines semaines. Base = score CBI
  actuel, modifié par : tendance des 4 derniers check-ins (±15/−10), stress moyen > 7
  (+10) ou < 4 (−5), énergie moyenne < 4 (+10) ou > 7 (−8), motivation < 4 (+5),
  aggravation CBI vs diagnostic précédent (+8), ≥ 3 semaines sans check-in (+8).
  Niveaux : Faible (0-30, vert), Modéré (31-55, orange), Élevé (56-75, rouge),
  Critique (76+, rouge foncé). Affichage dans le dashboard : carte visible par tous,
  facteurs détaillés réservés aux comptes Premium.

---

## Schéma de base de données (résumé)

5 tables, RLS activé partout (`auth.uid() = user_id`) :
- `profiles` (1:1 avec `auth.users`, créée par trigger `handle_new_user`,
  contient `subscription_tier` ainsi que le contexte utilisateur de l'onboarding
  enrichi : `sector` (text, secteur d'activité), `remote_work` (text, `'yes' | 'no' |
  'hybrid'`), `is_manager` (boolean, défaut `false`), `main_stress_source` (text).
  `sector`/`remote_work`/`main_stress_source` restent `NULL` tant que l'écran
  `/(onboarding)/context` n'a pas été complété ou explicitement passé — c'est ce
  triplet qui sert de signal "contexte non renseigné" dans `results.tsx`)
- `assessments` (résultats de diagnostic CBI : scores par dimension, `total_score`,
  `risk_level`)
- `checkins` (check-ins hebdo, contrainte unique `user_id, year, week_number`)
- `action_plans` (`actions` jsonb, `completed_actions` jsonb, lié à `assessment_id`)
- `ai_conversations` (historique de chat, `tokens_used`)

Migrations :
- `supabase/migrations/20260602000001_initial_schema.sql` (schéma initial)
- `supabase/migrations/20260611000001_cbi_score_columns.sql` (élargissement des
  colonnes de score à `numeric(5,2)` pour supporter les scores CBI à 100)
- `supabase/migrations/20260612000001_user_context.sql` (colonnes de contexte
  utilisateur sur `profiles` : `sector`, `remote_work`, `is_manager`,
  `main_stress_source`)

Types TS : `types/database.ts`
