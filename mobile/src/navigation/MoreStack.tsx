import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { Activity, Board, Card, Commute, Principle, Reminder, StudyNoteView, StudyPlan } from '../api/types';
import { MoreMenuScreen } from '../screens/MoreMenuScreen';
import { AgendaScreen } from '../screens/agenda/AgendaScreen';
import { ActivitiesScreen } from '../screens/activities/ActivitiesScreen';
import { NewActivityScreen } from '../screens/activities/NewActivityScreen';
import { RemindersScreen } from '../screens/reminders/RemindersScreen';
import { NewReminderScreen } from '../screens/reminders/NewReminderScreen';
import { CommutesScreen } from '../screens/commutes/CommutesScreen';
import { NewCommuteScreen } from '../screens/commutes/NewCommuteScreen';
import { PrinciplesScreen } from '../screens/principles/PrinciplesScreen';
import { NewPrincipleScreen } from '../screens/principles/NewPrincipleScreen';
import { KanbanScreen } from '../screens/kanban/KanbanScreen';
import { CardDetailScreen } from '../screens/kanban/CardDetailScreen';
import { DocumentsScreen } from '../screens/documents/DocumentsScreen';
import { NewDocScreen } from '../screens/documents/NewDocScreen';
import { StudyScreen } from '../screens/study/StudyScreen';
import { NewStudyNoteScreen } from '../screens/study/NewStudyNoteScreen';
import { StudyPlanDetailScreen } from '../screens/study/StudyPlanDetailScreen';
import { colors } from '../theme';

export type MoreStackParamList = {
  MoreMenu: undefined;
  Agenda: undefined;
  Activities: undefined;
  NewActivity: { activity?: Activity } | undefined;
  Reminders: undefined;
  NewReminder: { reminder?: Reminder } | undefined;
  Commutes: undefined;
  NewCommute: { commute?: Commute } | undefined;
  Principles: undefined;
  NewPrinciple: { principle?: Principle; folderId?: string | null } | undefined;
  Kanban: undefined;
  CardDetail: { card: Card; board: Board };
  Documents: undefined;
  NewDoc: { docId?: string; createKind?: 'note' | 'list'; folderId?: string | null } | undefined;
  Study: undefined;
  NewStudyNote: { note?: StudyNoteView; folderId?: string | null } | undefined;
  StudyPlanDetail: { plan: StudyPlan };
};
const Stack = createNativeStackNavigator<MoreStackParamList>();

export function MoreStack() {
  return (
    <Stack.Navigator screenOptions={{ headerTintColor: colors.accent, headerStyle: { backgroundColor: colors.surface }, headerShadowVisible: false }}>
      <Stack.Screen name="MoreMenu" component={MoreMenuScreen} options={{ title: 'Mais', headerShown: false }} />
      <Stack.Screen name="Agenda" component={AgendaScreen} options={{ title: 'Agenda' }} />
      <Stack.Screen name="Activities" component={ActivitiesScreen} options={{ title: 'Atividades' }} />
      <Stack.Screen name="NewActivity" component={NewActivityScreen} options={({ route }) => ({ title: route.params?.activity ? 'Editar atividade' : 'Nova atividade', presentation: 'modal' })} />
      <Stack.Screen name="Reminders" component={RemindersScreen} options={{ title: 'Lembretes' }} />
      <Stack.Screen name="NewReminder" component={NewReminderScreen} options={({ route }) => ({ title: route.params?.reminder ? 'Editar lembrete' : 'Novo lembrete', presentation: 'modal' })} />
      <Stack.Screen name="Commutes" component={CommutesScreen} options={{ title: 'Deslocamentos' }} />
      <Stack.Screen name="NewCommute" component={NewCommuteScreen} options={({ route }) => ({ title: route.params?.commute ? 'Editar deslocamento' : 'Novo deslocamento', presentation: 'modal' })} />
      <Stack.Screen name="Principles" component={PrinciplesScreen} options={{ title: 'Princípios' }} />
      <Stack.Screen name="NewPrinciple" component={NewPrincipleScreen} options={({ route }) => ({ title: route.params?.principle ? 'Editar princípio' : 'Novo princípio', presentation: 'modal' })} />
      <Stack.Screen name="Kanban" component={KanbanScreen} options={{ title: 'Kanban' }} />
      <Stack.Screen name="CardDetail" component={CardDetailScreen} options={{ title: 'Card', presentation: 'modal' }} />
      <Stack.Screen name="Documents" component={DocumentsScreen} options={{ title: 'Documentos' }} />
      <Stack.Screen name="NewDoc" component={NewDocScreen} options={{ title: 'Documento', presentation: 'modal' }} />
      <Stack.Screen name="Study" component={StudyScreen} options={{ title: 'Estudos' }} />
      <Stack.Screen name="NewStudyNote" component={NewStudyNoteScreen} options={({ route }) => ({ title: route.params?.note ? 'Editar nota' : 'Nova nota', presentation: 'modal' })} />
      <Stack.Screen name="StudyPlanDetail" component={StudyPlanDetailScreen} options={{ title: 'Plano de estudo' }} />
    </Stack.Navigator>
  );
}
