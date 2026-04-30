export type DbConfig = {
  url?: string;
  anonKey?: string;
  serviceRoleKey?: string;
};

const HARDCODED_URL = 'https://zlyqrrmiegtxlpifwxxv.supabase.co';
const HARDCODED_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpseXFycm1pZWd0eGxwaWZ3eHh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDkzODcsImV4cCI6MjA4NTc4NTM4N30.mbtqib3AQzhRnUT2Db9X9d5Btw7-hpNhRW7cF9Ev_QE';
const HARDCODED_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpseXFycm1pZWd0eGxwaWZ3eHh2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwOTM4NywiZXhwIjoyMDg1Nzg1Mzg3fQ.d6ZBlLNvSRBcUpcifXQW08QuzyP9ebtrypWBac4GIRE';

function pickServiceRoleKey(anonKey: string): { key: string; source: string } {
  const envKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (envKey && envKey.length > 0 && envKey !== anonKey) {
    return { key: envKey, source: 'env' };
  }
  return { key: HARDCODED_SERVICE_ROLE_KEY, source: envKey === anonKey ? 'hardcoded (env was anon)' : 'hardcoded' };
}

export function getDbConfig(): DbConfig {
  const envPublicUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const envServerUrl = process.env.SUPABASE_URL;
  const url = envPublicUrl || envServerUrl || HARDCODED_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || HARDCODED_ANON_KEY;
  const { key: serviceRoleKey, source: serviceRoleSource } = pickServiceRoleKey(anonKey);
  const usingServiceRole = serviceRoleKey !== anonKey;

  const cfg: DbConfig = {
    url,
    anonKey,
    serviceRoleKey,
  };

  console.log("[DB] getDbConfig v1.3 (Supabase)", {
    hasUrl: !!url,
    urlLength: url?.length,
    hasAnonKey: !!anonKey,
    anonKeyLength: anonKey?.length,
    hasServiceRoleKey: !!serviceRoleKey,
    serviceRoleKeyLength: serviceRoleKey?.length,
    usingServiceRole,
    serviceRoleSource,
  });

  return cfg;
}

export function isDbConfigured(): boolean {
  const { url, anonKey, serviceRoleKey } = getDbConfig();
  return !!(url && anonKey && serviceRoleKey);
}

export function getSupabaseHeaders(): Record<string, string> {
  const { anonKey, serviceRoleKey } = getDbConfig();
  return {
    "apikey": anonKey || "",
    "Authorization": `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  };
}

export function getSupabaseRestUrl(table: string): string {
  const { url } = getDbConfig();
  return `${url}/rest/v1/${table}`;
}
