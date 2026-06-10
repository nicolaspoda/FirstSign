import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';
import { Colors } from '@/constants/colors';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<string, { focused: IoniconsName; outline: IoniconsName }> = {
  index:   { focused: 'home',       outline: 'home-outline' },
  history: { focused: 'time',       outline: 'time-outline' },
  plan:    { focused: 'calendar',   outline: 'calendar-outline' },
  chat:    { focused: 'chatbubble', outline: 'chatbubble-outline' },
  profile: { focused: 'person',     outline: 'person-outline' },
};

function tabIcon(name: keyof typeof TAB_ICONS) {
  return ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons
      name={focused ? TAB_ICONS[name].focused : TAB_ICONS[name].outline}
      size={24}
      color={color as string}
    />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
        },
      }}
    >
      <Tabs.Screen name="index"   options={{ title: 'Accueil',    tabBarIcon: tabIcon('index') }} />
      <Tabs.Screen name="history" options={{ title: 'Historique', tabBarIcon: tabIcon('history') }} />
      <Tabs.Screen name="plan"    options={{ title: 'Plan',       tabBarIcon: tabIcon('plan') }} />
      <Tabs.Screen name="chat"    options={{ title: 'Chat',       tabBarIcon: tabIcon('chat') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil',     tabBarIcon: tabIcon('profile') }} />
    </Tabs>
  );
}
