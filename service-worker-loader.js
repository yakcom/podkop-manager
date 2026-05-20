const DEFAULT_SETTINGS = {
  configured: false,
  routerUrl: 'http://192.168.0.1/cgi-bin/podkop-curator',
  routerToken: '',
  defaultMode: 'base',
  profiles: ['default'],
  activeProfile: 'default',
  profileScope: { default: 'both' },
  theme: 'dark',
  locale: 'en',
  schemaVersion: '3.64'
};

const COMMON_SECOND_LEVEL_SUFFIXES = new Set([
  'co.uk','org.uk','ac.uk','gov.uk','com.au','net.au','org.au','com.br','com.cn','com.hk','com.mx','com.tr','co.jp','ne.jp','or.jp','co.kr','co.nz','co.za','com.sg','com.tw','com.ua','com.ru'
]);

const keys = {
  settings: 'settings',
  origins: 'state.origins',
  console: 'console.buffer',
  deep: 'deep.sessions',
  dns: 'dns.cache',
  requests: 'tab.requests',
  toggles: 'origin.toggles'
};

async function getSettings() {
  const raw = await chrome.storage.local.get(keys.settings);
  const saved = raw[keys.settings] || {};
  const next = { ...DEFAULT_SETTINGS, ...saved };
  if (!Array.isArray(next.profiles) || next.profiles.length === 0) next.profiles = ['default'];
  if (!next.activeProfile) next.activeProfile = next.profiles[0];
  if (!next.profileScope || typeof next.profileScope !== 'object') next.profileScope = { [next.activeProfile]: 'both' };
  if (!next.profileScope[next.activeProfile]) next.profileScope[next.activeProfile] = 'both';
  next.configured = Boolean(next.routerUrl && next.routerToken);
  return next;
}

async function patchSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch, schemaVersion: '3.64' };
  next.routerUrl = String(next.routerUrl || '').trim() || DEFAULT_SETTINGS.routerUrl;
  next.routerToken = String(next.routerToken || '').trim();
  if (!Array.isArray(next.profiles) || next.profiles.length === 0) next.profiles = ['default'];
  if (!next.activeProfile || !next.profiles.includes(next.activeProfile)) next.activeProfile = next.profiles[0];
  if (!next.profileScope || typeof next.profileScope !== 'object') next.profileScope = {};
  if (!next.profileScope[next.activeProfile]) next.profileScope[next.activeProfile] = 'both';
  next.configured = Boolean(next.routerUrl && next.routerToken);
  await chrome.storage.local.set({ [keys.settings]: next });
  return next;
}

async function getOriginStates() {
  const raw = await chrome.storage.local.get(keys.origins);
  return raw[keys.origins] || {};
}
async function getOriginState(origin) { return (await getOriginStates())[origin]; }
async function setOriginState(state) {
  const all = await getOriginStates();
  if (!state || state.mode === 'direct') delete all[state.origin];
  else all[state.origin] = state;
  await chrome.storage.local.set({ [keys.origins]: all });
}

function stateCandidateDomains(state, origin) {
  const base = [origin];
  if (origin && !origin.startsWith('www.')) base.push(`www.${origin}`);
  return uniqueClean([...(state?.knownDomains || []), ...(state?.writtenDomains || []), ...base]);
}
function stateCandidateIps(state) {
  return uniqueClean([...(state?.knownIps || []), ...(state?.writtenIps || [])]).map(normalizeIpOrSubnet).filter(Boolean);
}

async function reconcileLocalLibraryWithRouterLists(lists) {
  const all = await getOriginStates();
  const listDomains = uniqueClean(lists?.domains || []);
  const listSubnets = uniqueClean(lists?.subnets || []).map(normalizeIpOrSubnet).filter(Boolean);
  const domainSet = new Set(listDomains);
  const subnetSet = new Set(listSubnets);
  const usedDomains = new Set();
  const usedSubnets = new Set();
  const next = {};

  for (const [origin, raw] of Object.entries(all || {})) {
    if (origin === MANUAL_PROXY_ORIGIN) continue;

    const state = normalizeStateShape(raw, origin, raw?.scope || 'both');
    if (!state || state.mode === 'direct') continue;

    const knownDomains = stateCandidateDomains(state, origin);
    const knownIps = stateCandidateIps(state);
    const writtenDomains = knownDomains.filter(x => domainSet.has(x));
    const writtenIps = knownIps.filter(x => subnetSet.has(x));

    writtenDomains.forEach(x => usedDomains.add(x));
    writtenIps.forEach(x => usedSubnets.add(x));

    if (!writtenDomains.length && !writtenIps.length) continue;

    let scope = 'both';
    if (writtenDomains.length && !writtenIps.length) scope = 'domains';
    if (!writtenDomains.length && writtenIps.length) scope = 'ips';

    next[origin] = {
      ...state,
      scope,
      writtenDomains,
      writtenIps,
      knownDomains,
      knownIps,
      lastChangedAt: Date.now(),
      source: 'router-lists'
    };
  }

  const manualDomains = listDomains.filter(x => !usedDomains.has(x));
  const manualIps = listSubnets.filter(x => !usedSubnets.has(x));

  if (manualDomains.length || manualIps.length) {
    const manualState = sanitizeOriginStateForStorage({
      origin: MANUAL_PROXY_ORIGIN,
      mode: 'base',
      scope: 'both',
      writtenDomains: manualDomains,
      writtenIps: manualIps,
      knownDomains: manualDomains,
      knownIps: manualIps,
      lastChangedAt: Date.now(),
      source: 'router-lists'
    });
    if (manualState) next[MANUAL_PROXY_ORIGIN] = manualState;
  }

  await chrome.storage.local.set({ [keys.origins]: next });
  return next;
}



async function getTabRequests() {
  const raw = await chrome.storage.local.get(keys.requests);
  return raw[keys.requests] || {};
}
async function setTabRequests(data) {
  await chrome.storage.local.set({ [keys.requests]: data || {} });
}

async function getAllOriginToggles() {
  const raw = await chrome.storage.local.get(keys.toggles);
  return raw[keys.toggles] || {};
}
async function setAllOriginToggles(data) {
  await chrome.storage.local.set({ [keys.toggles]: data || {} });
}
function normalizeToggles(t = {}) {
  return {
    disabledDomains: uniqueClean(t.disabledDomains || []),
    disabledIps: uniqueClean(t.disabledIps || []).map(normalizeIpOrSubnet).filter(Boolean)
  };
}
const GLOBAL_TOGGLE_KEY = '__global__';
const MANUAL_PROXY_ORIGIN = '__manual_proxy__';
async function getOriginToggles(origin) {
  const all = await getAllOriginToggles();
  const global = normalizeToggles(all[GLOBAL_TOGGLE_KEY] || {});
  const local = origin ? normalizeToggles(all[origin] || {}) : normalizeToggles();
  return normalizeToggles({
    disabledDomains: [...global.disabledDomains, ...local.disabledDomains],
    disabledIps: [...global.disabledIps, ...local.disabledIps]
  });
}
async function setOriginToggles(origin, toggles) {
  if (!origin) return normalizeToggles();
  const all = await getAllOriginToggles();
  const next = normalizeToggles(toggles);
  if (!next.disabledDomains.length && !next.disabledIps.length) delete all[origin];
  else all[origin] = next;
  await setAllOriginToggles(all);
  return next;
}
async function getGlobalToggles() {
  const all = await getAllOriginToggles();
  return normalizeToggles(all[GLOBAL_TOGGLE_KEY] || {});
}
async function setGlobalToggles(toggles) {
  const all = await getAllOriginToggles();
  const next = normalizeToggles(toggles);
  if (!next.disabledDomains.length && !next.disabledIps.length) delete all[GLOBAL_TOGGLE_KEY];
  else all[GLOBAL_TOGGLE_KEY] = next;
  await setAllOriginToggles(all);
  return next;
}
function filterStateByGlobalToggles(state, toggles) {
  const s = sanitizeOriginStateForStorage(state);
  if (!s) return null;
  const t = normalizeToggles(toggles);
  return sanitizeOriginStateForStorage({
    ...s,
    writtenDomains: uniqueClean(s.writtenDomains || []).filter(x => !t.disabledDomains.includes(x)),
    writtenIps: uniqueClean(s.writtenIps || []).map(normalizeIpOrSubnet).filter(Boolean).filter(x => !t.disabledIps.includes(x)),
    knownDomains: uniqueClean([...(s.knownDomains || []), ...(s.writtenDomains || [])]),
    knownIps: uniqueClean([...(s.knownIps || []), ...(s.writtenIps || [])]).map(normalizeIpOrSubnet).filter(Boolean)
  });
}
function filterStatesByGlobalToggles(states, toggles) {
  const next = {};
  for (const [origin, state] of Object.entries(states || {})) {
    const filtered = filterStateByGlobalToggles(state, toggles);
    if (filtered) next[origin] = filtered;
  }
  return next;
}


function isDomainDisabled(toggles, value) {
  return normalizeToggles(toggles).disabledDomains.includes(String(value || '').trim().toLowerCase());
}
function isIpDisabled(toggles, value) {
  const ip = normalizeIpOrSubnet(value);
  return Boolean(ip && normalizeToggles(toggles).disabledIps.includes(ip));
}

