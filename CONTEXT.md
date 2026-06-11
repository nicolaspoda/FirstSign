# CONTEXT.md — BurnoutApp

> Document de contexte pour reprendre le développement dans une nouvelle session
> (Claude Code ou claude.ai). Mis à jour le 2026-06-11.

---

## 1. Idée de l'app / positionnement

**BurnoutApp** est une application mobile (iOS/Android/Web via Expo) de **dépistage et
suivi du burnout professionnel**, positionnée comme un outil d'auto-évaluation et
d'accompagnement quotidien — pas un dispositif médical, pas un substitut à un
professionnel de santé.

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

---

## 2. Stack technique complète

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
  - 3 Edge Functions : `calculate-burnout-score`, `generate-action-plan`, `ai-companion`
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

---

## 3. Fonctionnalités implémentées

### 3.1 Authentification (`lib/auth.ts`, `hooks/useAuth.ts`, `app/(auth)/*`)
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

### 3.2 Diagnostic CBI (onboarding) (`app/(onboarding)/*`, `lib/burnout.ts`,
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

**Statut : 100% fonctionnel.** Tier : **gratuit**.

### 3.3 Dashboard (`app/(tabs)/index.tsx`, `hooks/useBurnoutData.ts`)
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

### 3.4 Historique (`app/(tabs)/history.tsx`)
- Liste des check-ins (date, semaine ISO, score de bien-être, mini-barres par métrique)
- **Gratuit : 2 derniers check-ins seulement** (`FREE_LIMIT = 2`)
- **Premium : historique illimité**, bloc d'upsell pour les utilisateurs gratuits

**Statut : 100% fonctionnel.**

### 3.5 Plan d'action 8 semaines (`app/(tabs)/plan.tsx`, `lib/planProgress.ts`,
`supabase/functions/generate-action-plan`)
- Génération d'un programme **8 semaines × 3 actions**, choisi parmi 4 jeux de
  templates (critical/high/medium/low) entièrement rédigés en français
- Suivi de progression : % global, semaine en cours, **streaks** (semaine = "réussie"
  si toutes les actions sont cochées ET un check-in existe dans la fenêtre de la
  semaine), meilleure streak
- Actions cochables, persistées dans `action_plans.completed_actions`
- États : pas de diagnostic / diagnostic sans plan / plan actif / plan terminé
  (avec CTA "Refaire")
- Lien vers la bibliothèque d'exercices (premium)

**Statut : 100% fonctionnel côté UI.** Tier : **premium** (gating client uniquement,
voir section 4).

### 3.6 Bibliothèque d'exercices (`app/exercises.tsx`, `lib/exercises.ts`)
- 14 exercices (5 respiration, 5 pleine conscience, 5 restructuration cognitive 
  — vérifier le compte exact dans `lib/exercises.ts`), chacun avec instructions
  détaillées en français, niveau (débutant/intermédiaire/avancé), durée
- Modal plein écran avec minuteur fonctionnel (play/pause/reset)
- Écran verrouillé + paywall si non premium

**Statut : 100% fonctionnel.** Tier : **premium**.

### 3.7 Compagnon IA (`app/(tabs)/chat.tsx`, `supabase/functions/ai-companion`)
- Chat avec rendu enrichi (gras, listes), indicateur de frappe animé
- Prompt système personnalisé avec les scores du dernier diagnostic
- Appel **Gemini 2.5 Flash**, gestion des erreurs 429/503 (`SERVICE_UNAVAILABLE`)
- Historique de conversation sauvegardé (`ai_conversations`)
- Limite **3 conversations/mois** pour les utilisateurs gratuits — **vérifiée
  côté serveur ET client** (la seule des 3 edge functions à le faire correctement)
- Disclaimer "ne remplace pas un professionnel de santé"

**Statut : 100% fonctionnel.** Tier : **gratuit (3/mois) + premium (illimité)**.

### 3.8 Abonnement / Paywall (`lib/subscription.ts`, `components/PaywallModal.tsx`)
- `checkSubscription()` : RevenueCat sur natif (entitlement `premium`),
  fallback DB (`profiles.subscription_tier`) sur web/Expo Go
- `canAccess(feature)` basé sur `FEATURES_BY_TIER`
- `PaywallModal` : présentation des bénéfices, achat annuel (59,99€, badge -33%) ou
  mensuel (7,99€)

**Statut : partiel** — logique de détection plateforme/fallback complète, mais achats
RevenueCat réels non testables sans development build + clé API configurée.
Incohérence mineure : les features `checkin_2weeks`/`ai_3messages` sont définies mais
jamais vérifiées via `canAccess` (limites codées en dur ailleurs).

