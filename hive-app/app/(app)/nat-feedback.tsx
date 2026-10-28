import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { AppHeader } from '../../components/navigation';
import { useAuth } from '../../lib/hooks/useAuth';
import { supabase } from '../../lib/supabase';
const NAT = 'd85dd42e-81fc-4b4c-8f3a-b2cf39c76359';
const fields = [['member_goal','Goal'],['member_support','Support'],['member_value','HIVE feedback'],['member_next_year','Next year']];
export default function NatFeedback() {
 const { profile } = useAuth(); const router=useRouter();
 const [rows,setRows]=useState<any[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState(false);
 const load=useCallback(async()=>{
  if(profile?.id!==NAT){setLoading(false);return;}
  setLoading(true);setError(false);
  const result=await (supabase as any).from('nat_check_in_feedback').select('source_id,answers,updated_at,profiles!user_id(name)').eq('source_table','check_in_completions').order('updated_at',{ascending:false});
  if(result.error)setError(true);else setRows(result.data??[]);setLoading(false);
 },[profile?.id]);
 useEffect(()=>{void load();},[load]);
 return <View style={{flex:1,backgroundColor:'#faf8f0'}}><AppHeader title="Private feedback" tone="wide" />
 <ScrollView contentContainerStyle={{padding:20,gap:14}}>
 <Pressable accessibilityRole="button" onPress={()=>router.back()} style={{padding:12}}><Text>Back</Text></Pressable>
 {profile?.id!==NAT?<Text>This page is for Nat.</Text>:<>
 <Text style={{color:'#665c4b'}}>Personal check-in answers shared with you.</Text>
 {loading?<ActivityIndicator/>:error?<Pressable onPress={()=>void load()}><Text>Could not load feedback. Tap to retry.</Text></Pressable>:rows.length?rows.map(row=><View key={row.source_id} style={{backgroundColor:'white',borderWidth:1,borderColor:'#eadfc9',borderRadius:14,padding:16,gap:10}}>
 <Text style={{fontSize:18,fontWeight:'bold'}}>{row.profiles?.name??'HIVE member'}</Text>
 {fields.filter(([key])=>row.answers?.[key]).map(([key,label])=><View key={key}><Text style={{fontWeight:'bold'}}>{label}</Text><Text selectable>{String(row.answers[key])}</Text></View>)}
 </View>):<Text>No personal answers submitted yet.</Text>}
 </>}
 </ScrollView></View>;
}
