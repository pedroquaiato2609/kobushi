import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DashboardScreen } from '../screens/DashboardScreen';
import { NewTransactionScreen } from '../screens/finance/NewTransactionScreen';
import { colors } from '../theme';

export type FinanceStackParamList = { Dashboard: undefined; NewTransaction: undefined };
const Stack = createNativeStackNavigator<FinanceStackParamList>();

export function FinanceStack() {
  return (
    <Stack.Navigator screenOptions={{ headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.surface }, headerShadowVisible: false }}>
      <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ headerShown: false }} />
      <Stack.Screen name="NewTransaction" component={NewTransactionScreen} options={{ title: 'Nova movimentação', presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