function normalizeLibraryEntryKindValue(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || /\s/.test(raw) || /[/?#]/.test(raw) || /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    throw new Error('Enter a plain domain or IPv4/CIDR');
  }
  const ip = normalizeIpOrSubnet(raw);
  if (ip && /^(\d{1,3}\.){3}\d{1,3}(\/([0-9]|[12][0-9]|3[0-2]))?$/.test(ip)) {
    return { kind: 'ip', value: ip };
  }
  const domain = toAscii(raw.replace(/^\.+|\.+$/g, ''));
  if (
    domain.length > 253 ||
    !domain.includes('.') ||
    isIpv4(domain) ||
    isIpv6(domain) ||
    /\.(local|localhost|lan|home|internal)$/i.test(domain) ||
    !domain.split('.').every(part => part.length >= 1 && part.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part))
  ) {
    throw new Error('Enter a valid domain or public IPv4/CIDR');
  }
  return { kind: 'domain', value: domain };
}

function filterEntriesByToggles(entries, toggles) {
  const t = normalizeToggles(toggles);
  return {
    ...entries,
    domains: uniqueClean(entries.domains || []).filter(x => !t.disabledDomains.includes(x)),
    ips: uniqueClean(entries.ips || []).map(normalizeIpOrSubnet).filter(Boolean).filter(x => !t.disabledIps.includes(x))
  };
}
function toggleEntryInToggles(toggles, kind, value) {
  const next = normalizeToggles(toggles);
  const normalizedKind = kind === 'ip' ? 'ip' : 'domain';
  const normalizedValue = normalizedKind === 'ip' ? normalizeIpOrSubnet(value) : String(value || '').trim().toLowerCase();
  if (!normalizedValue) return next;
  const key = normalizedKind === 'ip' ? 'disabledIps' : 'disabledDomains';
  const set = new Set(next[key]);
  if (set.has(normalizedValue)) set.delete(normalizedValue);
  else set.add(normalizedValue);
  next[key] = [...set];
  return normalizeToggles(next);
}

function mergeRequestBuckets(current = {}, incoming = {}) {
  return {
    domains: uniqueClean([...(current.domains || []), ...(incoming.domains || [])]).slice(0, 80),
    hosts: uniqueClean([...(current.hosts || []), ...(incoming.hosts || [])]).slice(0, 80),
    ips: uniqueClean([...(current.ips || []), ...(incoming.ips || [])]).map(normalizeIpOrSubnet).filter(Boolean).slice(0, 80),
    updatedAt: Date.now()
  };
}
async function recordTabRequest(tabId, url, pageOrigin = '') {
  if (typeof tabId !== 'number' || tabId < 0 || !url) return;
  const a = analyzeUrl(url);
  if (!a.isHttpScheme || !a.asciiHostname) return;
  const incoming = { domains: [], hosts: [], ips: [] };
  if (a.isIp) {
    if (isIpv4(a.asciiHostname) && !isPrivateIp(a.asciiHostname)) incoming.ips.push(a.asciiHostname);
  } else {
    if (a.origin && a.origin !== pageOrigin) incoming.domains.push(a.origin);
    if (a.asciiHostname && a.asciiHostname !== pageOrigin && a.asciiHostname !== a.origin) incoming.hosts.push(a.asciiHostname);
  }
  if (!incoming.domains.length && !incoming.hosts.length && !incoming.ips.length) return;
  const all = await getTabRequests();
  const key = String(tabId);
  all[key] = mergeRequestBuckets(all[key], incoming);
  await setTabRequests(all);
}
async function getVisibleRequestsForTab(tabId, origin, harvested = null) {
  const all = await getTabRequests();
  const stored = all[String(tabId)] || {};
  const merged = mergeRequestBuckets(stored, harvested || {});
  const domains = uniqueClean(merged.domains || []).filter(x => x && x !== origin);
  const hosts = uniqueClean(merged.hosts || []).filter(x => x && x !== origin && !domains.includes(x));
  const ips = uniqueClean(merged.ips || []).map(normalizeIpOrSubnet).filter(Boolean);
  return { domains, hosts, ips, updatedAt: merged.updatedAt || 0 };
}

function scheduleVisibleRequestHarvest(tabId, origin) {
  if (typeof tabId !== 'number' || !origin) return;
  setTimeout(() => {
    (async () => {
      const harvested = await harvestResourceEntries(tabId, origin);
      const all = await getTabRequests();
      const key = String(tabId);
      all[key] = mergeRequestBuckets(all[key], harvested);
      await setTabRequests(all);
      const requests = await getVisibleRequestsForTab(tabId, origin, null);
      try { chrome.runtime.sendMessage({ type: 'REQUESTS_UPDATED', tabId, origin, requests }).catch(() => {}); } catch {}
    })().catch(e => log.warn('request', `async harvest failed ${origin}: ${String(e.message || e)}`));
  }, 0);
}

async function getConsole() {
  const raw = await chrome.storage.local.get(keys.console);
  return raw[keys.console] || [];
}
async function appendConsole(level, channel, text) {
  const line = { at: Date.now(), level, channel, text };
  const lines = await getConsole();
  lines.push(line);
  if (lines.length > 500) lines.splice(0, lines.length - 500);
  await chrome.storage.local.set({ [keys.console]: lines });
  try { chrome.runtime.sendMessage({ type: 'CONSOLE_LINE', line }).catch(() => {}); } catch {}
  return line;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const log = {
  info: (c,t) => appendConsole('info', c, t),
  warn: (c,t) => appendConsole('warn', c, t),
  error: (c,t) => appendConsole('error', c, t),
  success: (c,t) => appendConsole('success', c, t)
};

function toAscii(hostname) {
  try { return new URL(`https://${hostname}/`).hostname.toLowerCase(); }
  catch { return String(hostname || '').toLowerCase(); }
}
function isIpv4(s) {
  const p = String(s || '').split('.');
  return p.length === 4 && p.every(x => /^\d{1,3}$/.test(x) && Number(x) >= 0 && Number(x) <= 255);
}
function isIpv6(s) { return String(s || '').includes(':') && /^[0-9a-f:.]+$/i.test(String(s)); }
function normalizeIpOrSubnet(value) {
  const s = String(value || '').trim().toLowerCase();
  if (!s) return null;
  if (s.includes('/')) {
    const [ip, prefix] = s.split('/');
    if (!isIpv4(ip) || !/^\d+$/.test(prefix)) return null;
    const n = Number(prefix);
    return n >= 0 && n <= 32 ? `${ip}/${n}` : null;
  }
  if (isIpv4(s)) return s;
  return null;
}
function isPrivateIp(ip) {
  if (isIpv4(ip)) {
    const [a,b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true;
    return false;
  }
  const l = String(ip).toLowerCase();
  return l === '::' || l === '::1' || /^f[cd]/.test(l) || /^fe[89ab]/.test(l) || /^ff/.test(l);
}
function analyzeUrl(href) {
  let url;
  try { url = new URL(href); } catch { return { isHttpScheme: false, protocol: '' }; }
  const isHttpScheme = url.protocol === 'http:' || url.protocol === 'https:';
  const asciiHostname = url.hostname ? toAscii(url.hostname) : '';
  if (!asciiHostname) return { isHttpScheme, protocol: url.protocol, asciiHostname: null, origin: null, isIp: false };
  const isIp = isIpv4(asciiHostname) || isIpv6(asciiHostname);
  let origin = null;
  if (isIp) origin = asciiHostname;
  else {
    const parts = asciiHostname.split('.').filter(Boolean);
    if (parts.length >= 2) {
      const last2 = parts.slice(-2).join('.');
      origin = COMMON_SECOND_LEVEL_SUFFIXES.has(last2) && parts.length >= 3 ? parts.slice(-3).join('.') : last2;
    }
  }
  return { isHttpScheme, protocol: url.protocol, asciiHostname, origin, isIp };
}
function uniqueClean(items) { return [...new Set((items || []).map(x => String(x).trim().toLowerCase()).filter(Boolean))]; }

async function getDnsCache() { const raw = await chrome.storage.local.get(keys.dns); return raw[keys.dns] || {}; }
async function setDnsCache(cache) { await chrome.storage.local.set({ [keys.dns]: cache }); }
async function resolveHost(hostname) {
  if (!hostname || !hostname.includes('.') || /\.(local|localhost|lan|home|internal)$/i.test(hostname)) return [];
  const cache = await getDnsCache();
  const now = Date.now();
  if (cache[hostname] && cache[hostname].expiresAt > now) return (cache[hostname].ips || []).filter(ip => isIpv4(ip) && !isPrivateIp(ip));
  async function query(endpoint, type) {
    const url = new URL(endpoint); url.searchParams.set('name', hostname); url.searchParams.set('type', type);
    const res = await fetch(url.toString(), { headers: { Accept: 'application/dns-json' } });
    if (!res.ok) return { ips: [], ttl: 60 };
    const data = await res.json(); const wanted = type === 'A' ? 1 : 28; const ips = []; let ttl = 3600;
    for (const a of data.Answer || []) {
      if (a.type === wanted && typeof a.data === 'string') ips.push(a.data.toLowerCase());
      if (typeof a.TTL === 'number' && a.TTL > 0) ttl = Math.min(ttl, a.TTL);
    }
    return { ips, ttl };
  }
  let v4 = { ips: [], ttl: 60 };
  try { v4 = await query('https://cloudflare-dns.com/dns-query', 'A'); }
  catch { try { v4 = await query('https://dns.google/resolve', 'A'); } catch {} }
  const ips = [...new Set(v4.ips)].filter(ip => isIpv4(ip) && !isPrivateIp(ip));
  cache[hostname] = { ips, expiresAt: now + Math.min(v4.ttl, 3600) * 1000 };
  await setDnsCache(cache);
  return ips;
}

async function resolveHostSafe(hostname, timeoutMs = 3500) {
  if (!hostname) return [];
  try {
    return await Promise.race([
      resolveHost(hostname),
      new Promise(resolve => setTimeout(() => resolve([]), timeoutMs))
    ]);
  } catch (e) {
    await log.warn('dns', `resolve failed ${hostname}: ${String(e.message || e)}`);
    return [];
  }
}

function formPart(key, value) {
  const v = Array.isArray(value) ? value.join('|') : String(value || '');
  return `${key}=${v.replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D').replace(/[\r\n]+/g, '|')}`;
}

async function sendRouter(payload) {
  const settings = await getSettings();
  if (!settings.configured) throw new Error('Router API is not configured');
  const body = [
    formPart('token', settings.routerToken),
    formPart('action', payload.action || 'apply'),
    formPart('addDomains', payload.addDomains || []),
    formPart('addSubnets', payload.addSubnets || []),
    formPart('removeDomains', payload.removeDomains || []),
    formPart('removeSubnets', payload.removeSubnets || []),
    formPart('setDomains', payload.setDomains || ''),
    formPart('setSubnets', payload.setSubnets || '')
  ].join('&');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  let res;
  try {
    res = await fetch(settings.routerUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body, signal: controller.signal });
  } finally { clearTimeout(timeout); }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { ok: false, error: text || `HTTP ${res.status}` }; }
  if (!res.ok && data.ok !== true) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}


