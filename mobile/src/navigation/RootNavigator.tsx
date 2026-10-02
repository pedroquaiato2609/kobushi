import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View } from 'react-native';
import { Icon, type IconName } from '../components/Icon';
import { useAuth } from '../auth/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { ChatScreen } from '../screens/chat/ChatScreen';
import { colors } from '../theme';
import { FinanceStack } from './FinanceStack';
import { GymStack } from './GymStack';
import { ReadingStack } from './ReadingStack';

// Cada módulo é uma aba. Finanças, Leitura e Academia têm sua própria pilha de navegação (lista →
// detalhe/treino ativo/cadastro); o Assistente é uma tela só.
export type RootTabParamList = { Financas: undefined; Leitura: undefined; Academia: undefined; Assistente: undefined };
const Tab = createBottomTabNavigator<RootTabParamList>();

const TAB_ICON: Record<keyof RootTabParamList, IconName> = { Financas: 'wallet', Leitura: 'book', Academia: 'dumbbell', Assistente: 'sparkles' };
const TAB_LABEL: Record<keyof RootTabParamList, string> = { Financas: 'Finanças', Leitura: 'Leitura', Academia: 'Academia', Assistente: 'Assistente' };

function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        tabBarIcon: ({ color, size }) => <Icon name={TAB_ICON[route.name]} size={size} color={color} />,
        tabBarLabel: TAB_LABEL[route.name],
      })}
    >
      <Tab.Screen name="Financas" component={FinanceStack} />
      <Tab.Screen name="Leitura" component={ReadingStack} />
      <Tab.Screen name="Academia" component={GymStack} />
      <Tab.Screen name="Assistente" component={ChatScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { booting, user } = useAuth();
  if (booting) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }
  if (!user) return <LoginScreen />;
  return (
    <NavigationContainer>
      <AppTabs />
    </NavigationContainer>
  );
}
