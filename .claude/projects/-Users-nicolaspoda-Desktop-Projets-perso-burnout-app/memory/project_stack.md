---
name: project-stack
description: Tech stack and key dependencies for burnout-app
metadata:
  type: project
---

Expo SDK 56 (not 52), TypeScript strict, Expo Router v4 (file-based nav), Supabase for auth+db, react-native-purchases (RevenueCat — note: the npm package is `react-native-purchases`, NOT `@revenuecat/purchases-react-native` which doesn't exist), react-native-reanimated v4.

**Why:** burnout coaching app with paywall, AI companion, and 8-week program.

**How to apply:** Always use SDK 56 docs (https://docs.expo.dev/versions/v56.0.0/). RevenueCat requires native build (`expo prebuild`) to function — won't work in Expo Go.
