import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { GymActive, GymExercise } from '../api/types';
import { ActiveWorkoutScreen } from '../screens/gym/ActiveWorkoutScreen';
import { ExerciseLibraryScreen } from '../screens/gym/ExerciseLibraryScreen';
import { ExercisePickerScreen } from '../screens/gym/ExercisePickerScreen';
import { FinishWorkoutScreen } from '../screens/gym/FinishWorkoutScreen';
import { NewExerciseScreen } from '../screens/gym/NewExerciseScreen';
import { NewWorkoutScreen } from '../screens/gym/NewWorkoutScreen';
import { WorkoutsScreen } from '../screens/gym/WorkoutsScreen';
import { colors } from '../theme';

export type GymStackParamList = {
  WorkoutsHome: undefined;
  ActiveWorkout: undefined;
  FinishWorkout: { active: GymActive };
  ExercisePicker: { exclude: string[]; onPick: (e: GymExercise) => void };
  NewExercise: { exercise?: GymExercise } | undefined;
  ExerciseLibrary: undefined;
  NewWorkout: undefined;
};
const Stack = createNativeStackNavigator<GymStackParamList>();

export function GymStack() {
  return (
    <Stack.Navigator screenOptions={{ headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.surface }, headerShadowVisible: false }}>
      <Stack.Screen name="WorkoutsHome" component={WorkoutsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ActiveWorkout" component={ActiveWorkoutScreen} options={{ title: 'Treino em andamento' }} />
      <Stack.Screen name="FinishWorkout" component={FinishWorkoutScreen} options={{ title: 'Finalizar treino', presentation: 'modal' }} />
      <Stack.Screen name="ExercisePicker" component={ExercisePickerScreen} options={{ title: 'Adicionar exercício', presentation: 'modal' }} />
      <Stack.Screen name="NewExercise" component={NewExerciseScreen} options={({ route }) => ({ title: route.params?.exercise ? 'Editar exercício' : 'Novo exercício', presentation: 'modal' })} />
      <Stack.Screen name="ExerciseLibrary" component={ExerciseLibraryScreen} options={{ title: 'Exercícios' }} />
      <Stack.Screen name="NewWorkout" component={NewWorkoutScreen} options={{ title: 'Novo treino', presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
