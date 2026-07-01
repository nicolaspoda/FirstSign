import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/hooks/useAuth';
import { getAuthErrorMessage } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function RegisterScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const { signUp } = useAuth();
  const router = useRouter();

  async function handleRegister() {
    if (!firstName.trim() || !lastName.trim()) {
      setError('Veuillez saisir votre prénom et votre nom.');
      return;
    }
    if (!email || !password || !confirm) {
      setError('Veuillez remplir tous les champs.');
      return;
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    setError('');
    setSubmitting(true);
    const result = await signUp(email.trim(), password, {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
    });
    if (result.error) {
      setSubmitting(false);
      setError(getAuthErrorMessage(result.error));
    } else if (result.data?.user?.identities?.length === 0) {
      // Supabase anti-enumeration: this email is already registered. With
      // "Confirm email" enabled, signUp() returns an obfuscated user with no
      // error and no session instead of a clear "already exists" error.
      setSubmitting(false);
      setError('Un compte existe déjà avec cet email. Connectez-vous ou réinitialisez votre mot de passe.');
    } else if (result.data?.session) {
      // Email confirmation disabled — session active immediately, save names now.
      await supabase
        .from('profiles')
        .update({ first_name: firstName.trim(), last_name: lastName.trim() })
        .eq('user_id', result.data.session.user.id);
      // _layout.tsx handles the redirect once the session updates.
    } else {
      // Email confirmation required — names saved in user_metadata, written to
      // profile in email-confirmed.tsx once the session is established.
      setSubmitting(false);
      setAwaitingConfirmation(true);
    }
  }

  if (awaitingConfirmation) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.confirmationContainer}>
          <View style={styles.mailIcon}>
            <Ionicons name="mail-outline" size={36} color={Colors.primary} />
          </View>
          <Text style={styles.confirmationTitle}>Vérifiez votre email</Text>
          <Text style={styles.confirmationBody}>
            Un lien de confirmation a été envoyé à{'\n'}
            <Text style={styles.confirmationEmail}>{email}</Text>
            {'\n\n'}
            Cliquez sur le lien dans l'email pour activer votre compte, puis revenez vous connecter.
          </Text>
          <TouchableOpacity
            style={styles.confirmationButton}
            onPress={() => router.replace('/(auth)/login')}
          >
            <Text style={styles.buttonText}>Aller à la connexion</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.link}
            onPress={() => setAwaitingConfirmation(false)}
          >
            <Text style={styles.linkText}>Modifier l'adresse email</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Créer un compte</Text>
        <Text style={styles.subtitle}>Commencez votre suivi du bien-être</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.nameRow}>
          <TextInput
            style={[styles.input, styles.nameInput]}
            placeholder="Prénom"
            placeholderTextColor={Colors.textMuted}
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            autoCorrect={false}
          />
          <TextInput
            style={[styles.input, styles.nameInput]}
            placeholder="Nom"
            placeholderTextColor={Colors.textMuted}
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={Colors.textMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="Mot de passe"
          placeholderTextColor={Colors.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TextInput
          style={styles.input}
          placeholder="Confirmer le mot de passe"
          placeholderTextColor={Colors.textMuted}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
        />

        <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Créer mon compte</Text>
          )}
        </TouchableOpacity>

        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={styles.link}>
            <Text style={styles.linkText}>
              Déjà un compte ? <Text style={styles.linkBold}>Se connecter</Text>
            </Text>
          </TouchableOpacity>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 32,
  },
  error: {
    color: Colors.danger,
    fontSize: 14,
    marginBottom: 16,
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 8,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 0,
  },
  nameInput: {
    flex: 1,
    marginBottom: 16,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text,
    marginBottom: 16,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  link: {
    alignItems: 'center',
  },
  linkText: {
    color: Colors.textSecondary,
    fontSize: 15,
  },
  linkBold: {
    color: Colors.primary,
    fontWeight: '600',
  },
  // Email confirmation screen
  confirmationContainer: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  mailIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  confirmationTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  confirmationBody: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  confirmationEmail: {
    color: Colors.primary,
    fontWeight: '600',
  },
  confirmationButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: 8,
    marginBottom: 8,
  },
});
