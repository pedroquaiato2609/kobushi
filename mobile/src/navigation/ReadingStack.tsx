import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BookDetailScreen } from '../screens/reading/BookDetailScreen';
import { NewBookScreen } from '../screens/reading/NewBookScreen';
import { ReadingScreen } from '../screens/reading/ReadingScreen';
import { colors } from '../theme';

export type ReadingStackParamList = { ReadingHome: undefined; BookDetail: { bookId: string }; NewBook: undefined };
const Stack = createNativeStackNavigator<ReadingStackParamList>();

export function ReadingStack() {
  return (
    <Stack.Navigator screenOptions={{ headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.surface }, headerShadowVisible: false }}>
      <Stack.Screen name="ReadingHome" component={ReadingScreen} options={{ headerShown: false }} />
      <Stack.Screen name="BookDetail" component={BookDetailScreen} options={{ title: '' }} />
      <Stack.Screen name="NewBook" component={NewBookScreen} options={{ title: 'Novo livro', presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