async function getRouterLists() {
  const res = await sendRouter({ action: 'status' });
  if (!res || res.ok !== true) throw new Error(res?.error || 'router status failed');
  const rawDomains = uniqueClean(res.rawDomains || res.domains || []);
  const rawSubnets = uniqueClean(res.rawSubnets || res.subnets || []);
  return {
    domains: uniqueClean(res.domains || rawDomains),
    subnets: uniqueClean(res.subnets || rawSubnets).map(normalizeIpOrSubnet).filter(Boolean),
    rawDomains,
    rawSubnets
  };
}

function parseEditableListText(text) {
  return String(text || '')
    .split(/[\r\n]+/)
    .map(x => x.trim().toLowerCase())
    .filter(x => x && !x.startsWith('#'));
}

async function saveRouterLists(domainsText, subnetsText) {
  const setDomains = uniqueClean(parseEditableListText(domainsText)).join('|');
  const setSubnets = uniqueClean(parseEditableListText(subnetsText)).map(normalizeIpOrSubnet).filter(Boolean).join('|');

  const res = await sendRouter({ action: 'setLists', setDomains, setSubnets });
  if (!res || res.ok !== true) throw new Error(res?.error || 'router list save failed');

  const lists = await getRouterLists();
  const states = await reconcileLocalLibraryWithRouterLists(lists);
  await log.success('router', `router lists saved: ${lists.rawDomains.length} domains, ${lists.rawSubnets.length} subnets`);
  return { ...lists, library: buildLibraryView(states) };
}

async function getRouterControlStatus() {
  const lists = await getRouterLists();
  let service = {};
  try {
    service = await sendRouter({ action: 'podkopStatus' });
  } catch (e) {
    service = { ok: false, error: String(e.message || e) };
  }
  return {
    ok: true,
    configured: true,
    podkop: {
      running: Boolean(service.running),
      enabled: Boolean(service.enabled),
      raw: service.status || '',
      error: service.error || ''
    },
    lists: {
      domains: (lists.rawDomains || lists.domains || []).length,
      subnets: (lists.rawSubnets || lists.subnets || []).length
    }
  };
}

async function runRouterControlAction(action) {
  const allowed = new Set(['test', 'podkopStatus', 'restartPodkop', 'startPodkop', 'stopPodkop', 'enablePodkopAutostart', 'disablePodkopAutostart', 'rebootRouter']);
  if (!allowed.has(action)) throw new Error('Unsupported router action');
  if (action === 'test') {
    const res = await sendRouter({ action: 'test' });
    return { ok: true, message: res.message || 'Router API OK' };
  }
  if (action === 'podkopStatus') return getRouterControlStatus();
  if (action === 'rebootRouter') {
    const res = await sendRouter({ action: 'rebootRouter' });
    if (!res || res.ok !== true) throw new Error(res?.error || 'Router reboot failed');
    await log.warn('router', 'router reboot requested');
    return { ok: true, message: res.message || 'Router reboot requested' };
  }
  const actionLabels = {
    restartPodkop: 'podkop restarted',
    startPodkop: 'podkop started',
    stopPodkop: 'podkop stopped',
    enablePodkopAutostart: 'podkop autostart enabled',
    disablePodkopAutostart: 'podkop autostart disabled'
  };
  const res = await sendRouter({ action });
  if (!res || res.ok !== true) throw new Error(res?.error || `${action} failed`);
  await log.success('router', actionLabels[action] || action);
  await delay(900);
  return getRouterControlStatus();
}


function listHasAny(list, values) {
  const set = new Set(uniqueClean(list));
  return uniqueClean(values).some(v => set.has(v));
}
function listPresent(list, values) {
  const set = new Set(uniqueClean(list));
  return uniqueClean(values).filter(v => set.has(v));
}
function subnetPresent(list, values) {
  const set = new Set(uniqueClean(list).map(normalizeIpOrSubnet).filter(Boolean));
  return uniqueClean(values).map(normalizeIpOrSubnet).filter(Boolean).filter(v => set.has(v));
}
async function harvestResourceEntries(tabId, origin) {
  const out = { domains: [], hosts: [], ips: [] };
  if (typeof tabId !== 'number' || !origin) return out;
  let urls = [];
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        const found = [];
        try {
          found.push(location.href);
          for (const e of performance.getEntriesByType('resource')) if (e && typeof e.name === 'string') found.push(e.name);
          for (const el of document.querySelectorAll('img[src],script[src],link[href],iframe[src],source[src],video[src],audio[src],track[src],embed[src],object[data]')) {
            const u = el.src || el.href || el.data;
            if (u) found.push(u);
          }
        } catch {}
        return found;
      }
    });
    urls = [...new Set(results.flatMap(r => Array.isArray(r.result) ? r.result : []))];
  } catch (e) {
    await log.warn('deep', `harvest failed ${origin}: ${String(e.message || e)}`);
    return out;
  }
  const domains = [];
  const hosts = [];
  const ips = [];
  for (const url of urls) {
    const a = analyzeUrl(url);
    if (!a.isHttpScheme || !a.asciiHostname) continue;
    if (a.isIp) {
      if (isIpv4(a.asciiHostname) && !isPrivateIp(a.asciiHostname)) ips.push(a.asciiHostname);
      continue;
    }
    if (a.origin && a.origin !== origin) domains.push(a.origin);
    if (!a.isIp && a.asciiHostname && a.asciiHostname !== origin && a.asciiHostname !== a.origin) hosts.push(a.asciiHostname);
  }
  return { domains: uniqueClean(domains), hosts: uniqueClean(hosts), ips: uniqueClean(ips).map(normalizeIpOrSubnet).filter(Boolean) };
}
async function resolveDomainsToIps(domains) {
  const hosts = uniqueClean(domains).filter(Boolean);
  if (!hosts.length) return [];
  const ipSets = await Promise.all(hosts.map(host => resolveHostSafe(host)));
  return uniqueClean(ipSets.flat()).map(normalizeIpOrSubnet).filter(Boolean);
}
async function buildDeepEntries(tabId, url, scope) {
  const base = await buildEntriesForScope(url, scope);
  const harvested = await harvestResourceEntries(tabId, base.origin);
  const requestDomains = uniqueClean([
    ...(harvested.domains || []),
    ...(harvested.hosts || [])
  ]);
  let deepDomains = uniqueClean([...base.domains, ...requestDomains]);
  let deepIps = uniqueClean([...base.ips, ...(harvested.ips || [])]);
  const normalizedScope = ['domains', 'both', 'ips'].includes(scope) ? scope : 'both';
  if (normalizedScope !== 'domains') {
    const resolved = await resolveDomainsToIps(requestDomains);
    deepIps = uniqueClean([...deepIps, ...resolved]).map(normalizeIpOrSubnet).filter(Boolean);
  }
  if (normalizedScope === 'domains') deepIps = [];
  if (normalizedScope === 'ips') deepDomains = [];
  return { ...base, domains: deepDomains, ips: deepIps, harvested };
}
function normalizeScope(scope) {
  return ['domains', 'both', 'ips'].includes(scope) ? scope : 'both';
}
function normalizeMode(mode) {
  return ['direct', 'base', 'deep'].includes(mode) ? mode : 'direct';
}
function makeDirectState(origin, scope = 'both') {
  return { origin, mode: 'direct', profileName: 'default', scope: normalizeScope(scope), writtenDomains: [], writtenIps: [], lastChangedAt: Date.now(), source: 'local' };
}
function normalizeStateShape(state, origin, fallbackScope = 'both') {
  if (!state || state.origin !== origin) return makeDirectState(origin, fallbackScope);
  const mode = normalizeMode(state.mode);
  const scope = normalizeScope(state.scope || fallbackScope);
  const writtenDomains = mode === 'direct' ? [] : uniqueClean(state.writtenDomains || []);
  const writtenIps = mode === 'direct' ? [] : uniqueClean(state.writtenIps || []).map(normalizeIpOrSubnet).filter(Boolean);
  return {
    ...state,
    origin,
    mode,
    profileName: 'default',
    scope,
    writtenDomains,
    writtenIps,
    knownDomains: uniqueClean([...(state.knownDomains || []), ...writtenDomains, origin, ...(origin && !origin.startsWith('www.') ? [`www.${origin}`] : [])]),
    knownIps: uniqueClean([...(state.knownIps || []), ...writtenIps]).map(normalizeIpOrSubnet).filter(Boolean),
    source: state.source || 'local'
  };
}
async function inferRouterStateFromListsForTab(tabId, tabUrl, preferredScope = 'both') {
  const baseAll = await buildEntriesForScope(tabUrl, 'both');
  const lists = await getRouterLists();
  const presentDomains = listPresent(lists.domains, baseAll.domains);
  const presentIps = subnetPresent(lists.subnets, baseAll.ips);
  let scope = normalizeScope(preferredScope);
  if (presentDomains.length && presentIps.length) scope = 'both';
  else if (presentDomains.length) scope = 'domains';
  else if (presentIps.length) scope = 'ips';

  let mode = (presentDomains.length || presentIps.length) ? 'base' : 'direct';
  if (mode !== 'direct') {
    const harvested = await harvestResourceEntries(tabId, baseAll.origin);
    const externalDomains = listPresent(lists.domains, [...harvested.domains, ...(harvested.hosts || [])]);
    const directIps = subnetPresent(lists.subnets, harvested.ips);
    let resolvedIps = [];
    const harvestedDomainHosts = uniqueClean([...(harvested.domains || []), ...(harvested.hosts || [])]);
    if (scope !== 'domains' && harvestedDomainHosts.length) resolvedIps = await resolveDomainsToIps(harvestedDomainHosts);
    const externalIps = subnetPresent(lists.subnets, [...harvested.ips, ...resolvedIps]);
    const sessions = await getDeepSessions();
    const activeDeep = sessions[String(tabId)]?.origin === baseAll.origin;
    if (activeDeep || externalDomains.length || directIps.length || externalIps.length) mode = 'deep';
  }
  return {
    origin: baseAll.origin,
    mode,
    profileName: 'default',
    scope,
    writtenDomains: mode === 'direct' ? [] : presentDomains,
    writtenIps: mode === 'direct' ? [] : presentIps,
    routerDomains: lists.domains,
    routerSubnets: lists.subnets,
    lastChangedAt: Date.now(),
    source: 'router'
  };
}
async function getWorkingStateForTab(tabId, tabUrl, preferredScope = 'both', allowRouterFallback = true) {
  const base = await buildBaseEntries(tabUrl);
  const local = normalizeStateShape(await getOriginState(base.origin), base.origin, preferredScope);
  if (local.mode !== 'direct') return local;
  if (!allowRouterFallback) return local;
  try {
    const router = await inferRouterStateFromListsForTab(tabId, tabUrl, local.scope || preferredScope);
    if (router.mode !== 'direct') {
      await setOriginState({ ...router, source: 'router-bootstrap' });
      return { ...router, source: 'router-bootstrap' };
    }
  } catch (e) {
    await log.warn('router', `state bootstrap failed ${base.origin}: ${String(e.message || e)}`);
  }
  return local;
}
async function inferRouterStateForTab(tabId, tabUrl, preferredScope = 'both') {
  return getWorkingStateForTab(tabId, tabUrl, preferredScope, true);
}

