import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

const LAS_VEGAS = '36.1699,-115.1398';
const MAX_QUERY_LENGTH = 120;
const MAX_SESSION_TOKEN_LENGTH = 160;

type FoursquareResult = {
  fsq_place_id?: string;
  name?: string;
  location?: {
    address?: string;
    formatted_address?: string;
    locality?: string;
    region?: string;
    postcode?: string;
    country?: string;
  };
};

type GeoapifyResult = {
  place_id?: string;
  name?: string;
  address_line1?: string;
  address_line2?: string;
  formatted?: string;
};

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const auth = await verifySupabaseJwt(req.headers.get('Authorization'));
  if (isAuthError(auth)) return errorResponse(auth.error, auth.status);

  const body = await req.json().catch(() => null);
  const query = cleanText(body?.query);
  const sessionToken = cleanText(body?.sessionToken);
  if (query.length < 3) return errorResponse('Type at least 3 characters', 400);
  if (query.length > MAX_QUERY_LENGTH) return errorResponse('Location search is too long', 400);
  if (sessionToken.length > MAX_SESSION_TOKEN_LENGTH) return errorResponse('Invalid search session', 400);

  const foursquareKey = Deno.env.get('FOURSQUARE_PLACES_API_KEY') ?? '';
  const geoapifyKey = Deno.env.get('GEOAPIFY_API_KEY') ?? '';
  if (!foursquareKey && !geoapifyKey) {
    console.error('No location search provider is configured');
    return errorResponse('Place search is not configured', 503);
  }

  const providerRequests: Promise<{ provider: string; response: Response | null }>[] = [];
  if (foursquareKey) {
    const url = new URL('https://places-api.foursquare.com/places/search');
    url.searchParams.set('query', query);
    url.searchParams.set('ll', LAS_VEGAS);
    url.searchParams.set('radius', '100000');
    url.searchParams.set('limit', '6');
    providerRequests.push(fetch(url, {
      headers: {
        Authorization: `Bearer ${foursquareKey}`,
        'X-Places-Api-Version': '2025-06-17',
      },
    }).then((response) => ({ provider: 'Foursquare', response })).catch((error) => {
      console.error('Foursquare request failed:', error);
      return { provider: 'Foursquare', response: null };
    }));
  }

  if (geoapifyKey) {
    const url = new URL('https://api.geoapify.com/v1/geocode/autocomplete');
    url.searchParams.set('text', query);
    url.searchParams.set('filter', 'countrycode:us');
    url.searchParams.set('bias', 'proximity:-115.1398,36.1699');
    url.searchParams.set('limit', '6');
    url.searchParams.set('format', 'json');
    url.searchParams.set('apiKey', geoapifyKey);
    providerRequests.push(fetch(url).then((response) => ({ provider: 'Geoapify', response })).catch((error) => {
      console.error('Geoapify request failed:', error);
      return { provider: 'Geoapify', response: null };
    }));
  }

  const responses = await Promise.all(providerRequests);
  const foursquareResponse = responses.find((item) => item.provider === 'Foursquare')?.response;
  const geoapifyResponse = responses.find((item) => item.provider === 'Geoapify')?.response;

  if (foursquareResponse && !foursquareResponse.ok) {
    const providerError = cleanText(await foursquareResponse.clone().text());
    console.error('Foursquare returned:', foursquareResponse.status, providerError.slice(0, 500));
  }
  if (geoapifyResponse && !geoapifyResponse.ok) {
    const providerError = cleanText(await geoapifyResponse.clone().text());
    console.error('Geoapify returned:', geoapifyResponse.status, providerError.slice(0, 500));
  }

  const foursquarePayload = foursquareResponse?.ok
    ? await foursquareResponse.json().catch(() => ({ results: [] }))
    : { results: [] };
  const geoapifyPayload = geoapifyResponse?.ok
    ? await geoapifyResponse.json().catch(() => ({ results: [] }))
    : { results: [] };

  const foursquareResults: FoursquareResult[] = Array.isArray(foursquarePayload?.results)
    ? foursquarePayload.results
    : [];
  const results = foursquareResults.flatMap((result, index) => {
    const label = cleanText(result.name);
    const location = result.location;
    const detail = cleanText(location?.formatted_address) || cleanText([
      location?.address,
      location?.locality,
      location?.region,
      location?.postcode,
      location?.country,
    ].filter(Boolean).join(', '));
    if (!label) return [];
    const value = detail && !label.toLocaleLowerCase().includes(detail.toLocaleLowerCase())
      ? `${label}, ${detail}`
      : label;
    return [{
      id: cleanText(result.fsq_place_id) || `foursquare:${label}:${index}`,
      label,
      detail: detail || undefined,
      value,
      source: 'foursquare',
    }];
  });

  const geoapifyResults: GeoapifyResult[] = Array.isArray(geoapifyPayload?.results)
    ? geoapifyPayload.results
    : [];
  for (const [index, result] of geoapifyResults.entries()) {
    const label = cleanText(result.name || result.address_line1 || result.formatted);
    const detail = cleanText(result.address_line2 || result.formatted);
    if (!label) continue;
    const value = cleanText(result.formatted) || (detail ? `${label}, ${detail}` : label);
    const duplicate = results.some((item) => item.value.toLocaleLowerCase() === value.toLocaleLowerCase());
    if (duplicate) continue;
    results.push({
      id: cleanText(result.place_id) || `geoapify:${label}:${index}`,
      label,
      detail: detail && detail !== label ? detail : undefined,
      value,
      source: 'geoapify',
    });
  }

  if (!foursquareResponse?.ok && !geoapifyResponse?.ok) {
    return errorResponse('Place search is temporarily unavailable', 502);
  }

  return jsonResponse({ results: results.slice(0, 6) });
});
