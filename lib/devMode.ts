// __DEV__ is injected by Metro bundler — true in development, false in production builds.
// Metro performs dead-code elimination on `if (!__DEV__)` branches, so any code gated
// behind this constant is stripped entirely from the production bundle.
export const IS_DEV = __DEV__;
export const isDevMode = () => IS_DEV;