async function testRouterCredentials(url, token) {
  const body = new URLSearchParams();
  body.set('token', token);
  body.set('action', 'test');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body, signal: controller.signal });
  } finally { clearTimeout(timeout); }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { ok: false, error: text || `HTTP ${res.status}` }; }
  if (!res.ok || data.ok !== true) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function applyRouterChange({ origin, mode, addDomains, addIps, removeDomains, removeIps }) {
  const domainsA = uniqueClean(addDomains);
  const ipsA = uniqueClean(addIps).map(normalizeIpOrSubnet).filter(Boolean);
  const domainsR = uniqueClean(removeDomains);
  const ipsR = uniqueClean(removeIps).map(normalizeIpOrSubnet).filter(Boolean);
  if (!domainsA.length && !ipsA.length && !domainsR.length && !ipsR.length) return { ok: true, changed: false };
  await log.info(mode === 'direct' ? 'rollback' : 'router', `${mode === 'direct' ? 'remove' : 'add'} ${origin}: domains ${domainsA.length || domainsR.length}, subnets ${ipsA.length || ipsR.length}`);
  const res = await sendRouter({ action: 'apply', addDomains: domainsA, addSubnets: ipsA, removeDomains: domainsR, removeSubnets: ipsR });
  if (!res || !res.ok) throw new Error(res?.error || 'router API failed');
  await log.success('router', res.message || 'Podkop lists updated');
  return res;
}

async function buildBaseEntries(url) {
  const a = analyzeUrl(url);
  if (!a.isHttpScheme) throw new Error('Only http/https pages are supported');
  if (a.isIp) return { origin: a.asciiHostname, hostname: a.asciiHostname, isIp: true, domains: [], ips: [a.asciiHostname] };
  if (!a.origin) throw new Error('Could not determine site origin');
  const domains = a.origin === a.asciiHostname ? [a.origin] : [a.origin, a.asciiHostname];
  return { origin: a.origin, hostname: a.asciiHostname, isIp: false, domains, ips: [] };
}

async function buildEntriesForScope(url, scope) {
  const base = await buildBaseEntries(url);
  const normalizedScope = ['domains', 'both', 'ips'].includes(scope) ? scope : 'both';
  const domains = normalizedScope === 'ips' ? [] : base.domains;
  let resolvedIps = [];
  if (!base.isIp && normalizedScope !== 'domains') {
    const hostsToResolve = uniqueClean(base.domains.length ? base.domains : [base.hostname]);
    const ipSets = await Promise.all(hostsToResolve.map(host => resolveHostSafe(host)));
    resolvedIps = ipSets.flat();
  }
  const ips = normalizedScope === 'domains' ? [] : [...base.ips, ...resolvedIps];
  return { ...base, scope: normalizedScope, domains: uniqueClean(domains), ips: uniqueClean(ips).map(normalizeIpOrSubnet).filter(Boolean) };
}

function diffLists(current, target) {
  const cur = uniqueClean(current).map(normalizeIpOrSubnet).filter(Boolean);
  const tgt = uniqueClean(target).map(normalizeIpOrSubnet).filter(Boolean);
  return {
    add: tgt.filter(x => !cur.includes(x)),
    remove: cur.filter(x => !tgt.includes(x))
  };
}

function diffTextLists(current, target) {
  const cur = uniqueClean(current);
  const tgt = uniqueClean(target);
  return {
    add: tgt.filter(x => !cur.includes(x)),
    remove: cur.filter(x => !tgt.includes(x))
  };
}


let routerCommitQueue = Promise.resolve();

function withRouterCommitQueue(task) {
  const run = routerCommitQueue.then(task, task);
  routerCommitQueue = run.catch(() => {});
  return run;
}

function aggregateManagedEntries(states) {
  const domains = [];
  const ips = [];
  for (const state of Object.values(states || {})) {
    if (!state || normalizeMode(state.mode) === 'direct') continue;
    domains.push(...uniqueClean(state.writtenDomains || []));
    ips.push(...uniqueClean(state.writtenIps || []).map(normalizeIpOrSubnet).filter(Boolean));
  }
  return { domains: uniqueClean(domains), ips: uniqueClean(ips).map(normalizeIpOrSubnet).filter(Boolean) };
}

function sanitizeOriginStateForStorage(state) {
  if (!state || !state.origin) return null;
  const origin = String(state.origin).trim().toLowerCase();
  if (!origin) return null;
  const mode = normalizeMode(state.mode);
  if (mode === 'direct') return null;
  const scope = normalizeScope(state.scope || 'both');
  const writtenDomains = uniqueClean(state.writtenDomains || []);
  const writtenIps = uniqueClean(state.writtenIps || []).map(normalizeIpOrSubnet).filter(Boolean);
  const knownDomains = uniqueClean([...(state.knownDomains || []), ...writtenDomains, origin, ...(origin && !origin.startsWith('www.') ? [`www.${origin}`] : [])]);
  const knownIps = uniqueClean([...(state.knownIps || []), ...writtenIps]).map(normalizeIpOrSubnet).filter(Boolean);
  return {
    origin,
    mode,
    profileName: 'default',
    scope,
    writtenDomains,
    writtenIps,
    knownDomains,
    knownIps,
    lastChangedAt: Number(state.lastChangedAt) || Date.now(),
    source: state.source || 'local'
  };
}

async function commitOriginStates(nextStates, context = 'sync', origin = 'library') {
  return withRouterCommitQueue(async () => {
    const beforeStates = await getOriginStates();
    const beforeAgg = aggregateManagedEntries(beforeStates);
    const afterAgg = aggregateManagedEntries(nextStates);
    const dDiff = diffTextLists(beforeAgg.domains, afterAgg.domains);
    const ipDiff = diffLists(beforeAgg.ips, afterAgg.ips);

    // Authoritative replace: OpenWrt is only a target projection of extension state.
    // Every sync writes the full final lists, including empty lists for a clean extension.
    await log.info('router', `replace ${origin}: domains ${afterAgg.domains.length}, subnets ${afterAgg.ips.length}`);
    const res = await sendRouter({
      action: 'setLists',
      setDomains: afterAgg.domains,
      setSubnets: afterAgg.ips
    });
    if (!res || res.ok !== true) throw new Error(res?.error || 'router list replace failed');
    await log.success('router', res.message || 'Podkop lists replaced');

    await chrome.storage.local.set({ [keys.origins]: nextStates });
    return { ok: true, addedDomains: dDiff.add, addedIps: ipDiff.add, removedDomains: dDiff.remove, removedIps: ipDiff.remove, aggregate: afterAgg, replaced: true };
  });
}

