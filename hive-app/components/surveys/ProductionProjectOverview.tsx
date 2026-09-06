import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { fetchProductionProjectStatus, type ProductionProjectAssignment } from '../../lib/productionProject';

type Props = { communityId: string; accent: string; isManager: boolean };

function findingsLabel(item: ProductionProjectAssignment) {
  if (item.findingCount === 0 && item.fileCount === 0) return 'No findings added yet';
  return [
    item.findingCount > 0 ? `${item.findingCount} update${item.findingCount === 1 ? '' : 's'}` : '',
    item.fileCount > 0 ? `${item.fileCount} file${item.fileCount === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(' · ');
}

export function ProductionProjectOverview({ communityId, accent, isManager }: Props) {
  const router = useRouter();
  const [assignments, setAssignments] = useState<ProductionProjectAssignment[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    if (!isManager) {
      setAssignments([]);
      setState('ready');
      return () => { active = false; };
    }
    setState('loading');
    fetchProductionProjectStatus(communityId).then((result) => {
      if (!active) return;
      setAssignments(result.assignments);
      setState(result.error ? 'error' : 'ready');
    }).catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [communityId, isManager]);

  const openThread = (postId: string) => router.push({
    pathname: '/board',
    params: { postId, from: 'beforewemeet', open: String(Date.now()) },
  });

  if (!isManager) {
    return (
      <View style={{ backgroundColor: '#fff8e8', borderRadius: 14, padding: 14, marginBottom: 16, gap: 4 }}>
        <Text style={{ fontFamily: 'Lato_700Bold', color: '#513500' }}>Your part of the production</Text>
        <Text style={{ fontFamily: 'Lato_400Regular', color: '#6b6255', lineHeight: 19 }}>
          Open each assigned job below to put your findings, photos and files in its board thread. Tick it done when the work and the record are complete.
        </Text>
      </View>
    );
  }

  const openCount = assignments.filter(item => !item.completed).length;
  const doneCount = assignments.length - openCount;
  const waitingCount = assignments.filter(item => item.findingCount === 0 && item.fileCount === 0).length;
  const visibleAssignments = expanded ? assignments : assignments.slice(0, 4);

  return (
    <View style={{ backgroundColor: '#fffdf5', borderWidth: 1, borderColor: `${accent}55`, borderRadius: 18, padding: 16, marginBottom: 18, gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 17, color: '#2d2d2d' }}>Production status</Text>
        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#6b6255', lineHeight: 19 }}>
          You’re managing the operation. This is everyone’s assigned work and the board threads where their findings live.
        </Text>
      </View>
      {assignments.length > 0 ? (
        <Text style={{ fontFamily: 'Lato_700Bold', color: accent, fontSize: 13 }}>
          {openCount} open · {doneCount} done · {waitingCount} waiting for findings
        </Text>
      ) : null}
      {state === 'loading' && <Text style={{ color: '#7f715f' }}>Gathering the team’s jobs…</Text>}
      {state === 'error' && <Text style={{ color: '#991b1b' }}>Production status could not load. Reopen this check-in to try again.</Text>}
      {state === 'ready' && assignments.length === 0 && <Text style={{ color: '#7f715f' }}>No production jobs are assigned yet.</Text>}
      {visibleAssignments.map((item) => (
        <View key={`${item.assignedTo}:${item.relatedBoardPostId}`} style={{ borderTopWidth: 1, borderTopColor: `${accent}33`, paddingTop: 11, gap: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <Ionicons name={item.completed ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={accent} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', color: '#2d2d2d', lineHeight: 19 }}>{item.description}</Text>
              <Text style={{ fontFamily: 'Lato_400Regular', color: '#6b7280', fontSize: 12 }}>
                {item.assigneeName} · {item.completed ? 'Done' : 'Still to do'} · {findingsLabel(item)}
              </Text>
              {item.latestFinding ? <Text numberOfLines={2} style={{ fontFamily: 'Lato_400Regular', color: '#6b6255', fontSize: 12, lineHeight: 17 }}>
                Latest: {item.latestFinding}
              </Text> : null}
            </View>
          </View>
          <Pressable accessibilityRole="button" onPress={() => openThread(item.relatedBoardPostId)} style={{ alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center', paddingHorizontal: 8 }}>
            <Text style={{ fontFamily: 'Lato_700Bold', color: accent, fontSize: 12 }}>Open findings thread →</Text>
          </Pressable>
        </View>
      ))}
      {assignments.length > 4 ? (
        <Pressable accessibilityRole="button" onPress={() => setExpanded(value => !value)} style={{ minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 8 }}>
          <Text style={{ fontFamily: 'Lato_700Bold', color: accent, fontSize: 13 }}>
            {expanded ? 'Show the short view' : `See all ${assignments.length} jobs`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
