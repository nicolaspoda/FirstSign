import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { isExpoGo, restorePurchases } from '@/lib/subscription';

export interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const BENEFITS = [
  "Plan d'action personnalisé 8 semaines",
  'Historique illimité',
  'Compagnon IA illimité',
  'Exercices et techniques avancées',
];

export default function PaywallModal({ visible, onClose, onSuccess }: PaywallModalProps) {
  const [purchasing, setPurchasing] = useState<'monthly' | 'annual' | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePurchase(type: 'monthly' | 'annual') {
    if (Platform.OS === 'web') {
      setError('Les achats in-app sont disponibles sur l\'application mobile (iOS / Android).');
      return;
    }
    if (isExpoGo) {
      setError('Les achats in-app nécessitent un development build (non disponibles dans Expo Go).');
      return;
    }
    setError(null);
    setPurchasing(type);
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Purchases = require('react-native-purchases').default;
      const offerings = await Purchases.getOfferings();
      const current = offerings.current;
      if (!current) throw new Error('Offres non encore disponibles. Elles apparaîtront une fois RevenueCat connecté à Google Play Console (ou App Store Connect).');

      let pkg: unknown = null;
      if (type === 'monthly') {
        pkg = current.monthly ?? current.availablePackages[0] ?? null;
      } else {
        pkg = current.annual ?? current.availablePackages[0] ?? null;
      }

      if (!pkg) throw new Error('Forfait introuvable.');

      await Purchases.purchasePackage(pkg);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      if (!err?.userCancelled) {
        setError(err?.message ?? 'Achat impossible. Veuillez réessayer.');
      }
    } finally {
      setPurchasing(null);
    }
  }

  async function handleRestore() {
    if (Platform.OS === 'web' || isExpoGo) {
      setError("La restauration n'est disponible que sur l'application mobile installée.");
      return;
    }
    setError(null);
    setRestoring(true);
    try {
      const restored = await restorePurchases();
      if (restored) {
        onSuccess?.();
        onClose();
        Alert.alert('Restauration réussie', 'Abonnement restauré avec succès ✓');
      } else {
        setError('Aucun achat à restaurer.');
      }
    } catch (err: any) {
      setError(err?.message ?? 'La restauration a échoué. Veuillez réessayer.');
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.dismissArea} onPress={onClose} activeOpacity={1} />
        <View style={styles.sheet}>
          <SafeAreaView style={styles.sheetInner}>
            <View style={styles.handleBar} />

            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>

            <View style={styles.crownContainer}>
              <View style={styles.crownInner}>
                <Ionicons name="star" size={28} color={Colors.primary} />
              </View>
            </View>

            <Text style={styles.title}>Débloquez votre plan complet</Text>
            <Text style={styles.subtitle}>
              Accédez à toutes les fonctionnalités pour mieux gérer votre bien-être professionnel
            </Text>

            <View style={styles.benefitsList}>
              {BENEFITS.map((benefit, idx) => (
                <View key={idx} style={styles.benefitRow}>
                  <View style={styles.checkmark}>
                    <Text style={styles.checkmarkText}>✓</Text>
                  </View>
                  <Text style={styles.benefitText}>{benefit}</Text>
                </View>
              ))}
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.annualButton, (purchasing !== null || restoring) && styles.buttonDisabled]}
              onPress={() => handlePurchase('annual')}
              disabled={purchasing !== null || restoring}
              activeOpacity={0.85}
            >
              {purchasing === 'annual' ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <View style={styles.annualButtonContent}>
                    <Text style={styles.annualButtonTitle}>59,99€ / an</Text>
                    <View style={styles.savingsBadge}>
                      <Text style={styles.savingsBadgeText}>économisez 33%</Text>
                    </View>
                  </View>
                  <Text style={styles.annualButtonSubtitle}>Le plus populaire</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.monthlyButton, (purchasing !== null || restoring) && styles.buttonDisabled]}
              onPress={() => handlePurchase('monthly')}
              disabled={purchasing !== null || restoring}
              activeOpacity={0.85}
            >
              {purchasing === 'monthly' ? (
                <ActivityIndicator color={Colors.primary} />
              ) : (
                <Text style={styles.monthlyButtonText}>7,99€ / mois</Text>
              )}
            </TouchableOpacity>

            <View style={styles.restoreSeparator} />

            <TouchableOpacity
              style={styles.restoreButton}
              onPress={handleRestore}
              disabled={purchasing !== null || restoring}
              activeOpacity={0.6}
            >
              {restoring ? (
                <ActivityIndicator size="small" color={Colors.textMuted} />
              ) : (
                <Text style={styles.restoreButtonText}>Restaurer mes achats</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.legalText}>
              Abonnement renouvelé automatiquement. Annulez à tout moment.
            </Text>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'android' ? 24 : 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  sheetInner: {
    paddingBottom: 16,
  },
  handleBar: {
    width: 36,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  closeButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 18,
  },
  closeButtonText: {
    fontSize: 22,
    color: Colors.textSecondary,
    lineHeight: 26,
    fontWeight: '400',
  },
  crownContainer: {
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  crownInner: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  benefitsList: {
    gap: 12,
    marginBottom: 24,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkmarkText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '700',
  },
  benefitText: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    fontWeight: '500',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    color: Colors.danger,
    fontSize: 13,
    textAlign: 'center',
  },
  annualButton: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  annualButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  annualButtonTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  savingsBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  savingsBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  annualButtonSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 3,
  },
  monthlyButton: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  monthlyButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  restoreSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginBottom: 16,
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: 4,
    marginBottom: 12,
  },
  restoreButtonText: {
    fontSize: 13,
    color: Colors.textMuted,
    textDecorationLine: 'underline',
  },
  legalText: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
});
