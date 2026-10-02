import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BookDetailScreen } from '../screens/reading/BookDetailScreen';
import { ReadingScreen } from '../screens/reading/ReadingScreen';
import { colors } from '../theme';

export type ReadingStackParamList = { ReadingHome: undefined; BookDetail: { bookId: string } };
const Stack = createNativeStackNavigator<ReadingStackParamList>();

export function ReadingStack() {
  return (
    <Stack.Navigator screenOptions={{ headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.surface }, headerShadowVisible: false }}>
      <Stack.Screen name="ReadingHome" component={ReadingScreen} options={{ headerShown: false }} />
      <Stack.Screen name="BookDetail" component={BookDetailScreen} options={{ title: '' }} />
    </Stack.Navigator>
  );
}
