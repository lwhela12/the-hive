import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChatInterface } from '../../components/chat/ChatInterface';

export default function ChatScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <ChatInterface />
    </SafeAreaView>
  );
}