async function updateManagedOriginState(origin, updater, context = 'sync') {
  const states = await getOriginStates();
  const current = normalizeStateShape(states[origin], origin, 'both');
  const nextStateRaw = await updater(current, states);
  const nextStates = { ...states };
  const nextState = sanitizeOriginStateForStorage(nextStateRaw);
  if (nextState) nextStates[origin] = nextState;
  else delete nextStates[origin];
  const committed = await commitOriginStates(nextStates, context, origin);
  return { state: nextState || makeDirectState(origin, current.scope || 'both'), committed };
}

function buildLibraryView(states) {
  const sites = Object.values(states || {})
    .map(sanitizeOriginStateForStorage)
    .filter(s => s && s.origin !== MANUAL_PROXY_ORIGIN)
    .sort((a, b) => a.origin.localeCompare(b.origin))
    .map(s => {
      const disabled = normalizeToggles((states || {})[GLOBAL_TOGGLE_KEY] || {});
      const activeDomains = uniqueClean(s.writtenDomains || []);
      const activeIps = uniqueClean(s.writtenIps || []).map(normalizeIpOrSubnet).filter(Boolean);
      const allDomains = uniqueClean([...(s.knownDomains || []), ...activeDomains]).filter(d => d !== s.origin || activeDomains.includes(d));
      const allIps = uniqueClean([...(s.knownIps || []), ...activeIps]).map(normalizeIpOrSubnet).filter(Boolean);
      return {
        origin: s.origin,
        mode: s.mode,
        scope: s.scope,
        domains: activeDomains,
        ips: activeIps,
        allDomains,
        allIps,
        disabledDomains: allDomains.filter(d => disabled.disabledDomains.includes(d)),
        disabledIps: allIps.filter(ip => disabled.disabledIps.includes(ip)),
        lastChangedAt: s.lastChangedAt || 0
      };
    });
  const aggregate = aggregateManagedEntries(states);
  return { sites, aggregate, siteCount: sites.length, domainCount: aggregate.domains.length, ipCount: aggregate.ips.length };
}

async function getLocalLibrary() {
  return { ok: true, ...buildLibraryView(await getOriginStates()), disabled: await getGlobalToggles() };
}


function arrayDiffClean(all = [], active = []) {
  const activeSet = new Set(uniqueClean(active));
  return uniqueClean(all).filter(x => !activeSet.has(x));
}
function buildExportPayload(states, disabled) {
  const normalizedStates = {};
  for (const [origin, raw] of Object.entries(states || {})) {
    const state = sanitizeOriginStateForStorage(raw);
    if (state) normalizedStates[state.origin] = state;
  }

  const manual = sanitizeOriginStateForStorage(normalizedStates[MANUAL_PROXY_ORIGIN]);
  const sites = Object.values(normalizedStates)
    .filter(s => s.origin !== MANUAL_PROXY_ORIGIN)
    .sort((a, b) => a.origin.localeCompare(b.origin))
    .map(s => {
      const activeDomains = uniqueClean(s.writtenDomains || []);
      const activeIps = uniqueClean(s.writtenIps || []).map(normalizeIpOrSubnet).filter(Boolean);
      const knownDomains = arrayDiffClean(s.knownDomains || [], activeDomains);
      const knownIps = arrayDiffClean((s.knownIps || []).map(normalizeIpOrSubnet).filter(Boolean), activeIps);
      return {
        origin: s.origin,
        mode: normalizeMode(s.mode),
        scope: normalizeScope(s.scope),
        active: {
          domains: activeDomains,
          ips: activeIps
        },
        known: {
          domains: knownDomains,
          ips: knownIps
        }
      };
    });

  return {
    schema: 'podkop-manager.v3',
    app: 'Podkop Manager',
    version: '3.94',
    exportedAt: new Date().toISOString(),
    library: {
      sites,
      manual: {
        domains: manual ? uniqueClean(manual.writtenDomains || []) : [],
        ips: manual ? uniqueClean(manual.writtenIps || []).map(normalizeIpOrSubnet).filter(Boolean) : []
      },
      direct: normalizeToggles(disabled || {})
    }
  };
}


function parseSiteRow(row) {
  if (!row || !row.origin) return null;

  const activeDomains = uniqueClean(row.active?.domains || row.domains || row.writtenDomains || []);
  const activeIps = uniqueClean(row.active?.ips || row.ips || row.writtenIps || []).map(normalizeIpOrSubnet).filter(Boolean);

  // In v3, known is intentionally compact: inactive-but-associated only.
  // Internal state still stores full known lists so Direct → Proxied restore keeps working.
  const inactiveKnownDomains = uniqueClean(row.known?.domains || row.knownDomains || []);
  const inactiveKnownIps = uniqueClean(row.known?.ips || row.knownIps || []).map(normalizeIpOrSubnet).filter(Boolean);

  return sanitizeOriginStateForStorage({
    origin: row.origin,
    mode: row.mode || 'base',
    scope: row.scope || 'both',
    writtenDomains: activeDomains,
    writtenIps: activeIps,
    knownDomains: uniqueClean([...activeDomains, ...inactiveKnownDomains]),
    knownIps: uniqueClean([...activeIps, ...inactiveKnownIps]).map(normalizeIpOrSubnet).filter(Boolean),
    lastChangedAt: Date.now(),
    source: 'import'
  });
}


async function exportLibrary() {
  const states = await getOriginStates();
  const disabled = await getGlobalToggles();
  return { ok: true, payload: buildExportPayload(states, disabled) };
}

function parseLibraryPayload(payload) {
  const src = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const next = {};

  if ((src?.schema === 'podkop-manager.v3' || src?.schema === 'podkop-manager.v2') && src?.library) {
    const rows = Array.isArray(src.library.sites) ? src.library.sites : [];
    for (const row of rows) {
      const state = parseSiteRow(row);
      if (state) next[state.origin] = state;
    }

    const manual = src.library.manual || {};
    const manualState = sanitizeOriginStateForStorage({
      origin: MANUAL_PROXY_ORIGIN,
      mode: 'base',
      scope: 'both',
      writtenDomains: manual.domains || [],
      writtenIps: manual.ips || [],
      knownDomains: manual.domains || [],
      knownIps: manual.ips || [],
      lastChangedAt: Date.now(),
      source: 'import'
    });
    if (manualState) next[MANUAL_PROXY_ORIGIN] = manualState;

    return { states: next, disabled: normalizeToggles(src.library.direct || {}) };
  }

  // Backward compatibility with legacy local-v1 exports.
  const rows = Array.isArray(src?.origins) ? src.origins : Array.isArray(src?.sites) ? src.sites : [];
  for (const row of rows) {
    const state = parseSiteRow(row);
    if (state) next[state.origin] = state;
  }

  const proxied = src?.proxied || {};
  const manualState = sanitizeOriginStateForStorage({
    origin: MANUAL_PROXY_ORIGIN,
    mode: 'base',
    scope: 'both',
    writtenDomains: proxied.domains || [],
    writtenIps: proxied.ips || [],
    knownDomains: proxied.domains || [],
    knownIps: proxied.ips || [],
    lastChangedAt: Date.now(),
    source: 'import'
  });
  if (manualState) next[MANUAL_PROXY_ORIGIN] = manualState;

  return { states: next, disabled: normalizeToggles(src?.disabled || {}) };
}

async function importLibrary(payload, strategy = 'replace') {
  const parsed = parseLibraryPayload(payload);
  await setGlobalToggles(parsed.disabled || {});
  const current = await getOriginStates();
  const nextRaw = strategy === 'merge' ? { ...current, ...parsed.states } : parsed.states;
  const next = filterStatesByGlobalToggles(nextRaw, await getGlobalToggles());
  const committed = await commitOriginStates(next, 'import', 'library');
  await refreshAllTabIcons();
  return { ok: true, ...buildLibraryView(next), disabled: await getGlobalToggles(), committed };
}

