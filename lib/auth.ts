import { AuthError } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Email ou mot de passe incorrect.',
  email_not_confirmed: 'Veuillez confirmer votre adresse email avant de vous connecter.',
  user_not_found: 'Aucun compte ne correspond à cet email.',
  user_already_exists: 'Un compte existe déjà avec cet email.',
  email_exists: 'Un compte existe déjà avec cet email.',
  weak_password: 'Le mot de passe est trop faible.',
  email_address_invalid: 'Adresse email invalide.',
  validation_failed: 'Adresse email invalide.',
  over_request_rate_limit: 'Trop de tentatives. Veuillez réessayer plus tard.',
  over_email_send_rate_limit: 'Trop de tentatives. Veuillez réessayer plus tard.',
  same_password: 'Le nouveau mot de passe doit être différent de l\'ancien.',
};

export function getAuthErrorMessage(error: AuthError): string {
  if (error.code && AUTH_ERROR_MESSAGES[error.code]) {
    return AUTH_ERROR_MESSAGES[error.code];
  }
  if (error.message === 'Invalid login credentials') {
    return AUTH_ERROR_MESSAGES.invalid_credentials;
  }
  if (error.message.toLowerCase().includes('network')) {
    return 'Connexion impossible. Vérifiez votre connexion internet.';
  }
  return 'Une erreur est survenue. Veuillez réessayer.';
}

export async function signUp(email: string, password: string, data?: Record<string, string>) {
  const emailRedirectTo = Linking.createURL('email-confirmed');
  return supabase.auth.signUp({
    email,
    password,
    options: { data, emailRedirectTo },
  });
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function resetPassword(email: string) {
  const redirectTo = Linking.createURL('reset-password');
  return supabase.auth.resetPasswordForEmail(email, { redirectTo });
}

export async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account', {
    body: {},
  });

  if (error || data?.error) {
    throw new Error(
      data?.message ?? 'Une erreur est survenue lors de la suppression du compte. Veuillez réessayer.'
    );
  }

  await supabase.auth.signOut();
}
