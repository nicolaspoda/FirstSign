import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Colors } from '@/constants/colors';
import { createOrganization, getMyOrganizationInfo, type OrganizationInfo } from '@/lib/b2b';

export default function B2BAdminScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<OrganizationInfo | null>(null);

  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getMyOrganizationInfo();
      setInfo(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await createOrganization(name);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setCreating(false);
    }
  }

  async function handleCopyCode() {
    if (!info) return;
    await Clipboard.setStringAsync(info.organization.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mon organisation</Text>
        <View style={styles.backButton} />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : info ? (
        <View style={styles.content}>
          <View style={styles.card}>
            <Text style={styles.orgLabel}>Organisation</Text>
            <Text style={styles.orgName}>{info.organization.name}</Text>

            <View style={styles.statRow}>
              <Ionicons name="people-outline" size={20} color={Colors.primary} />
              <Text style={styles.statText}>
                {info.memberCount} {info.memberCount > 1 ? 'membres actifs' : 'membre actif'}
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Code d'invitation</Text>
            <Text style={styles.subtitle}>
              Partagez ce code avec vos collaborateurs pour qu'ils rejoignent le suivi d'équipe.
            </Text>
            <Text style={styles.inviteCode}>{info.organization.code}</Text>
            <TouchableOpacity style={styles.copyButton} onPress={handleCopyCode} activeOpacity={0.7}>
              <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={Colors.primary} />
              <Text style={styles.copyButtonText}>{copied ? 'Copié !' : "Copier le code d'invitation"}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/b2b/dashboard')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Voir le dashboard équipe</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.content}>
          <Ionicons name="business-outline" size={48} color={Colors.primary} style={styles.icon} />
          <Text style={styles.title}>Créer mon organisation</Text>
          <Text style={styles.subtitle}>
            Créez votre organisation pour suivre le bien-être de votre équipe de façon
            anonymisée et inviter vos collaborateurs.
          </Text>

          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Nom de l'entreprise"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="words"
          />

          {createError && <Text style={styles.errorText}>{createError}</Text>}

          <TouchableOpacity
            style={[styles.primaryButton, (!name.trim() || creating) && styles.primaryButtonDisabled]}
            onPress={handleCreate}
            disabled={!name.trim() || creating}
            activeOpacity={0.85}
          >
            {creating ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>Créer l'organisation</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  icon: {
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  input: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    color: Colors.danger,
    textAlign: 'center',
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  orgLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  orgName: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 16,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  statText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  inviteCode: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 6,
    color: Colors.primary,
    textAlign: 'center',
    marginVertical: 16,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primaryLight,
    borderRadius: 12,
    paddingVertical: 12,
  },
  copyButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
  },
});
