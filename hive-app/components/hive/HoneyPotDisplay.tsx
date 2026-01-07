import { View, Text } from 'react-native';

interface HoneyPotDisplayProps {
  balance: number;
}

export function HoneyPotDisplay({ balance }: HoneyPotDisplayProps) {
  const formattedBalance = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(balance);

  return (
    <View className="bg-gold-light rounded-xl p-4 flex-row items-center">
      <Text className="text-4xl mr-4">🍯</Text>
      <View>
        <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-sm text-gold">Honey Pot</Text>
        <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-2xl text-charcoal">
          {formattedBalance}
        </Text>
      </View>
    </View>
  );
}
