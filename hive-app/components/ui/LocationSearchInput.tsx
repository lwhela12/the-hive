import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { FIELD_LOOK } from './Input';

const MIN_SEARCH_LENGTH = 3;
const SEARCH_DELAY_MS = 550;
const MAX_RESULTS = 6;

export type LocationSuggestion = {
  id: string;
  label: string;
  detail?: string;
  value: string;
  source: 'history' | 'foursquare' | 'geoapify';
};

type LocationSearchResponse = {
  results?: LocationSuggestion[];
};

type LocationSearchInputProps = Pick<
  TextInputProps,
  'accessibilityLabel' | 'autoFocus' | 'placeholder' | 'testID'
> & {
  value: string;
  onChangeText: (value: string) => void;
  knownLocations?: string[];
  label?: string;
  disabled?: boolean;
  onSubmit?: () => void;
  canSubmit?: boolean;
  containerClassName?: string;
};

const resultCache = new Map<string, LocationSuggestion[]>();

function normalizeKey(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function newSessionToken() {
  return `hive-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function mergeLocationSuggestions(
  knownLocations: string[],
  remoteResults: LocationSuggestion[],
  query: string
) {
  const normalizedQuery = normalizeKey(query);
  const merged: LocationSuggestion[] = [];
  const seen = new Set<string>();

  for (const place of knownLocations) {
    const trimmed = place.trim();
    const key = normalizeKey(trimmed);
    if (!trimmed || key === normalizedQuery || (normalizedQuery && !key.includes(normalizedQuery))) continue;
    seen.add(key);
    merged.push({ id: `history:${key}`, label: trimmed, value: trimmed, source: 'history' });
  }

  for (const result of remoteResults) {
    const key = normalizeKey(result.value);
    if (!key || key === normalizedQuery || seen.has(key)) continue;
    seen.add(key);
    merged.push(result);
  }

  return merged.slice(0, MAX_RESULTS);
}

/**
 * One location field everywhere HIVE makes or edits an event.
 *
 * A location is a search, so it deliberately has neither a microphone nor a
 * paperclip. Places a HIVE already used appear instantly; a signed-in lookup
 * adds real venues and addresses after the member pauses typing. Manual text
 * always remains valid when a place is informal or the lookup is unavailable.
 */
export function LocationSearchInput({
  value,
  onChangeText,
  knownLocations = [],
  label,
  disabled = false,
  onSubmit,
  canSubmit = true,
  containerClassName = 'mb-4',
  accessibilityLabel,
  placeholder = 'Search for a place or address',
  autoFocus,
  testID,
}: LocationSearchInputProps) {
  const [remoteResults, setRemoteResults] = useState<LocationSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [selectedValue, setSelectedValue] = useState('');
  const requestId = useRef(0);
  const sessionToken = useRef(newSessionToken());
  const query = value.trim().replace(/\s+/g, ' ');

  useEffect(() => {
    const normalizedQuery = normalizeKey(query);
    if (query.length < MIN_SEARCH_LENGTH || normalizedQuery === normalizeKey(selectedValue)) {
      setSearching(false);
      setLookupFailed(false);
      setRemoteResults([]);
      return;
    }

    const cached = resultCache.get(normalizedQuery);
    if (cached) {
      setRemoteResults(cached);
      setLookupFailed(false);
      return;
    }

    const currentRequest = ++requestId.current;
    const timeout = setTimeout(async () => {
      setSearching(true);
      setLookupFailed(false);
      const { data, error } = await supabase.functions.invoke<LocationSearchResponse>('location-search', {
        body: { query, sessionToken: sessionToken.current },
      });
      if (currentRequest !== requestId.current) return;

      setSearching(false);
      if (error) {
        setRemoteResults([]);
        setLookupFailed(true);
        return;
      }

      const results = Array.isArray(data?.results) ? data.results : [];
      resultCache.set(normalizedQuery, results);
      setRemoteResults(results);
    }, SEARCH_DELAY_MS);

    return () => {
      clearTimeout(timeout);
      requestId.current += 1;
    };
  }, [query, selectedValue]);

  const suggestions = useMemo(
    () => mergeLocationSuggestions(knownLocations, remoteResults, query),
    [knownLocations, query, remoteResults]
  );
  const hasFoursquareResults = suggestions.some((suggestion) => suggestion.source === 'foursquare');
  const hasGeoapifyResults = suggestions.some((suggestion) => suggestion.source === 'geoapify');

  const chooseLocation = (suggestion: LocationSuggestion) => {
    setSelectedValue(suggestion.value);
    setRemoteResults([]);
    setLookupFailed(false);
    onChangeText(suggestion.value);
    sessionToken.current = newSessionToken();
    Keyboard.dismiss();
  };

  return (
    <View className={containerClassName} style={{ zIndex: 2 }}>
      {label ? (
        <Text style={{ fontFamily: FIELD_LOOK.labelFont, color: FIELD_LOOK.ink }} className="mb-2">
          {label}
        </Text>
      ) : null}
      <View style={{ position: 'relative' }}>
        <TextInput
          value={value}
          onChangeText={(next) => {
            setSelectedValue('');
            onChangeText(next);
          }}
          accessibilityLabel={accessibilityLabel ?? label ?? placeholder}
          placeholder={placeholder}
          placeholderTextColor={FIELD_LOOK.placeholder}
          selectionColor={FIELD_LOOK.ink}
          autoCorrect={false}
          autoCapitalize="words"
          autoFocus={autoFocus}
          editable={!disabled}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (canSubmit) onSubmit?.();
          }}
          testID={testID}
          style={{
            backgroundColor: FIELD_LOOK.fill,
            borderWidth: 1,
            borderColor: FIELD_LOOK.border,
            borderRadius: FIELD_LOOK.radius,
            paddingLeft: FIELD_LOOK.paddingHorizontal,
            paddingRight: 44,
            paddingVertical: FIELD_LOOK.paddingVertical,
            fontSize: FIELD_LOOK.fontSize,
            color: FIELD_LOOK.ink,
            fontFamily: FIELD_LOOK.font,
            outlineStyle: 'none',
            caretColor: FIELD_LOOK.ink,
          } as any}
        />
        <View
          pointerEvents="none"
          style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}
        >
          {searching ? (
            <ActivityIndicator size="small" color="#bd9348" />
          ) : (
            <Text style={{ fontSize: 15, opacity: 0.72 }}>⌖</Text>
          )}
        </View>
      </View>

      {suggestions.length > 0 ? (
        <View
          accessibilityRole="menu"
          style={{
            marginTop: 6,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: FIELD_LOOK.border,
            borderRadius: 12,
            backgroundColor: '#fffdf8',
          }}
        >
          {suggestions.map((suggestion, index) => (
            <Pressable
              key={suggestion.id}
              accessibilityRole="menuitem"
              accessibilityLabel={`Use ${suggestion.value}`}
              onPress={() => chooseLocation(suggestion)}
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                paddingVertical: 11,
                backgroundColor: pressed ? '#fdf3dc' : '#fffdf8',
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: 'rgba(189,147,72,0.16)',
              })}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: FIELD_LOOK.ink }}>
                {suggestion.label}
              </Text>
              {suggestion.detail ? (
                <Text
                  numberOfLines={2}
                  style={{ marginTop: 2, fontFamily: FIELD_LOOK.font, fontSize: 12.5, lineHeight: 17, color: '#6f6758' }}
                >
                  {suggestion.detail}
                </Text>
              ) : null}
            </Pressable>
          ))}
          {hasFoursquareResults || hasGeoapifyResults ? (
            <Text style={{ paddingHorizontal: 14, paddingVertical: 7, fontFamily: FIELD_LOOK.font, fontSize: 10.5, color: '#8a806d' }}>
              {hasFoursquareResults ? 'Places by Foursquare' : ''}
              {hasFoursquareResults && hasGeoapifyResults ? ' · ' : ''}
              {hasGeoapifyResults ? 'Addresses by Geoapify' : ''}
            </Text>
          ) : null}
        </View>
      ) : null}

      {lookupFailed ? (
        <Text style={{ marginTop: 6, fontFamily: FIELD_LOOK.font, fontSize: 12, color: '#7d725f' }}>
          Place search is taking a break. You can still type the location.
        </Text>
      ) : null}
    </View>
  );
}
