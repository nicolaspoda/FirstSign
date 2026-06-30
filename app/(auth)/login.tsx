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
import { Link } from 'expo-router';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/hooks/useAuth';
import { getAuthErrorMessage } from '@/lib/auth';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { signIn } = useAuth();

  async function handleLogin() {
    if (!email || !password) {
      setError('Veuillez remplir tous les champs.');
      return;
    }
    setError('');
    setSubmitting(true);
    const { error } = await signIn(email.trim(), password);
    if (error) {
      setSubmitting(false);
      setError(getAuthErrorMessage(error));
    }
    // On success, _layout.tsx handles the redirect once the session updates
    // (it also checks whether an assessment exists to pick the right destination).
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Connexion</Text>
        <Text style={styles.subtitle}>Bienvenue sur FirstSign</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={Colors.textMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
          textContentType="emailAddress"
        />
        <TextInput
          style={styles.input}
          placeholder="Mot de passe"
          placeholderTextColor={Colors.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          autoCorrect={false}
        />

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Se connecter</Text>
          )}
        </TouchableOpacity>

        <Link href="/(auth)/forgot-password" asChild>
          <TouchableOpacity style={styles.forgotLink}>
            <Text style={styles.forgotLinkText}>Mot de passe oublié ?</Text>
          </TouchableOpacity>
        </Link>

        <Link href="/(auth)/register" asChild>
          <TouchableOpacity style={styles.link}>
            <Text style={styles.linkText}>
              Pas encore de compte ? <Text style={styles.linkBold}>S'inscrire</Text>
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
  forgotLink: {
    alignItems: 'center',
    marginBottom: 16,
  },
  forgotLinkText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '500',
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
});