async function stopDeep(tabId, origin) {
  const sessions = await getDeepSessions();
  if (sessions[String(tabId)]) delete sessions[String(tabId)];
  await setDeepSessions(sessions);
  if (origin) await log.info('deep', `session end ${origin}`);
}
async function computeTargetEntries(tabId, tabUrl, mode, scope) {
  const normalizedMode = normalizeMode(mode);
  const normalizedScope = normalizeScope(scope);
  const baseForOrigin = await buildBaseEntries(tabUrl);
  if (normalizedMode === 'direct') {
    return { ...baseForOrigin, mode: 'direct', scope: normalizedScope, domains: [], ips: [] };
  }
  const raw = normalizedMode === 'deep'
    ? await buildDeepEntries(tabId, tabUrl, normalizedScope)
    : await buildEntriesForScope(tabUrl, normalizedScope);
  const toggles = await getOriginToggles(baseForOrigin.origin);
  return filterEntriesByToggles(raw, toggles);
}
async function applyStateTransition(tabId, tabUrl, currentState, targetMode, targetScope) {
  const base = await buildBaseEntries(tabUrl);
  const current = normalizeStateShape(currentState, base.origin, targetScope);
  const mode = normalizeMode(targetMode);
  const scope = normalizeScope(targetScope || current.scope);
  const target = await computeTargetEntries(tabId, tabUrl, mode, scope);

  const targetDomains = mode === 'direct' ? [] : uniqueClean(target.domains || []);
  const targetIps = mode === 'direct' ? [] : uniqueClean(target.ips || []).map(normalizeIpOrSubnet).filter(Boolean);

  if (mode !== 'deep') await stopDeep(tabId, base.origin);

  const states = await getOriginStates();
  const nextStates = { ...states };
  const nextState = {
    origin: base.origin,
    mode,
    profileName: 'default',
    scope,
    writtenDomains: targetDomains,
    writtenIps: targetIps,
    knownDomains: uniqueClean([...(current.knownDomains || []), ...(current.writtenDomains || []), ...targetDomains, base.origin, ...(base.origin && !base.origin.startsWith('www.') ? [`www.${base.origin}`] : [])]),
    knownIps: uniqueClean([...(current.knownIps || []), ...(current.writtenIps || []), ...targetIps]).map(normalizeIpOrSubnet).filter(Boolean),
    lastChangedAt: Date.now(),
    source: 'local'
  };
  if (mode === 'direct') delete nextStates[base.origin];
  else nextStates[base.origin] = nextState;

  const committed = await commitOriginStates(nextStates, mode, base.origin);

  if (mode === 'deep') await startDeep(tabId, base.origin, nextState);
  await setTabIcon(tabId, mode);
  return { ok: true, origin: base.origin, mode, scope, ...committed };
}
async function setModeForTab(tabId, targetMode) {
  const settings = await getSettings();
  if (!settings.configured) return { ok: false, reason: 'not-configured' };
  const tab = await chrome.tabs.get(tabId);
  const tabUrl = tab.url || '';
  const base = await buildBaseEntries(tabUrl);
  const current = normalizeStateShape(await getOriginState(base.origin), base.origin, settings.profileScope?.default || 'both');
  const scope = current.scope || settings.profileScope?.default || 'both';
  return applyStateTransition(tabId, tabUrl, current, targetMode, scope);
}
async function toggleOriginMode(tabId, url) {
  const settings = await getSettings();
  if (!settings.configured) return { ok: false, reason: 'not-configured' };
  const a = analyzeUrl(url);
  if (!a.isHttpScheme) return { ok: false, reason: 'not-http' };
  if (!a.origin) return { ok: false, reason: 'no-origin' };
  const state = await getOriginState(a.origin);
  const next = state?.mode === 'base' || state?.mode === 'deep' ? 'direct' : settings.defaultMode;
  return setModeForTab(tabId, next);
}

async function getDeepSessions() { const raw = await chrome.storage.local.get(keys.deep); return raw[keys.deep] || {}; }
async function setDeepSessions(s) { await chrome.storage.local.set({ [keys.deep]: s }); }
async function startDeep(tabId, origin, state) {
  const normalized = normalizeStateShape(state, origin, state?.scope || 'both');
  const s = await getDeepSessions();
  s[String(tabId)] = {
    origin,
    pendingDomains: [],
    pendingIps: [],
    knownDomains: normalized.writtenDomains || [],
    knownIps: normalized.writtenIps || []
  };
  await setDeepSessions(s);
  await log.info('deep', `session start ${origin}`);
  try {
    const tab = await chrome.tabs.get(tabId);
    const rawDeep = await buildDeepEntries(tabId, tab.url || '', normalized.scope || 'both');
    const toggles = await getOriginToggles(origin);
    const deep = filterEntriesByToggles(rawDeep, toggles);
    const extraDomains = uniqueClean(deep.domains).filter(d => !(normalized.writtenDomains || []).includes(d));
    const extraIps = uniqueClean(deep.ips).map(normalizeIpOrSubnet).filter(Boolean).filter(ip => !(normalized.writtenIps || []).includes(ip));
    if (extraDomains.length || extraIps.length) {
      const result = await updateManagedOriginState(origin, (current) => ({
        ...current,
        mode: 'deep',
        scope: normalized.scope || current.scope || 'both',
        writtenDomains: uniqueClean([...(current.writtenDomains || []), ...extraDomains]),
        writtenIps: uniqueClean([...(current.writtenIps || []), ...extraIps]).map(normalizeIpOrSubnet).filter(Boolean),
        lastChangedAt: Date.now(),
        source: 'local'
      }), 'deep');
      const updated = result.state;
      const sessions = await getDeepSessions();
      if (sessions[String(tabId)]) {
        sessions[String(tabId)].knownDomains = updated.writtenDomains;
        sessions[String(tabId)].knownIps = updated.writtenIps;
        await setDeepSessions(sessions);
      }
    }
  } catch (e) { await log.warn('deep', `initial harvest failed ${origin}: ${String(e.message || e)}`); }
}
async function flushDeep(tabId) {
  const sessions = await getDeepSessions();
  const session = sessions[String(tabId)];
  if (!session) return;
  const tab = await chrome.tabs.get(tabId);
  const state = normalizeStateShape(await getOriginState(session.origin), session.origin, 'both');
  if (state.mode !== 'deep') {
    delete sessions[String(tabId)];
    await setDeepSessions(sessions);
    return;
  }
  const scope = normalizeScope(state.scope);
  const toggles = await getOriginToggles(session.origin);
  let domains = uniqueClean(session.pendingDomains).filter(d => !isDomainDisabled(toggles, d)).filter(d => !(state.writtenDomains || []).includes(d));
  let ips = uniqueClean(session.pendingIps).map(normalizeIpOrSubnet).filter(Boolean).filter(ip => !isIpDisabled(toggles, ip)).filter(ip => !(state.writtenIps || []).includes(ip));
  if (scope !== 'domains' && domains.length) {
    const resolved = await resolveDomainsToIps(domains);
    ips = uniqueClean([...ips, ...resolved]).map(normalizeIpOrSubnet).filter(Boolean).filter(ip => !isIpDisabled(toggles, ip)).filter(ip => !(state.writtenIps || []).includes(ip));
  }
  const addDomains = scope === 'ips' ? [] : domains;
  const addIps = scope === 'domains' ? [] : ips;
  session.pendingDomains = [];
  session.pendingIps = [];
  if (!addDomains.length && !addIps.length) {
    sessions[String(tabId)] = session;
    await setDeepSessions(sessions);
    return;
  }
  const result = await updateManagedOriginState(session.origin, (current) => ({
    ...current,
    mode: 'deep',
    scope,
    writtenDomains: uniqueClean([...(current.writtenDomains || []), ...addDomains]),
    writtenIps: uniqueClean([...(current.writtenIps || []), ...addIps]).map(normalizeIpOrSubnet).filter(Boolean),
    lastChangedAt: Date.now(),
    source: 'local'
  }), 'deep');
  const updated = result.state;
  session.knownDomains = updated.writtenDomains;
  session.knownIps = updated.writtenIps;
  sessions[String(tabId)] = session;
  await setDeepSessions(sessions);
}
const debounce = new Map();
function scheduleDeepFlush(tabId) {
  clearTimeout(debounce.get(tabId));
  debounce.set(tabId, setTimeout(() => flushDeep(tabId).catch(e => log.error('deep', String(e.message || e))), 5000));
}
chrome.webRequest.onBeforeRequest.addListener((details) => {
  if (details.tabId < 0 || !details.url) return;
  (async () => {
    let pageOrigin = '';
    try {
      const tab = await chrome.tabs.get(details.tabId);
      pageOrigin = analyzeUrl(tab.url || '').origin || '';
    } catch {}
    await recordTabRequest(details.tabId, details.url, pageOrigin);

    const sessions = await getDeepSessions();
    const session = sessions[String(details.tabId)];
    if (!session) return;
    const a = analyzeUrl(details.url);
    if (!a.isHttpScheme) return;
    if (a.isIp && isIpv4(a.asciiHostname)) session.pendingIps.push(a.asciiHostname);
    else if (a.origin && a.origin !== session.origin) {
      session.pendingDomains.push(a.origin);
      if (a.asciiHostname && a.asciiHostname !== a.origin) session.pendingDomains.push(a.asciiHostname);
    }
    sessions[String(details.tabId)] = session;
    await setDeepSessions(sessions);
    scheduleDeepFlush(details.tabId);
  })().catch(e => log.error('request', String(e.message || e)));
}, { urls: ['<all_urls>'] });
chrome.tabs.onRemoved.addListener(tabId => { stopDeep(tabId).catch(() => {}); getTabRequests().then(all => { delete all[String(tabId)]; return setTabRequests(all); }).catch(() => {}); });
chrome.tabs.onUpdated.addListener((tabId, info) => { if (info.url) { stopDeep(tabId).catch(() => {}); getTabRequests().then(all => { delete all[String(tabId)]; return setTabRequests(all); }).catch(() => {}); } });

function iconPath(name) { return {16:`icons/${name}-16.png`,32:`icons/${name}-32.png`,48:`icons/${name}-48.png`,128:`icons/${name}-128.png`}; }
async function setTabIcon(tabId, mode) { try { await chrome.action.setIcon({ tabId, path: iconPath(mode || 'direct') }); } catch {} }
async function setGlobalIcon(mode) { try { await chrome.action.setIcon({ path: iconPath(mode || 'direct') }); } catch {} }
async function refreshIconForTab(tabId) {
  try {
    const settings = await getSettings();
    if (!settings.configured) { await setTabIcon(tabId, 'not-configured'); return; }
    const tab = await chrome.tabs.get(tabId);
    const a = analyzeUrl(tab.url || '');
    if (!a.origin) { await setTabIcon(tabId, 'direct'); return; }
    const state = normalizeStateShape(await getOriginState(a.origin), a.origin, settings.profileScope?.default || 'both');
    await setTabIcon(tabId, state?.mode || 'direct');
  } catch {}
}
async function refreshAllTabIcons() {
  const settings = await getSettings();
  if (!settings.configured) await setGlobalIcon('not-configured');
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) if (typeof tab.id === 'number') refreshIconForTab(tab.id);
}