### 3.9 Profil (`app/(tabs)/profile.tsx`)
- Avatar (initiales), badge de tier, carte d'upgrade si gratuit
- Liste des fonctionnalités par tier
- Déconnexion (confirmation 2 étapes)
- Lien "Mode dev" (visible seulement en `__DEV__`)
- Liens légaux CGU/confidentialité → **placeholders `#` non fonctionnels**
- "Version 1.0.0"

**Statut : partiel** — voir section 4 (CGU/confidentialité manquantes).

### 3.10 Notifications (`lib/notifications.ts`)
- Rappel hebdomadaire (lundi 9h) "Faites votre check-in burnout de la semaine"
- No-op propre sur web

**Statut : 100% fonctionnel** sur natif. Tier : gratuit + premium.

### 3.11 Outils de développement (`app/dev-tools.tsx`)
- Visible uniquement si `__DEV__` (strippé en prod par Metro)
- Simuler 4 semaines de check-ins (tendance croissante)
- Simuler une dégradation (déclenche l'alerte)
- Créer un 2e diagnostic (risque critique)
- Basculer premium/free
- Supprimer les données de test / reset complet (DB + cache)

**Statut : 100% fonctionnel.**

### 3.12 Layout / navigation globale (`app/_layout.tsx`, `app/(tabs)/_layout.tsx`)
- Bandeau hors-ligne (NetInfo)
- Tabs : Accueil, Historique, Plan, Chat, Profil
- Guard de session + redirections (auth ↔ onboarding ↔ tabs)

**Statut : 100% fonctionnel.**

---

## 4. Ce qui reste à faire

### Sécurité — priorité haute
1. **`generate-action-plan` n'a aucune vérification serveur du tier premium.**
   Le gating repose entièrement sur le client (`canAccess('action_plan')`). Un appel
   direct à l'edge function par un utilisateur gratuit générerait quand même un plan.
   → Ajouter une vérification `profiles.subscription_tier === 'premium'` côté serveur,
   comme c'est déjà fait dans `ai-companion`.
2. **Les 3 edge functions font confiance au `user_id` envoyé par le client** (elles
   tournent avec la service role key, sans vérifier que ce `user_id` correspond au JWT
   de la requête). → Extraire l'`user_id` du JWT (`supabase.auth.getUser()` côté edge
   function avec le token de la requête) plutôt que de l'accepter dans le body.

### Fonctionnalités manquantes
3. **CGU / Politique de confidentialité** : liens actuellement `Linking.openURL('#')`
   dans `app/(tabs)/profile.tsx`. Nécessaire avant toute soumission App
   Store/Play Store.
4. **Suppression de compte** : aucune fonctionnalité de suppression de compte/données
   par l'utilisateur (obligatoire RGPD + souvent requis par Apple). À ajouter dans
   Profil (suppression des lignes liées + `auth.users` via une edge function avec
   service role, ou `supabase.auth.admin.deleteUser`).

### Nettoyage / cohérence mineure
5. Les features `checkin_2weeks` et `ai_3messages` dans `lib/subscription.ts` ne sont
   jamais utilisées via `canAccess()` — soit les utiliser réellement (remplacer les
   constantes codées en dur `FREE_LIMIT`/`FREE_MONTHLY_LIMIT`), soit les supprimer.
6. Configuration RevenueCat (clé API `EXPO_PUBLIC_REVENUECAT_KEY`) à renseigner et
   tester via un development build avant la mise en prod des achats in-app.

---

## 5. Décisions architecturales importantes

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
  à reproduire pour `generate-action-plan` (voir section 4, point 1).
- **Rappel hebdomadaire de check-in** programmé automatiquement à la fin du diagnostic
  (`results.tsx`), pas configurable par l'utilisateur actuellement.

---

## Schéma de base de données (résumé)

5 tables, RLS activé partout (`auth.uid() = user_id`) :
- `profiles` (1:1 avec `auth.users`, créée par trigger `handle_new_user`,
  contient `subscription_tier`)
- `assessments` (résultats de diagnostic CBI : scores par dimension, `total_score`,
  `risk_level`)
- `checkins` (check-ins hebdo, contrainte unique `user_id, year, week_number`)
- `action_plans` (`actions` jsonb, `completed_actions` jsonb, lié à `assessment_id`)
- `ai_conversations` (historique de chat, `tokens_used`)

Migrations :
- `supabase/migrations/20260602000001_initial_schema.sql` (schéma initial)
- `supabase/migrations/20260611000001_cbi_score_columns.sql` (élargissement des
  colonnes de score à `numeric(5,2)` pour supporter les scores CBI à 100)

Types TS : `types/database.ts`
