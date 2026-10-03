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
import { MoreStack } from './MoreStack';

// Cada módulo é uma aba. Finanças, Leitura e Academia têm sua própria pilha de navegação (lista →
// detalhe/treino ativo/cadastro); o Assistente é uma tela só. "Mais" segue o mesmo padrão do app web
// (lá, os itens não marcados como `primary` ficam num menu "Mais" em vez de ocupar a barra inferior):
// Agenda, Atividades, Lembretes, Deslocamentos, Princípios, Estudos, Kanban e Documentos moram lá dentro,
// porque 9 abas na barra inferior não caberiam/ficariam ilegíveis num celular.
export type RootTabParamList = { Financas: undefined; Leitura: undefined; Academia: undefined; Mais: undefined; Assistente: undefined };
const Tab = createBottomTabNavigator<RootTabParamList>();

const TAB_ICON: Record<keyof RootTabParamList, IconName> = { Financas: 'wallet', Leitura: 'book', Academia: 'dumbbell', Mais: 'more', Assistente: 'sparkles' };
const TAB_LABEL: Record<keyof RootTabParamList, string> = { Financas: 'Finanças', Leitura: 'Leitura', Academia: 'Academia', Mais: 'Mais', Assistente: 'Assistente' };

function AppTabs() {
  return (
    <Tab.Navigator
      // NOTA: `detachInactiveScreens={false}` foi tentado aqui como correção pro bug de troca de
      // aba (ver README) — revertido porque, testado num aparelho de verdade, deixou o app mais
      // lento e outras abas pararam de carregar (manter todas as pilhas de navegação montadas o
      // tempo todo pesa demais; aqui tem 5 abas, cada uma com várias telas, não é como os apps
      // pequenos onde esse ajuste costuma ser indicado). Voltando pro padrão da biblioteca
      // (detach ligado no Android) até achar a causa raiz de verdade.
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
      <Tab.Screen name="Mais" component={MoreStack} />
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