// Extension action uses manifest default_popup. Single click opens the popup; no background toggle is performed.
chrome.tabs.onActivated.addListener(({ tabId }) => refreshIconForTab(tabId));
chrome.tabs.onUpdated.addListener((tabId, info) => { if (info.status === 'complete' || info.url) refreshIconForTab(tabId); });

async function buildPopupSnapshot(tabId) {
  const settings = await getSettings();
  const out = {
    configured: settings.configured,
    isHttpScheme: false,
    resolvedIps: [],
    ipsLoading: false,
    profiles: settings.profiles,
    activeProfile: settings.activeProfile,
    profileScope: settings.profileScope?.[settings.activeProfile] || 'both',
    defaultMode: settings.defaultMode,
    outboxPending: 0,
    rateLimitLow: false,
    theme: settings.theme,
    locale: settings.locale,
    routerUrl: settings.routerUrl
  };
  try {
    const tab = await chrome.tabs.get(tabId);
    out.tabUrl = tab.url || '';
    const a = analyzeUrl(tab.url || '');
    out.isHttpScheme = !!a.isHttpScheme;
    if (a.origin) out.origin = a.origin;
    if (a.asciiHostname) out.fullHostname = a.asciiHostname;
    if (a.origin) {
      out.toggles = await getOriginToggles(a.origin);
    }
    if (a.origin && settings.configured) {
      const state = normalizeStateShape(await getOriginState(a.origin), a.origin, out.profileScope);
      out.originState = state;
      out.profileScope = state.scope || out.profileScope;
    }
    if (a.asciiHostname && a.isHttpScheme && !a.isIp) {
      out.ipsLoading = true;
      const ips = await resolveHostSafe(a.asciiHostname);
      out.resolvedIps = ips;
      out.ipsLoading = false;
    } else if (a.asciiHostname && a.isHttpScheme && a.isIp) {
      out.resolvedIps = isIpv4(a.asciiHostname) ? [a.asciiHostname] : [];
      out.ipsLoading = false;
    }
    if (a.origin && a.isHttpScheme) {
      out.requests = await getVisibleRequestsForTab(tabId, a.origin, null);
      scheduleVisibleRequestHarvest(tabId, a.origin);
    }
  } catch {}
  return out;
}
async function completeSetup(payload) {
  const url = String(payload.routerUrl || '').trim() || DEFAULT_SETTINGS.routerUrl;
  const token = String(payload.routerToken || '').trim();
  if (!token) return { ok: false, code: 'missingToken', error: 'Router API token is required' };
  try { await testRouterCredentials(url, token); }
  catch (e) {
    const msg = String(e.message || e);
    await log.warn('router', `API test failed: ${msg}`);
    return { ok: false, error: msg, code: msg.toLowerCase().includes('invalid token') ? 'invalidToken' : 'apiTestFailed' };
  }

  const current = await getSettings();
  const localBeforeSetup = await getOriginStates();
  const localBeforeAgg = aggregateManagedEntries(localBeforeSetup);
  const hasLocalLibrary = Boolean(
    Object.keys(localBeforeSetup || {}).length ||
    localBeforeAgg.domains.length ||
    localBeforeAgg.ips.length
  );

  await patchSettings({
    routerUrl: url,
    routerToken: token,
    configured: true,
    activeProfile: 'default',
    profiles: ['default'],
    profileScope: { default: 'both' },
    defaultMode: payload.defaultMode || current.defaultMode || 'base'
  });

  if (!hasLocalLibrary) {
    const routerLists = await getRouterLists();
    const hasRouterLists = Boolean(
      (routerLists.domains || []).length ||
      (routerLists.subnets || []).length ||
      (routerLists.rawDomains || []).length ||
      (routerLists.rawSubnets || []).length
    );

    if (hasRouterLists) {
      await reconcileLocalLibraryWithRouterLists(routerLists);
      await log.success('system', `setup complete — imported existing OpenWrt lists from ${url}`);
    } else {
      await commitOriginStates({}, 'setup-replace-empty', 'setup');
      await log.success('system', `setup complete — connected to ${url}`);
    }
  } else {
    await commitOriginStates(localBeforeSetup, 'setup-replace-local', 'setup');
    await log.success('system', `setup complete — synced local library to ${url}`);
  }

  await setGlobalIcon('direct');
  return { ok: true };
}

chrome.runtime.onInstalled.addListener(async (details) => {
  const raw = await chrome.storage.local.get(keys.settings);
  const saved = raw[keys.settings];
  if (!saved) await chrome.storage.local.set({ [keys.settings]: DEFAULT_SETTINGS });
  else if (saved.schemaVersion !== '1.3.24') await patchSettings({ ...saved, schemaVersion: '3.64', profileScope: { ...(saved.profileScope || {}), [saved.activeProfile || 'default']: 'both' } });
  await refreshAllTabIcons();
});
chrome.runtime.onStartup.addListener(refreshAllTabIcons);



async function addLibraryEntry(target, rawValue) {
  const parsed = normalizeLibraryEntryKindValue(rawValue);
  const states = await getOriginStates();
  const toggles = await getGlobalToggles();

  if (target === 'direct') {
    const nextToggles = normalizeToggles({
      disabledDomains: parsed.kind === 'domain' && !toggles.disabledDomains.includes(parsed.value) ? [...toggles.disabledDomains, parsed.value] : toggles.disabledDomains,
      disabledIps: parsed.kind === 'ip' && !toggles.disabledIps.includes(parsed.value) ? [...toggles.disabledIps, parsed.value] : toggles.disabledIps
    });
    await setGlobalToggles(nextToggles);
    const nextStates = filterStatesByGlobalToggles(states, nextToggles);
    const committed = await commitOriginStates(nextStates, 'library-direct', 'library');
    await refreshAllTabIcons();
    return { ok: true, target, entry: parsed, disabled: nextToggles, ...buildLibraryView(nextStates), committed };
  }

  if (target === 'proxied') {
    const nextToggles = normalizeToggles({
      disabledDomains: parsed.kind === 'domain' ? toggles.disabledDomains.filter(x => x !== parsed.value) : toggles.disabledDomains,
      disabledIps: parsed.kind === 'ip' ? toggles.disabledIps.filter(x => x !== parsed.value) : toggles.disabledIps
    });
    await setGlobalToggles(nextToggles);

    const currentManual = normalizeStateShape(states[MANUAL_PROXY_ORIGIN], MANUAL_PROXY_ORIGIN, 'both');
    const nextManual = sanitizeOriginStateForStorage({
      ...currentManual,
      origin: MANUAL_PROXY_ORIGIN,
      mode: 'base',
      scope: 'both',
      writtenDomains: parsed.kind === 'domain' ? uniqueClean([...(currentManual.writtenDomains || []), parsed.value]) : uniqueClean(currentManual.writtenDomains || []),
      writtenIps: parsed.kind === 'ip' ? uniqueClean([...(currentManual.writtenIps || []), parsed.value]).map(normalizeIpOrSubnet).filter(Boolean) : uniqueClean(currentManual.writtenIps || []).map(normalizeIpOrSubnet).filter(Boolean),
      knownDomains: parsed.kind === 'domain' ? uniqueClean([...(currentManual.knownDomains || []), parsed.value]) : uniqueClean(currentManual.knownDomains || []),
      knownIps: parsed.kind === 'ip' ? uniqueClean([...(currentManual.knownIps || []), parsed.value]).map(normalizeIpOrSubnet).filter(Boolean) : uniqueClean(currentManual.knownIps || []).map(normalizeIpOrSubnet).filter(Boolean),
      lastChangedAt: Date.now(),
      source: 'manual'
    });
    const nextStates = filterStatesByGlobalToggles({ ...states, [MANUAL_PROXY_ORIGIN]: nextManual }, nextToggles);
    const committed = await commitOriginStates(nextStates, 'library-proxied', 'library');
    await refreshAllTabIcons();
    return { ok: true, target, entry: parsed, disabled: nextToggles, ...buildLibraryView(nextStates), committed };
  }

  throw new Error('Unsupported library target');
}


