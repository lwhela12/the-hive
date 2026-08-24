import { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ComposerBar } from '../ui/ComposerBar';
import { CloseButton } from '../ui/CloseButton';
import { FIELD_LOOK } from '../ui/Input';
import { ThinkingBee } from '../ui/ThinkingBee';
import {
  HONEY_POT_PAYMENT_METHOD_OPTIONS,
  recordHoneyPotTransaction,
  type HoneyPotPaymentMethod,
  type HoneyPotTransactionType,
} from '../../lib/honeyPot';
import { userFacingError } from '../../lib/userFacingError';

/**
 * Money in, money out — on the Honey Pot page where the pot is.
 *
 * Recording used to live in Admin, which meant a treasurer who isn't an admin
 * had to walk through a door marked settings to write down that somebody handed
 * them twenty dollars (Nat 2026-08-01). The ledger was always public; only the
 * pen was behind the wrong door.
 */
export function RecordHoneyPotModal({
  visible,
  communityId,
  recordedBy,
  onClose,
  onRecorded,
}: {
  visible: boolean;
  communityId: string;
  recordedBy: string | null;
  onClose: () => void;
  onRecorded: (balance: number) => void;
}) {
  const [type, setType] = useState<HoneyPotTransactionType>('deposit');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [method, setMethod] = useState<HoneyPotPaymentMethod | null>(null);
  const [fromWhom, setFromWhom] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setType('deposit'); setAmount(''); setNote('');
    setMethod(null); setFromWhom(''); setError(null);
  };

  const close = () => { reset(); onClose(); };

  const save = async () => {
    const value = Number(amount.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(value) || value <= 0) {
      setError('How much? A number above zero.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { balance } = await recordHoneyPotTransaction({
        communityId,
        // Withdrawals go in negative — the ledger adds everything up.
        signedAmount: type === 'deposit' ? value : -value,
        transactionType: type,
        note,
        paymentMethod: method,
        externalCounterpartyName: fromWhom.trim() || null,
        recordedBy,
        relatedUserId: null,
        duesYear: null,
        duesQuarter: null,
        duesCoveredQuarters: null,
        fallbackDuesLabel: null,
      });
      onRecorded(balance);
      close();
    } catch (err) {
      setError(userFacingError(err, 'Nothing was recorded. Your details are still here — try again.'));
    } finally {
      setSaving(false);
    }
  };

  const pill = (selected: boolean) => ({
    backgroundColor: selected ? '#fdf3dc' : '#faf8f3',
    borderWidth: 1,
    borderColor: selected ? 'rgba(222,193,129,0.8)' : 'rgba(222,193,129,0.28)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(49,49,48,0.45)', justifyContent: 'flex-end' }}>
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#fffdf5', borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '92%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 18, paddingBottom: 8 }}>
            <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 18, color: '#313130', flex: 1 }}>
              Record a transaction
            </Text>
            <CloseButton onPress={close} color="#8e7a5e" />
          </View>

          <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 16 }}>
            <View style={{ gap: 8 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#8a6b30' }}>Which way?</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['deposit', 'withdrawal'] as HoneyPotTransactionType[]).map((t) => (
                  <Pressable key={t} onPress={() => setType(t)} style={pill(type === t)}>
                    <Text style={{ fontFamily: type === t ? 'Lato_700Bold' : 'Lato_400Regular', fontSize: 14, color: type === t ? '#8a6b30' : '#6b7280' }}>
                      {t === 'deposit' ? 'Money in' : 'Money out'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#8a6b30' }}>How much?</Text>
              {/* Money, so no microphone — nobody dictates "twenty dollars
                  forty-two" into a number pad. It still wears the same white
                  fill, hairline and placeholder ink as every box in the app so
                  the controls read as one set. */}
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={FIELD_LOOK.placeholder}
                selectionColor={FIELD_LOOK.ink}
                keyboardType="decimal-pad"
                style={{
                  fontFamily: FIELD_LOOK.font, fontSize: FIELD_LOOK.fontSize, color: FIELD_LOOK.ink,
                  backgroundColor: FIELD_LOOK.fill, borderWidth: 1, borderColor: FIELD_LOOK.border,
                  borderRadius: FIELD_LOOK.radius,
                  paddingHorizontal: FIELD_LOOK.paddingHorizontal,
                  paddingVertical: FIELD_LOOK.paddingVertical,
                }}
              />
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#8a6b30' }}>How did it move?</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {HONEY_POT_PAYMENT_METHOD_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    onPress={() => setMethod(method === option.value ? null : option.value)}
                    style={pill(method === option.value)}
                  >
                    <Text style={{ fontFamily: method === option.value ? 'Lato_700Bold' : 'Lato_400Regular', fontSize: 13, color: method === option.value ? '#8a6b30' : '#6b7280' }}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#8a6b30' }}>
                {type === 'deposit' ? 'Who from?' : 'Who to?'}
              </Text>
              {/* A person's name is words — you should be able to say it. */}
              <ComposerBar
                variant="form"
                tone="light"
                value={fromWhom}
                onChangeText={setFromWhom}
                placeholder="Optional"
                multiline={false}
                onSubmit={save}
                canSubmit={!saving}
                submitting={saving}
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#8a6b30' }}>What was it for?</Text>
              {/* The mic used to sit on a strip UNDER this box. It is inside the
                  border now, on the same footer as everywhere else. */}
              <ComposerBar
                variant="form"
                tone="light"
                value={note}
                onChangeText={setNote}
                placeholder="Shelter donation, Q3 dues, pizza…"
                minHeight={74}
                onSubmit={save}
                canSubmit={!saving}
                submitting={saving}
              />
            </View>

            {error ? (
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#b91c1c' }}>{error}</Text>
            ) : null}

            <Pressable
              onPress={save}
              disabled={saving}
              style={{
                backgroundColor: '#bd9348', borderRadius: 999, paddingVertical: 15,
                alignItems: 'center', opacity: saving ? 0.6 : 1,
              }}
            >
              {saving
                ? <ThinkingBee />
                : <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#fffdf5' }}>Write it down</Text>}
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
