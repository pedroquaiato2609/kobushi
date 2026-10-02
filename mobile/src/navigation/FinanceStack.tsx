import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { FinCategory, FinRecurring, FinTransaction } from '../api/types';
import { DashboardScreen } from '../screens/DashboardScreen';
import { AccountsScreen } from '../screens/finance/AccountsScreen';
import { CategoriesScreen } from '../screens/finance/CategoriesScreen';
import { NewAccountScreen } from '../screens/finance/NewAccountScreen';
import { NewCategoryScreen } from '../screens/finance/NewCategoryScreen';
import { NewRecurringScreen } from '../screens/finance/NewRecurringScreen';
import { NewTransactionScreen } from '../screens/finance/NewTransactionScreen';
import { RecurringScreen } from '../screens/finance/RecurringScreen';
import { TransactionsScreen } from '../screens/finance/TransactionsScreen';
import { colors } from '../theme';

export type FinanceStackParamList = {
  Dashboard: undefined;
  NewTransaction: { transaction?: FinTransaction } | undefined;
  Transactions: undefined;
  Accounts: undefined;
  NewAccount: { accountId?: string } | undefined;
  Recurring: undefined;
  NewRecurring: { recurring?: FinRecurring; kind?: 'expense' | 'income' } | undefined;
  Categories: undefined;
  NewCategory: { category?: FinCategory } | undefined;
};
const Stack = createNativeStackNavigator<FinanceStackParamList>();

export function FinanceStack() {
  return (
    <Stack.Navigator screenOptions={{ headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.surface }, headerShadowVisible: false }}>
      <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ headerShown: false }} />
      <Stack.Screen name="NewTransaction" component={NewTransactionScreen} options={({ route }) => ({ title: route.params?.transaction ? 'Editar movimentação' : 'Nova movimentação', presentation: 'modal' })} />
      <Stack.Screen name="Transactions" component={TransactionsScreen} options={{ title: 'Movimentações' }} />
      <Stack.Screen name="Accounts" component={AccountsScreen} options={{ title: 'Contas' }} />
      <Stack.Screen name="NewAccount" component={NewAccountScreen} options={({ route }) => ({ title: route.params?.accountId ? 'Editar conta' : 'Nova conta', presentation: 'modal' })} />
      <Stack.Screen name="Recurring" component={RecurringScreen} options={{ title: 'Minha renda / Recorrências' }} />
      <Stack.Screen name="NewRecurring" component={NewRecurringScreen} options={({ route }) => ({ title: route.params?.recurring ? 'Editar' : 'Nova', presentation: 'modal' })} />
      <Stack.Screen name="Categories" component={CategoriesScreen} options={{ title: 'Categorias' }} />
      <Stack.Screen name="NewCategory" component={NewCategoryScreen} options={({ route }) => ({ title: route.params?.category ? 'Editar categoria' : 'Nova categoria', presentation: 'modal' })} />
    </Stack.Navigator>
  );
}