async function removeLibraryEntry(target, kind, rawValue) {
  const parsed = normalizeLibraryEntryKindValue(rawValue);
  const normalizedKind = kind === 'ip' ? 'ip' : parsed.kind;
  const value = normalizedKind === 'ip' ? normalizeIpOrSubnet(parsed.value) : parsed.value;
  if (!value) throw new Error('Invalid entry');

  const states = await getOriginStates();

  if (target === 'direct') {
    const toggles = await getGlobalToggles();
    const nextToggles = normalizeToggles({
      disabledDomains: normalizedKind === 'domain' ? toggles.disabledDomains.filter(x => x !== value) : toggles.disabledDomains,
      disabledIps: normalizedKind === 'ip' ? toggles.disabledIps.filter(x => x !== value) : toggles.disabledIps
    });
    await setGlobalToggles(nextToggles);
    const nextStates = { ...states };
    for (const [origin, rawState] of Object.entries(states || {})) {
      if (origin === GLOBAL_TOGGLE_KEY) continue;
      const state = sanitizeOriginStateForStorage(rawState);
      if (!state || state.origin === MANUAL_PROXY_ORIGIN) continue;
      const scope = normalizeScope(state.scope || 'both');
      const patch = { ...state };
      if (normalizedKind === 'domain' && scope !== 'ips' && (state.knownDomains || []).includes(value)) {
        patch.writtenDomains = uniqueClean([...(state.writtenDomains || []), value]);
      }
      if (normalizedKind === 'ip' && scope !== 'domains' && (state.knownIps || []).map(normalizeIpOrSubnet).filter(Boolean).includes(value)) {
        patch.writtenIps = uniqueClean([...(state.writtenIps || []), value]).map(normalizeIpOrSubnet).filter(Boolean);
      }
      const saved = sanitizeOriginStateForStorage(patch);
      if (saved) nextStates[origin] = saved;
    }
    const committed = await commitOriginStates(nextStates, 'library-direct-remove', 'library');
    await refreshAllTabIcons();
    return { ok: true, target, entry: { kind: normalizedKind, value }, disabled: nextToggles, ...buildLibraryView(nextStates), committed };
  }

  if (target === 'proxied') {
    const currentManual = normalizeStateShape(states[MANUAL_PROXY_ORIGIN], MANUAL_PROXY_ORIGIN, 'both');
    const nextManual = sanitizeOriginStateForStorage({
      ...currentManual,
      origin: MANUAL_PROXY_ORIGIN,
      mode: 'base',
      scope: 'both',
      writtenDomains: normalizedKind === 'domain' ? uniqueClean(currentManual.writtenDomains || []).filter(x => x !== value) : uniqueClean(currentManual.writtenDomains || []),
      writtenIps: normalizedKind === 'ip' ? uniqueClean(currentManual.writtenIps || []).map(normalizeIpOrSubnet).filter(Boolean).filter(x => x !== value) : uniqueClean(currentManual.writtenIps || []).map(normalizeIpOrSubnet).filter(Boolean),
      knownDomains: uniqueClean(currentManual.knownDomains || []),
      knownIps: uniqueClean(currentManual.knownIps || []).map(normalizeIpOrSubnet).filter(Boolean),
      lastChangedAt: Date.now(),
      source: 'manual'
    });
    const nextStates = { ...states };
    if (nextManual && ((nextManual.writtenDomains || []).length || (nextManual.writtenIps || []).length)) nextStates[MANUAL_PROXY_ORIGIN] = nextManual;
    else delete nextStates[MANUAL_PROXY_ORIGIN];
    const committed = await commitOriginStates(nextStates, 'library-proxied-remove', 'library');
    await refreshAllTabIcons();
    return { ok: true, target, entry: { kind: normalizedKind, value }, ...buildLibraryView(nextStates), disabled: await getGlobalToggles(), committed };
  }

  throw new Error('Unsupported library target');
}

async function toggleEntryForTab(tabId, kind, value) {
  const settings = await getSettings();
  if (!settings.configured) return { ok: false, reason: 'not-configured' };
  const tab = await chrome.tabs.get(tabId);
  const tabUrl = tab.url || '';
  const base = await buildBaseEntries(tabUrl);
  const currentGlobal = await getGlobalToggles();
  const nextGlobal = toggleEntryInToggles(currentGlobal, kind, value);
  await setGlobalToggles(nextGlobal);

  const states = await getOriginStates();
  const nextStates = filterStatesByGlobalToggles(states, nextGlobal);
  const current = normalizeStateShape(states[base.origin], base.origin, settings.profileScope?.default || 'both');

  if (current.mode !== 'direct') {
    const mode = normalizeMode(current.mode);
    const scope = normalizeScope(current.scope || settings.profileScope?.default || 'both');
    const target = await computeTargetEntries(tabId, tabUrl, mode, scope);
    const nextState = sanitizeOriginStateForStorage({
      origin: base.origin,
      mode,
      profileName: 'default',
      scope,
      writtenDomains: uniqueClean(target.domains || []),
      writtenIps: uniqueClean(target.ips || []).map(normalizeIpOrSubnet).filter(Boolean),
      knownDomains: uniqueClean([...(current.knownDomains || []), ...(current.writtenDomains || []), ...(target.domains || []), base.origin, ...(base.origin && !base.origin.startsWith('www.') ? [`www.${base.origin}`] : [])]),
      knownIps: uniqueClean([...(current.knownIps || []), ...(current.writtenIps || []), ...(target.ips || [])]).map(normalizeIpOrSubnet).filter(Boolean),
      lastChangedAt: Date.now(),
      source: 'local'
    });
    if (nextState) nextStates[base.origin] = nextState;
    else delete nextStates[base.origin];
    if (mode === 'deep' && nextState) await startDeep(tabId, base.origin, nextState);
  }

  const committed = await commitOriginStates(nextStates, 'toggle', base.origin);
  await refreshAllTabIcons();
  return { ok: true, origin: base.origin, toggles: nextGlobal, ...committed };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'GET_STATE_FOR_POPUP': return buildPopupSnapshot(message.tabId);
      case 'SET_ORIGIN_MODE': return setModeForTab(message.tabId, message.mode);
      case 'TOGGLE_ENTRY': return toggleEntryForTab(message.tabId, message.kind, message.value);
      case 'ADD_LIBRARY_ENTRY': return addLibraryEntry(message.target, message.value);
      case 'REMOVE_LIBRARY_ENTRY': return removeLibraryEntry(message.target, message.kind, message.value);
      case 'SET_PROFILE_SCOPE': {
        const selectedScope = normalizeScope(message.scope);
        await patchSettings({ profileScope: { default: selectedScope } });
        if (message.origin && typeof message.tabId === 'number') {
          try {
            const tab = await chrome.tabs.get(message.tabId);
            const base = await buildBaseEntries(tab.url || '');
            const current = normalizeStateShape(await getOriginState(base.origin), base.origin, selectedScope);
            if (current.mode !== 'direct') {
              await applyStateTransition(message.tabId, tab.url || '', current, current.mode, selectedScope);
            } else {
              await setOriginState({ ...current, scope: selectedScope });
            }
          } catch (e) {
            await log.warn('scope', `scope reconcile failed ${message.origin}: ${String(e.message || e)}`);
          }
        }
        return { ok: true };
      }
      case 'SWITCH_PROFILE': {
        const s = await getSettings();
        if (!s.profiles.includes(message.profile)) return { ok: false };
        await patchSettings({ activeProfile: message.profile });
        return { ok: true };
      }
      case 'CREATE_PROFILE': {
        const s = await getSettings();
        if (s.profiles.includes(message.profile)) return { ok: false, code: 'profileExists' };
        if (message.profile === '.meta' || !/^[a-zA-Z0-9._-]{1,40}$/.test(message.profile)) return { ok: false, code: 'profileReserved' };
        await patchSettings({ profiles: [...s.profiles, message.profile], activeProfile: message.profile, profileScope: { ...s.profileScope, [message.profile]: 'both' } });
        return { ok: true };
      }
      case 'DELETE_PROFILE_LOCAL': {
        const s = await getSettings();
        const profiles = s.profiles.filter(p => p !== message.profile);
        await patchSettings({ profiles, activeProfile: s.activeProfile === message.profile ? profiles[0] || 'default' : s.activeProfile });
        return { ok: true };
      }
      case 'GET_CONSOLE': return { lines: await getConsole() };
      case 'GET_LOCAL_LIBRARY': return getLocalLibrary();
      case 'GET_ROUTER_LISTS': return getRouterLists();
      case 'SAVE_ROUTER_LISTS': return saveRouterLists(message.domains || '', message.subnets || '');
      case 'GET_ROUTER_CONTROL': return getRouterControlStatus();
      case 'ROUTER_CONTROL_ACTION': return runRouterControlAction(message.action || 'podkopStatus');
      case 'EXPORT_LIBRARY': return exportLibrary();
      case 'IMPORT_LIBRARY': return importLibrary(message.payload, message.strategy || 'replace');
      case 'CLEAR_CONSOLE': await chrome.storage.local.set({ [keys.console]: [] }); return { ok: true };
      case 'RESET_EXTENSION': await chrome.storage.local.clear(); await chrome.storage.local.set({ [keys.settings]: DEFAULT_SETTINGS }); await setGlobalIcon('not-configured'); await log.info('system', 'reset complete'); return { ok: true };
      case 'PING_VALIDATE_TOKEN': {
        const token = String(message.token || '').trim();
        if (!token) return { ok: false, error: { code: 'missingToken', message: 'Token is required' } };
        return { ok: true, value: { login: 'OpenWrt router' } };
      }
      case 'CHECK_REPO': {
        const settings = await getSettings();
        const url = message.repo || settings.routerUrl || DEFAULT_SETTINGS.routerUrl;
        return { ok: true, value: { kind: 'missing', routerUrl: url } };
      }
      case 'SETUP_COMPLETE': return completeSetup(message.payload || {});
      case 'GET_SETTINGS': return getSettings();
      case 'SAVE_SETTINGS': return patchSettings(message.patch || {});
      case 'TEST_ROUTER': {
        const res = await sendRouter({ action: 'test' });
        if (!res?.ok) throw new Error(res?.error || 'Router API test failed');
        await log.success('router', res.message || 'Router API OK');
        return res;
      }
      default: return { ok: false, error: 'unknown message' };
    }
  })().then(sendResponse).catch(e => sendResponse({ ok: false, error: String(e.message || e), errorObj: { code: 'internal', message: String(e.message || e) } }));
  return true;
});

refreshAllTabIcons();
log.info('system', 'service worker ready (router API, router-backed state, deep harvest)');
