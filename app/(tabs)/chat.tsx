import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { sendAiMessage } from '@/lib/api';
import { canAccess } from '@/lib/subscription';
import type { Message } from '@/types/database';
import PaywallModal from '@/components/PaywallModal';

const FREE_MONTHLY_LIMIT = 3;

interface ChatMessage extends Message {
  id: string;
  timestamp: Date;
}

function TypingIndicator() {
  const dot1 = useSharedValue(0.3);
  const dot2 = useSharedValue(0.3);
  const dot3 = useSharedValue(0.3);

  useEffect(() => {
    dot1.value = withRepeat(withTiming(1, { duration: 500 }), -1, true);
    dot2.value = withDelay(170, withRepeat(withTiming(1, { duration: 500 }), -1, true));
    dot3.value = withDelay(340, withRepeat(withTiming(1, { duration: 500 }), -1, true));
  }, []);

  const s1 = useAnimatedStyle(() => ({ opacity: dot1.value }));
  const s2 = useAnimatedStyle(() => ({ opacity: dot2.value }));
  const s3 = useAnimatedStyle(() => ({ opacity: dot3.value }));

  return (
    <View style={typingStyles.container}>
      <Animated.View style={[typingStyles.dot, s1]} />
      <Animated.View style={[typingStyles.dot, s2]} />
      <Animated.View style={[typingStyles.dot, s3]} />
    </View>
  );
}

const typingStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.textMuted,
  },
});

function renderRichText(content: string) {
  const lines = content.split('\n');
  return lines.flatMap((line, lineIdx) => {
    const cleaned = line.replace(/^(\s*)[*-]\s+/, '$1• ');
    const segments = cleaned.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <Text key={`${lineIdx}-${i}`} style={bubbleStyles.bold}>{part.slice(2, -2)}</Text>
      ) : (
        part
      )
    );
    return lineIdx < lines.length - 1 ? [...segments, '\n'] : segments;
  });
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const timeLabel = message.timestamp.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={[bubbleStyles.wrapper, isUser ? bubbleStyles.wrapperUser : bubbleStyles.wrapperAssistant]}>
      <View style={[bubbleStyles.bubble, isUser ? bubbleStyles.bubbleUser : bubbleStyles.bubbleAssistant]}>
        <Text style={[bubbleStyles.text, isUser ? bubbleStyles.textUser : bubbleStyles.textAssistant]}>
          {renderRichText(message.content)}
        </Text>
      </View>
      <Text style={[bubbleStyles.time, isUser ? bubbleStyles.timeUser : bubbleStyles.timeAssistant]}>
        {timeLabel}
      </Text>
    </View>
  );
}

const bubbleStyles = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
    maxWidth: '80%',
  },
  wrapperUser: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  wrapperAssistant: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUser: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
  },
  textUser: {
    color: '#FFFFFF',
  },
  textAssistant: {
    color: Colors.text,
  },
  bold: {
    fontWeight: '700',
  },
  time: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 3,
  },
  timeUser: {
    marginRight: 4,
  },
  timeAssistant: {
    marginLeft: 4,
  },
});

const INITIAL_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: "Bonjour ! Je suis votre compagnon bien-être. Comment vous sentez-vous aujourd'hui ?",
  timestamp: new Date(),
};

export default function ChatScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [conversationCount, setConversationCount] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    canAccess('ai_unlimited').then(setIsPremium);
  }, []);

  useEffect(() => {
    if (!user) return;
    const userId = user.id;

    async function init() {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [historyResult, countResult] = await Promise.all([
        supabase
          .from('ai_conversations')
          .select('messages, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('ai_conversations')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gte('created_at', startOfMonth.toISOString()),
      ]);

      if (historyResult.data?.messages && historyResult.data.messages.length > 0) {
        const ts = new Date(historyResult.data.created_at);
        const loaded: ChatMessage[] = (historyResult.data.messages as Message[]).map((m, i) => ({
          id: `history-${i}`,
          role: m.role,
          content: m.content,
          timestamp: ts,
        }));
        setMessages(loaded);
      }

      setConversationCount(countResult.count ?? 0);
      setLoadingHistory(false);
    }

    init();
  }, [user?.id]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isTyping) return;

    if (!isPremium && conversationCount >= FREE_MONTHLY_LIMIT) {
      setShowPaywall(true);
      return;
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);
    scrollToBottom();

    const apiMessages: Message[] = [...messages, userMsg].map(({ role, content }) => ({
      role,
      content,
    }));

    try {
      const result = await sendAiMessage(apiMessages);
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setConversationCount((c) => c + 1);
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      const isLimitError = msg.includes('LIMIT_REACHED') || err?.status === 403;
      const isUnavailable = msg.includes('SERVICE_UNAVAILABLE') || err?.status === 503;

      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: isLimitError
          ? 'Vous avez atteint votre limite de 3 conversations ce mois-ci. Passez premium pour continuer.'
          : isUnavailable
          ? 'Le service IA est temporairement indisponible. Réessayez dans quelques instants.'
          : "Je suis désolé, une erreur s'est produite. Réessayez dans un instant.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      if (isLimitError) setShowPaywall(true);
    } finally {
      setIsTyping(false);
      scrollToBottom();
    }
  }, [inputText, isTyping, isPremium, conversationCount, messages, scrollToBottom]);

  const remaining = Math.max(0, FREE_MONTHLY_LIMIT - conversationCount);

  if (loadingHistory) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <View style={styles.avatarDot} />
          <View>
            <Text style={styles.headerTitle}>Compagnon IA</Text>
            <Text style={styles.headerSubtitle}>Toujours disponible</Text>
          </View>
        </View>
        {!isPremium && !loadingHistory && (
          <View style={[styles.counterBadge, remaining === 0 && styles.counterBadgeEmpty]}>
            <Text style={[styles.counterText, remaining === 0 && styles.counterTextEmpty]}>
              {remaining} / {FREE_MONTHLY_LIMIT} ce mois
            </Text>
          </View>
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={scrollToBottom}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            isTyping ? (
              <View style={styles.typingWrapper}>
                <View style={styles.typingBubble}>
                  <TypingIndicator />
                </View>
              </View>
            ) : null
          }
        />

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Écrivez votre message..."
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || isTyping) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || isTyping}
            activeOpacity={0.8}
          >
            {isTyping ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.sendButtonIcon}>→</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.disclaimer}>
          Ce compagnon IA ne remplace pas un professionnel de santé.
        </Text>
      </KeyboardAvoidingView>

      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSuccess={() => {
          setShowPaywall(false);
          setIsPremium(true);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    marginRight: -2,
  },
  avatarDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.success,
    marginTop: 1,
  },
  counterBadge: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  counterBadgeEmpty: {
    backgroundColor: '#FEF2F2',
  },
  counterText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  counterTextEmpty: {
    color: Colors.danger,
  },
  keyboardView: {
    flex: 1,
  },
  messageList: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  typingWrapper: {
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  typingBubble: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendButtonDisabled: {
    backgroundColor: Colors.border,
  },
  sendButtonIcon: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  disclaimer: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: Colors.surface,
  },
});
