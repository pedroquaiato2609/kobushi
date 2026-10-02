import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { GymExercise } from '../api/types';
import { ActiveWorkoutScreen } from '../screens/gym/ActiveWorkoutScreen';
import { ExercisePickerScreen } from '../screens/gym/ExercisePickerScreen';
import { WorkoutsScreen } from '../screens/gym/WorkoutsScreen';
import { colors } from '../theme';

export type GymStackParamList = {
  WorkoutsHome: undefined;
  ActiveWorkout: undefined;
  ExercisePicker: { exclude: string[]; onPick: (e: GymExercise) => void };
};
const Stack = createNativeStackNavigator<GymStackParamList>();

export function GymStack() {
  return (
    <Stack.Navigator screenOptions={{ headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.surface }, headerShadowVisible: false }}>
      <Stack.Screen name="WorkoutsHome" component={WorkoutsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ActiveWorkout" component={ActiveWorkoutScreen} options={{ title: 'Treino em andamento' }} />
      <Stack.Screen name="ExercisePicker" component={ExercisePickerScreen} options={{ title: 'Adicionar exercício', presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
