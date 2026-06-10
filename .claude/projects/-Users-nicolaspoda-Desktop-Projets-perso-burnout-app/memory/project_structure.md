---
name: project-structure
description: File structure and routing for burnout-app
metadata:
  type: project
---

Expo Router file structure initialized:
- `app/_layout.tsx` — root layout with Supabase auth guard (redirect to login if no session)
- `app/(auth)/` — login + register screens
- `app/(onboarding)/welcome.tsx` — onboarding entry
- `app/(tabs)/` — 4 tabs: Dashboard (index), Plan, Chat, Profile
- `lib/supabase.ts` — Supabase client with AsyncStorage persistence
- `types/index.ts` — User, BurnoutProfile, CheckIn, Exercise, UserProgress types
- `constants/colors.ts` — palette with primary #1D9E75, severity colors
- `babel.config.js` — includes react-native-reanimated/plugin
- `package.json` main = `expo-router/entry`
- `app.json` scheme = `burnout-app`, plugins: expo-router + expo-secure-store

**Why:** Initial scaffold — all screens are TODO placeholders.

**How to apply:** When building features, wire into the existing route groups and import from `@/lib/supabase`, `@/types`, `@/constants/colors` using the `@/*` path alias.
