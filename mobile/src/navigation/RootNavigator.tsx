import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { DashboardScreen } from '../screens/DashboardScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { colors } from '../theme';
import { GymStack } from './GymStack';
import { ReadingStack } from './ReadingStack';

// Cada módulo é uma aba — Finanças ainda não tem telas de detalhe, por isso vai direto; Leitura e
// Academia têm sua própria pilha de navegação (lista → detalhe/treino ativo).
export type RootTabParamList = { Financas: undefined; Leitura: undefined; Academia: undefined };
const Tab = createBottomTabNavigator<RootTabParamList>();

const TAB_ICON: Record<keyof RootTabParamList, string> = { Financas: '💰', Leitura: '📚', Academia: '🏋️' };
const TAB_LABEL: Record<keyof RootTabParamList, string> = { Financas: 'Finanças', Leitura: 'Leitura', Academia: 'Academia' };

function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        tabBarIcon: () => <Text style={{ fontSize: 20 }}>{TAB_ICON[route.name]}</Text>,
        tabBarLabel: TAB_LABEL[route.name],
      })}
    >
      <Tab.Screen name="Financas" component={DashboardScreen} />
      <Tab.Screen name="Leitura" component={ReadingStack} />
      <Tab.Screen name="Academia" component={GymStack} />
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
