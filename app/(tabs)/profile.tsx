import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/hooks/useAuth';
import { useBurnoutData } from '@/hooks/useBurnoutData';
import { supabase } from '@/lib/supabase';
import { checkSubscription } from '@/lib/subscription';
import { deleteAccount } from '@/lib/auth';
import { getMembershipStatus, type MembershipStatus } from '@/lib/b2b';
import PaywallModal from '@/components/PaywallModal';
import type { SubscriptionTier } from '@/types/database';

function getInitials(firstName: string | null, lastName: string | null, email: string): string {
  const f = firstName?.[0] ?? '';
  const l = lastName?.[0] ?? '';
  if (f || l) return (f + l).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { profile, refresh } = useBurnoutData();

  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [loadingTier, setLoadingTier] = useState(true);
  const [showPaywall, setShowPaywall] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [membership, setMembership] = useState<MembershipStatus | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name ?? '');
      setLastName(profile.last_name ?? '');
    }
  }, [profile]);

  useEffect(() => {
    checkSubscription().then((t) => {
      setTier(t);
      setLoadingTier(false);
    });
    getMembershipStatus().then(setMembership);
  }, []);

  async function doSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      // _layout.tsx handles redirect when session becomes null
    } finally {
      setSigningOut(false);
      setConfirmSignOut(false);
    }
  }

  function confirmDeleteAccount() {
    setDeleteError(null);
    const title = 'Supprimer définitivement ?';
    const message =
      'Toutes vos données seront supprimées. Cette action est irréversible.';

    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) {
        runDeleteAccount();
      }
    } else {
      Alert.alert(title, message, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: runDeleteAccount },
      ]);
    }
  }

  async function runDeleteAccount() {
    setDeletingAccount(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      router.replace('/(auth)/login');
    } catch (err: unknown) {
      setDeleteError(
        err instanceof Error
          ? err.message
          : 'Une erreur est survenue. Veuillez réessayer.'
      );
    } finally {
      setDeletingAccount(false);
    }
  }

  async function saveName() {
    if (!user) return;
    setSavingName(true);
    try {
      await supabase
        .from('profiles')
        .update({ first_name: firstName.trim() || null, last_name: lastName.trim() || null })
        .eq('user_id', user.id);
      await refresh();
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  }

  function cancelEditName() {
    setFirstName(profile?.first_name ?? '');
    setLastName(profile?.last_name ?? '');
    setEditingName(false);
  }

  const email = user?.email ?? '';
  const initials = getInitials(profile?.first_name ?? null, profile?.last_name ?? null, email);
  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Profil</Text>
        </View>

        {/* Avatar + infos utilisateur */}
        <View style={styles.card}>
          <View style={styles.avatarRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.userInfo}>
              {displayName ? (
                <Text style={styles.userName}>{displayName}</Text>
              ) : null}
              <Text style={styles.userEmail}>{email}</Text>
              <View style={styles.tierRow}>
                {loadingTier ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <View style={[styles.tierBadge, tier === 'premium' ? styles.tierBadgePremium : styles.tierBadgeFree]}>
                    {tier === 'premium' && (
                      <Ionicons name="star" size={12} color="#B45309" />
                    )}
                    <Text style={[styles.tierText, tier === 'premium' ? styles.tierTextPremium : styles.tierTextFree]}>
                      {tier === 'premium' ? 'Premium' : 'Gratuit'}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Edition du nom */}
          {editingName ? (
            <View style={styles.nameEditSection}>
              <TextInput
                style={styles.nameInput}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Prénom"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="words"
                returnKeyType="next"
              />
              <TextInput
                style={styles.nameInput}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Nom"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={saveName}
              />
              <View style={styles.nameEditButtons}>
                <TouchableOpacity style={styles.nameCancelBtn} onPress={cancelEditName} disabled={savingName}>
                  <Text style={styles.nameCancelText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.nameSaveBtn} onPress={saveName} disabled={savingName}>
                  {savingName
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.nameSaveText}>Enregistrer</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.editNameRow} onPress={() => setEditingName(true)} activeOpacity={0.7}>
              <Ionicons name="pencil-outline" size={14} color={Colors.primary} />
              <Text style={styles.editNameText}>
                {displayName ? 'Modifier mon nom' : 'Ajouter mon prénom et nom'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Upgrade si gratuit */}
        {!loadingTier && tier === 'free' && (
          <TouchableOpacity style={styles.upgradeCard} onPress={() => setShowPaywall(true)} activeOpacity={0.85}>
            <View style={styles.upgradeLeft}>
              <Text style={styles.upgradeTitle}>Passer à Premium</Text>
              <Text style={styles.upgradeSubtitle}>
                Historique illimité, plan d'action et IA sans limite
              </Text>
            </View>
            <Text style={styles.upgradeArrow}>→</Text>
          </TouchableOpacity>
        )}

        {/* Fonctionnalités incluses */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Votre abonnement</Text>
          {FEATURES.map((feature) => {
            const available = tier === 'premium' || feature.free;
            return (
              <View key={feature.label} style={styles.featureRow}>
                <Text style={[styles.featureCheck, available ? styles.featureCheckOn : styles.featureCheckOff]}>
                  {available ? '✓' : '✗'}
                </Text>
                <Text style={[styles.featureLabel, !available && styles.featureLabelOff]}>
                  {feature.label}
                </Text>
                {!feature.free && tier === 'free' && (
                  <View style={styles.premiumTag}>
                    <Text style={styles.premiumTagText}>Premium</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Mon entreprise (B2B) */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Mon entreprise</Text>
          {!membership ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : membership.isAdmin ? (
            <>
              <TouchableOpacity
                style={styles.b2bButton}
                onPress={() => router.push('/b2b/dashboard')}
                activeOpacity={0.85}
              >
                <Text style={styles.b2bButtonText}>Voir le dashboard équipe</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.b2bButtonSecondary}
                onPress={() => router.push('/b2b/admin')}
                activeOpacity={0.85}
              >
                <Text style={styles.b2bButtonSecondaryText}>Gérer mon organisation</Text>
              </TouchableOpacity>
            </>
          ) : membership.isMember ? (
            <View style={styles.b2bMemberRow}>
              <Ionicons name="checkmark-circle-outline" size={18} color={Colors.primary} />
              <Text style={styles.b2bMemberText}>
                Vous êtes membre d'une organisation. Vos données sont incluses, de façon
                anonymisée, dans le suivi d'équipe.
              </Text>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={styles.b2bButton}
                onPress={() => router.push('/b2b/join')}
                activeOpacity={0.85}
              >
                <Text style={styles.b2bButtonText}>Rejoindre mon entreprise</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.b2bButtonSecondary}
                onPress={() => router.push('/b2b/admin')}
                activeOpacity={0.85}
              >
                <Text style={styles.b2bButtonSecondaryText}>Créer mon organisation (RH)</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Déconnexion */}
        {confirmSignOut ? (
          <View style={styles.confirmBox}>
            <Text style={styles.confirmText}>Voulez-vous vous déconnecter ?</Text>
            <View style={styles.confirmRow}>
              <TouchableOpacity
                style={styles.confirmCancel}
                onPress={() => setConfirmSignOut(false)}
              >
                <Text style={styles.confirmCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmConfirm}
                onPress={doSignOut}
                disabled={signingOut}
              >
                {signingOut ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmConfirmText}>Confirmer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={() => setConfirmSignOut(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.signOutText}>Déconnexion</Text>
          </TouchableOpacity>
        )}

        {__DEV__ && (
          <TouchableOpacity
            style={styles.devButton}
            onPress={() => router.push('/dev-tools')}
            activeOpacity={0.7}
          >
            <Text style={styles.devButtonText}>Mode dev</Text>
          </TouchableOpacity>
        )}

        <View style={styles.legalSection}>
          <View style={styles.legalLinks}>
            <TouchableOpacity
              onPress={() =>
                Linking.openURL('https://firstsign-legal.netlify.app/cgu').catch(() => {})
              }
            >
              <Text style={styles.legalLink}>Conditions d'utilisation</Text>
            </TouchableOpacity>
            <Text style={styles.legalDot}>·</Text>
            <TouchableOpacity
              onPress={() =>
                Linking.openURL('https://firstsign-legal.netlify.app/privacy').catch(() => {})
              }
            >
              <Text style={styles.legalLink}>Politique de confidentialité</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.deleteSeparator} />

          <TouchableOpacity
            onPress={confirmDeleteAccount}
            disabled={deletingAccount}
            activeOpacity={0.7}
          >
            {deletingAccount ? (
              <ActivityIndicator size="small" color={Colors.danger} />
            ) : (
              <Text style={styles.deleteAccountText}>Supprimer mon compte</Text>
            )}
          </TouchableOpacity>

          {deleteError && (
            <Text style={styles.deleteErrorText}>{deleteError}</Text>
          )}

          <Text style={styles.appDescription}>
            Plateforme de prévention et détection précoce du burnout professionnel
          </Text>
          <Text style={styles.versionText}>Version 1.0.0</Text>
        </View>
      </ScrollView>

      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSuccess={() => {
          setShowPaywall(false);
          setTier('premium');
        }}
      />
    </SafeAreaView>
  );
}

const FEATURES: { label: string; free: boolean }[] = [
  { label: 'Diagnostic CBI complet', free: true },
  { label: 'Check-in hebdomadaire', free: true },
  { label: '3 messages IA par mois', free: true },
  { label: 'Historique illimité', free: false },
  { label: 'IA sans limite', free: false },
  { label: 'Plan d\'action 8 semaines', free: false },
];

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  pageHeader: {
    paddingVertical: 20,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text,
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
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.primary,
  },
  userInfo: {
    flex: 1,
    gap: 6,
  },
  userName: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.text,
  },
  userEmail: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  editNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  editNameText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  nameEditSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    gap: 10,
  },
  nameInput: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingVertical: 11,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text,
  },
  nameEditButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  nameCancelBtn: {
    flex: 1,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  nameCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  nameSaveBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  nameSaveText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tierRow: {
    flexDirection: 'row',
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  tierBadgeFree: {
    backgroundColor: Colors.surfaceAlt,
  },
  tierBadgePremium: {
    backgroundColor: '#FFF8E7',
  },
  tierText: {
    fontSize: 13,
    fontWeight: '700',
  },
  tierTextFree: {
    color: Colors.textSecondary,
  },
  tierTextPremium: {
    color: '#B45309',
  },
  upgradeCard: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  upgradeLeft: {
    flex: 1,
    gap: 4,
  },
  upgradeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  upgradeSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 18,
  },
  upgradeArrow: {
    fontSize: 22,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 14,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  featureCheck: {
    fontSize: 15,
    fontWeight: '700',
    width: 20,
    textAlign: 'center',
  },
  featureCheckOn: {
    color: Colors.success,
  },
  featureCheckOff: {
    color: Colors.border,
  },
  featureLabel: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },
  featureLabelOff: {
    color: Colors.textMuted,
  },
  premiumTag: {
    backgroundColor: '#FFF8E7',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  premiumTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  b2bButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  b2bButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  b2bButtonSecondary: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  b2bButtonSecondaryText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  b2bMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  b2bMemberText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  signOutButton: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: Colors.danger + '40',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.danger,
  },
  devButton: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  devButtonText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '600',
  },
  legalSection: {
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginBottom: 8,
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legalLink: {
    fontSize: 12,
    color: Colors.textSecondary,
    textDecorationLine: 'underline',
  },
  legalDot: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  appDescription: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    fontStyle: 'italic',
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: Colors.textMuted,
  },
  deleteSeparator: {
    height: 1,
    backgroundColor: Colors.borderLight,
    alignSelf: 'stretch',
    marginVertical: 8,
  },
  deleteAccountText: {
    fontSize: 13,
    color: Colors.danger,
    textDecorationLine: 'underline',
  },
  deleteErrorText: {
    fontSize: 12,
    color: Colors.danger,
    textAlign: 'center',
    marginTop: 4,
  },
  confirmBox: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: Colors.danger + '40',
    gap: 12,
  },
  confirmText: {
    fontSize: 14,
    color: Colors.text,
    textAlign: 'center',
    fontWeight: '500',
  },
  confirmRow: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmCancel: {
    flex: 1,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  confirmConfirm: {
    flex: 1,
    backgroundColor: Colors.danger,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
