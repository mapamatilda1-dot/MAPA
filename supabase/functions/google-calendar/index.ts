import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CLIENT_EMAIL  = Deno.env.get('GOOGLE_CLIENT_EMAIL')!;
const PRIVATE_KEY   = Deno.env.get('GOOGLE_PRIVATE_KEY')!;
const CALENDAR_ID   = Deno.env.get('GOOGLE_CALENDAR_ID')!;

// ── JWT para Google Service Account ──────────────────────────
async function getAccessToken(): Promise<string> {
  const now   = Math.floor(Date.now() / 1000);
  const claim = {
    iss:   CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  };

  // Encode header + payload
  const header  = btoa(JSON.stringify({ alg:'RS256', typ:'JWT' })).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const payload = btoa(JSON.stringify(claim)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const input   = `${header}.${payload}`;

  // Import private key
  const pemContents = PRIVATE_KEY
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\\n/g, '')
    .replace(/\n/g, '')
    .trim();

  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey,
    { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' },
    false, ['sign']
  );

  // Sign
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(input)
  );
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');

  const jwt = `${input}.${sig}`;

  // Exchange JWT for access token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type':'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('No access token: ' + JSON.stringify(data));
  return data.access_token;
}

serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    }});
  }

  try {
    const url    = new URL(req.url);
    const days   = parseInt(url.searchParams.get('days') || '60');
    const token  = await getAccessToken();

    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + days * 86400000).toISOString();
    const calUrl  = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=100`;

    const res  = await fetch(calUrl, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();

    if (!res.ok) throw new Error(JSON.stringify(data));

    const events = (data.items || []).map((e: any) => ({
      id:          e.id,
      title:       e.summary || '(Sin título)',
      description: e.description || '',
      location:    e.location || '',
      start:       e.start?.date || e.start?.dateTime?.slice(0,10),
      end:         e.end?.date   || e.end?.dateTime?.slice(0,10),
      allDay:      !!e.start?.date,
      htmlLink:    e.htmlLink || '',
    }));

    return new Response(JSON.stringify({ ok:true, events }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });

  } catch (err) {
    console.error('Google Calendar error:', err);
    return new Response(JSON.stringify({ ok:false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' }
    });
  }
});
