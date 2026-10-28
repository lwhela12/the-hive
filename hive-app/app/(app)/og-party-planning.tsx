import { useEffect, useState } from 'react';
import { Text, View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/hooks/useAuth';
export default function OgPartyPlanning() {
 const { communityId, wholeHive, loading, memberships, switchCommunity }=useAuth();
 const router=useRouter();const [failed,setFailed]=useState(false);
 const og=memberships.find(m=>m.community.slug==='default');
 useEffect(()=>{
  if(loading||!og)return;
  if(communityId===og.community_id&&!wholeHive){router.replace('/messages?roomId=aa209059-626e-4f58-bd9d-a17d8978ccaa' as never);return;}
  void switchCommunity(og.community_id).catch(()=>setFailed(true));
 },[loading,og?.community_id,communityId,wholeHive,router,switchCommunity]);
 return <View style={{flex:1,padding:24,justifyContent:'center'}}>{failed||(!loading&&!og)?<Text>OG HIVE membership is required to open this chat.</Text>:<><ActivityIndicator/><Text>Opening OG HIVE planning…</Text></>}</View>;
}
