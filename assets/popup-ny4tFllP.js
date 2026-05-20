let snap = null;
let settings = null;
let activeTabId = null;
let consoleLines = [];
let busy = false;
let showReset = false;
let resolvedIps = [];
let ipsLoading = false;
let consoleOpen = false;
let view = 'main';
let form = null;
let formError = '';
let formStatus = '';
let library = null;
let libraryBusy = false;
let libraryError = '';
let libraryStatus = '';
let librarySaveOk = false;
let routerListAction = '';
let routerSaveOk = false;
let libraryPane = 'sites';
let librarySitesPane = 'proxied';
let routerLists = null;
let routerListsDraft = { domains: '', subnets: '' };
let routerListsBusy = false;
let syncStatus = 'idle';
let syncResetTimer = null;
let controlData = null;
let controlBusy = false;
let controlAction = '';
let controlError = '';
let controlOk = '';
let controlOutput = '';
let requestsScrollTop = 0;
let pendingEntrySync = null;
let liveEntryWaveOverlay = null;
let libraryAddBusyTarget = '';
let libraryAddDraft = { proxied: '', direct: '' };
let libraryAddError = '';
let libraryDeletePick = null;
let libraryExpandedSites = new Set();
let importPendingText = '';
let importPendingName = '';
let importConfirmOpen = false;
let importOk = false;

const app = document.getElementById('app');
const DEFAULT_ROUTER_URL = 'http://192.168.0.1/cgi-bin/podkop-curator';

function isGlobalSyncLocked() {
  return Boolean(
    busy ||
    controlBusy ||
    libraryBusy ||
    routerListsBusy ||
    libraryAddBusyTarget ||
    pendingEntrySync ||
    routerListAction === 'save' ||
    routerListAction === 'refresh' ||
    controlAction
  );
}

let syncCursorBadge = null;
let syncCursorX = Math.round(window.innerWidth / 2);
let syncCursorY = Math.round(window.innerHeight / 2);

function ensureSyncCursorBadge() {
  if (syncCursorBadge) return syncCursorBadge;
  const badge = document.createElement('div');
  badge.className = 'pm-sync-cursor-badge';
  badge.setAttribute('aria-hidden', 'true');
  badge.innerHTML = '<span class="pm-sync-cursor-ring"></span><span class="pm-sync-cursor-dot"></span>';
  document.body.appendChild(badge);
  syncCursorBadge = badge;
  updateSyncCursorBadge();
  return badge;
}

function removeSyncCursorBadge() {
  if (!syncCursorBadge) return;
  try { syncCursorBadge.remove(); } catch (_) {}
  syncCursorBadge = null;
}

function updateSyncCursorBadge(x = syncCursorX, y = syncCursorY) {
  syncCursorX = x;
  syncCursorY = y;
  if (!syncCursorBadge) return;
  syncCursorBadge.style.transform = `translate3d(${Math.round(syncCursorX - 11)}px, ${Math.round(syncCursorY - 11)}px, 0)`;
}

function applyGlobalSyncLock() {
  const locked = isGlobalSyncLocked();
  document.documentElement.classList.toggle('pm-sync-locked', locked);
  document.querySelectorAll('.popup').forEach(node => node.classList.toggle('pm-sync-locked', locked));
  if (locked) ensureSyncCursorBadge();
  else removeSyncCursorBadge();
}

function blockGlobalSyncInteraction(e) {
  if (!isGlobalSyncLocked()) return;
  const target = e.target;
  if (target?.closest?.('.entry-sync-screen-wave,.entry-sync-screen-wave *')) return;
  if (!target?.closest?.('.popup')) return;
  const interactive = target.closest('button,a,input,textarea,select,summary,label,[role="button"],[data-toggle-kind],[data-library-disable-kind],[data-library-remove-target],[data-library-pick-target],[data-mode],[data-scope],[data-profile]');
  if (!interactive) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation?.();
}

['click','dblclick','pointerdown','pointerup','mousedown','mouseup','submit','keydown','input','change'].forEach(type => {
  document.addEventListener(type, blockGlobalSyncInteraction, true);
});

function rememberSyncPointer(e) {
  if (typeof e.clientX === 'number' && typeof e.clientY === 'number') {
    updateSyncCursorBadge(e.clientX, e.clientY);
  }
}

document.addEventListener('pointerdown', rememberSyncPointer, { capture: true, passive: true });
document.addEventListener('mousedown', rememberSyncPointer, { capture: true, passive: true });
document.addEventListener('click', rememberSyncPointer, { capture: true, passive: true });
document.addEventListener('pointermove', rememberSyncPointer, { passive: true });
document.addEventListener('mousemove', rememberSyncPointer, { passive: true });

function normalizeGatewayToRouterUrl(value) {
  let raw = String(value || '').trim();
  if (!raw) raw = '192.168.0.1';
  raw = raw.replace(/^https?:\/\//i, '').replace(/\/cgi-bin\/podkop-curator.*$/i, '').replace(/\/+$/g, '');
  return `http://${raw}/cgi-bin/podkop-curator`;
}
function routerUrlToGateway(value) {
  let raw = String(value || '').trim();
  raw = raw.replace(/^https?:\/\//i, '').replace(/\/cgi-bin\/podkop-curator.*$/i, '').replace(/\/+$/g, '');
  return raw || '192.168.0.1';
}

function gatewayOctets(value) {
  const gateway = routerUrlToGateway(value);
  const parts = gateway.split('.').slice(0, 4);
  while (parts.length < 4) parts.push('');
  return parts.map((part, index) => {
    const fallback = ['192', '168', '0', '1'][index];
    const clean = String(part || '').replace(/\D/g, '').slice(0, 3);
    return clean || fallback;
  });
}
function gatewayFromOctetInputs() {
  const values = [0,1,2,3].map(i => String(document.getElementById(`gatewayPart${i}`)?.value || '').replace(/\D/g, '').slice(0, 3));
  return values.map((value, index) => value || ['192', '168', '0', '1'][index]).join('.');
}


const t = (key, vars = {}) => {
  const dict = {
    'common.loading': 'Loading…',
    'setup.title': 'Podkop Manager',
    'app.version': '3.92',
    'setup.subtitle': 'Connect to your OpenWrt',
    'setup.step.auth.connect': 'Connect',
    'options.title': 'Settings',
    'popup.reset.title': 'Reset',
    'popup.origin.empty': 'No HTTP/HTTPS site',
    'popup.ips.loading': 'resolving IPv4…',
    'popup.ips.none': 'no public IPv4',
    'popup.requests.title': 'requests',
    'popup.modes.direct': 'Direct',
    'popup.modes.base': 'Base',
    'popup.modes.deep': 'Deep',
    'popup.console.title': 'Console',
    'popup.console.copy': 'Copy',
    'popup.console.empty': 'No log entries yet',
    'popup.scope.domains': 'domains',
    'popup.scope.ips': 'ips',
    'popup.scope.both': 'domains + ips',
    'popup.profile.add': 'add profile',
    'popup.profile.newPlaceholder': 'profile',
    'popup.profile.invalid': 'Invalid profile name',
    'settings.routerUrl': 'Gateway',
    'settings.gatewayHelp': 'OpenWrt router address',
    'settings.routerToken': 'Token',
        'settings.save': 'Save',
    'settings.back': 'Back',
    'settings.connected': 'Router API configured',
    'settings.tokenHelp': 'Token from the OpenWrt installer',
    'common.confirm': 'Confirm',
    'common.cancel': 'Cancel',
    'library.title': 'Overview',
    'library.subtitle': 'Managed routing records',
    'library.empty': 'No saved sites yet',
    'library.open': 'Library',
    'library.export': 'Export',
    'library.import': 'Import',
    'library.back': 'Back',
    'library.domains': 'domains',
    'library.ips': 'ips',
    'library.replaceConfirm': 'Replace local library and sync OpenWrt with imported records?',
    'library.imported': 'Imported and synced',
    'library.sites': 'Sites',
    'library.proxied': 'Proxied',
    'library.direct': 'Direct',
    'library.routerLists': 'Router lists',
    'library.disabled': 'Disabled',
    'library.refresh': 'Refresh',
    'library.saveLists': 'Save',
    'library.domainsList': 'Domain list',
    'library.subnetsList': 'Subnet list',
    'library.routerSubtitle': 'OpenWrt routing lists',
    'library.disabledSubtitle': 'Excluded from proxy',
    'library.proxiedSubtitle': 'Managed routing records',
    'library.addPlaceholder': 'enter domain or ip',
    'library.add': 'Add',
    'library.domainsHint': 'One domain per line.',
    'library.subnetsHint': 'One IPv4 or IPv4 CIDR per line.',
    'library.saved': 'Router lists saved',
    'control.title': 'Settings',
    'control.subtitle': 'OpenWrt control',
    'control.connection': 'Connection',
    'control.podkop': 'Podkop service',
    'control.openwrt': 'OpenWrt',
    'control.testApi': 'Test API',
    'control.restartPodkop': 'Restart Podkop',
    'control.refresh': 'Refresh',
    'control.openLuci': 'Open LuCI',
    'control.running': 'running',
    'control.stopped': 'stopped',
    'control.enabled': 'enabled',
    'control.disabled': 'disabled',
    'control.gateway': 'Gateway',
    'control.token': 'Token',
    'control.done': 'Done',
    'control.stopPodkop': 'Stop Podkop',
    'control.startPodkop': 'Start Podkop',
    'control.disableAutostart': 'Disable autostart',
    'control.enableAutostart': 'Enable autostart',
    'control.rebootRouter': 'Reboot router',
    'control.globalCheck': 'Global check',
    'control.checkPassed': 'Global check passed',
    'control.checkFinished': 'Global check finished',
    'control.rebootRequested': 'Router reboot requested'
  };
  return (dict[key] || key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
};

function svg(name, size = 16) {
  const common = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const icons = {
    settings: `<svg ${common}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
    reset: `<svg ${common}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`,
    chevron: `<svg ${common}><path d="m6 9 6 6 6-6"/></svg>`,
    chevronRight: `<svg ${common}><path d="m9 18 6-6-6-6"/></svg>`,
    copy: `<svg ${common}><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
    library: `<svg ${common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/><path d="M9 7h6"/><path d="M9 11h6"/></svg>`,
    upload: `<svg ${common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/></svg>`,
    download: `<svg ${common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>`,
    sync: `<svg ${common}><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>`,
    check: `<svg ${common}><path d="M20 6 9 17l-5-5"/></svg>`,
    pause: `<svg ${common}><path d="M10 4v16"/><path d="M14 4v16"/></svg>`,
    plus: `<svg ${common}><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
    alert: `<svg ${common}><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`,
    key: `<svg ${common}><circle cx="7.5" cy="12" r="3.3"/><path d="M10.8 12h9.2"/><path d="M16.2 12v3"/><path d="M19.2 12v2.2"/></svg>`,
    back: `<svg ${common}><path d="m15 18-6-6 6-6"/></svg>`,
    loader: `<svg ${common}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`
  };
  return icons[name] || '';
}
async function send(msg) { return await chrome.runtime.sendMessage(msg); }
async function loadLibrary() {
  libraryBusy = true;
  libraryError = '';
  try { library = await send({ type: 'GET_LOCAL_LIBRARY' }); }
  catch (e) { libraryError = String(e.message || e); }
  libraryBusy = false;
}
async function loadRouterLists() {
  routerListsBusy = true;
  libraryError = '';
  try {
    routerLists = await send({ type: 'GET_ROUTER_LISTS' });
    routerListsDraft = {
      domains: (routerLists.rawDomains || routerLists.domains || []).join('\n'),
      subnets: (routerLists.rawSubnets || routerLists.subnets || []).join('\n')
    };
  } catch (e) {
    libraryError = String(e.message || e);
  }
  routerListsBusy = false;
}
function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
async function exportLibraryFile() {
  const res = await send({ type: 'EXPORT_LIBRARY' });
  if (!res?.ok) throw new Error(res?.error || 'Export failed');
  downloadJson(`podkop-manager-${new Date().toISOString().slice(0,10)}.json`, res.payload);
}

function normalizeSetupError(message) {
  const text = String(message || '').trim();
  const low = text.toLowerCase();
  if (
    low.includes('signal is aborted') ||
    low.includes('aborterror') ||
    low.includes('failed to fetch') ||
    low.includes('networkerror') ||
    low.includes('network error') ||
    low.includes('load failed') ||
    low.includes('router api test failed')
  ) return 'OpenWrt not found';
  return text || 'Setup failed';
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function fmtTime(ts) { return new Date(ts).toLocaleTimeString([], { hour12: false }); }
function normalizeScope(v) { return ['domains','both','ips'].includes(v) ? v : 'both'; }
function normalizeMode(v) { return ['base','deep'].includes(v) ? v : 'base'; }

function syncFormFromSettings(force = false) {
  if (!settings) return;
  if (form && !force) return;
  const active = settings.activeProfile || 'default';
  form = {
    routerUrl: settings.routerUrl || DEFAULT_ROUTER_URL,
    routerToken: settings.routerToken || '',
    defaultMode: normalizeMode(settings.defaultMode || 'base')
  };
}

async function refresh(doRender = true) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id ?? null;
  settings = await send({ type: 'GET_SETTINGS' });
  syncFormFromSettings(!form);
  if (activeTabId == null) return;
  const prevOrigin = snap?.origin || '';
  const prevRequestsOpen = Boolean(snap?.requestsOpen);
  const prevRequestsScrollTop = requestsScrollTop || document.querySelector('.requests-inline-list')?.scrollTop || 0;
  snap = await send({ type: 'GET_STATE_FOR_POPUP', tabId: activeTabId });
  snap.requestsOpen = prevOrigin && snap.origin === prevOrigin ? prevRequestsOpen : false;
  requestsScrollTop = snap.requestsOpen ? prevRequestsScrollTop : 0;
  const c = await send({ type: 'GET_CONSOLE' });
  consoleLines = (c.lines || []).slice(-200);
  resolvedIps = snap.resolvedIps ?? snap.originState?.writtenIps ?? [];
  ipsLoading = Boolean(snap.ipsLoading);
  if (!snap.configured) view = 'setup';
  if (view === 'library') await loadLibrary();
  if (doRender) render();
}

function updateFormFromDom() {
  if (!form) syncFormFromSettings(true);
  form.routerUrl = normalizeGatewayToRouterUrl(gatewayFromOctetInputs());
  form.routerToken = document.getElementById('routerToken')?.value.trim() || '';
}

function renderProfilePicker() {
  const profiles = snap.profiles || ['default'];
  const active = snap.activeProfile || profiles[0] || 'default';
  return `<div class="profile-picker svelte-1j6himo">
    <button type="button" class="trigger pk-pill svelte-1j6himo" id="profileTrigger"><span class="profile-active svelte-1j6himo">${escapeHtml(active)}</span>${svg('chevron', 14)}</button>
    <div class="dropdown pk-glass-strong svelte-1j6himo" id="profileDropdown" hidden>
      <div class="dropdown-header svelte-1j6himo">profiles</div>
      <ul class="profile-list svelte-1j6himo">${profiles.map(p => `<li><button type="button" class="profile-item ${p === active ? 'is-active' : ''} svelte-1j6himo" data-profile="${escapeHtml(p)}"><span>${escapeHtml(p)}</span>${p === active ? svg('check', 14) : ''}</button></li>`).join('')}</ul>
      <div class="dropdown-divider svelte-1j6himo"></div>
      <button type="button" class="add-row svelte-1j6himo" id="addProfile">${svg('plus', 14)} ${t('popup.profile.add')}</button>
      <div class="create-row svelte-1j6himo" id="createProfileRow" hidden><input class="create-input svelte-1j6himo" id="profileName" placeholder="${t('popup.profile.newPlaceholder')}"><button class="create-btn svelte-1j6himo" id="createProfile">OK</button></div>
      <div class="error svelte-1j6himo" id="profileError" hidden></div>
    </div>
  </div>`;
}
function renderModeStack() {
  const current = snap.originState?.mode || 'direct';
  return `<div class="mode-stack svelte-1kqa27u" role="radiogroup" aria-label="mode">${['direct','base','deep'].map(m => `<button type="button" class="mode-btn ${m === current ? 'active' : ''} svelte-1kqa27u" data-mode="${m}" data-theme-mode="${m}" role="radio" aria-checked="${m === current}" ${busy ? 'disabled' : ''}><span class="mode-label svelte-1kqa27u">${t('popup.modes.'+m)}</span>${m === current ? '<span class="mode-shimmer svelte-1kqa27u" aria-hidden="true"></span>' : ''}</button>`).join('')}</div>`;
}
function renderScopeStack(current = snap?.profileScope || 'both', attr = 'data-scope') {
  const items = [['both', t('popup.scope.both')], ['domains', t('popup.scope.domains')], ['ips', t('popup.scope.ips')]];
  return `<div class="scope-stack svelte-1x42u97">${items.map(([id,label]) => `<button type="button" class="scope-btn ${id === current ? 'active' : ''} svelte-1x42u97" ${attr}="${id}" ${busy ? 'disabled' : ''}>${label}</button>`).join('')}</div>`;
}
function renderConsole() {
  if (!consoleOpen) return '';
  const lines = consoleLines || [];
  return `<section class="console svelte-k3nlc3 open"><div class="console-toggle svelte-k3nlc3"><span class="caret svelte-k3nlc3">${svg('chevronRight', 14)}</span><span class="title svelte-k3nlc3">${t('popup.console.title')}</span><span class="count svelte-k3nlc3">${lines.length}</span><span role="button" tabindex="0" class="copy-btn svelte-k3nlc3" id="copyConsole">${svg('copy', 12)}<span class="copy-label svelte-k3nlc3">${t('popup.console.copy')}</span></span></div><div class="console-body svelte-k3nlc3" id="consoleBody">${lines.length ? lines.map(l => `<div class="line svelte-k3nlc3" data-channel="${escapeHtml(l.channel)}" data-level="${escapeHtml(l.level)}"><span class="time svelte-k3nlc3">${fmtTime(l.at)}</span><span class="channel svelte-k3nlc3">${escapeHtml(l.channel)}</span><span class="text svelte-k3nlc3">${escapeHtml(l.text)}</span></div>`).join('') : `<div class="empty svelte-k3nlc3">${t('popup.console.empty')}</div>`}</div></section>`;
}

function renderAppFooter() {
  return '';
}

function renderResetModal() {
  if (!showReset) return '';
  return `<div class="overlay svelte-1qkpgkj"><div class="modal pk-glass-strong svelte-1qkpgkj"><h2 class="svelte-1qkpgkj">${t('popup.reset.title')}</h2><p class="svelte-1qkpgkj">Reset local extension state and show setup?</p><div class="actions svelte-1qkpgkj"><button class="btn-ghost svelte-1qkpgkj" id="cancelReset">${t('common.cancel')}</button><button class="btn-danger svelte-1qkpgkj" id="confirmReset">${t('common.confirm')}</button></div></div></div>`;
}
function renderBrandHeader(subtitle = 'OpenWrt routing control', options = {}) {
  const actions = options.actions || '';
  const back = options.back ? `<button type="button" class="tool-btn brand-back" id="backToMain" title="${t('settings.back')}">${svg('back',15)}</button>` : '';
  const byline = options.byline ? `<a class="brand-byline svelte-2iqjbh" href="https://github.com/yakcom" target="_blank" rel="noreferrer">by yakcom</a>` : '';
  return `<header class="brand-head svelte-2iqjbh">${back}<div class="brand-mark svelte-2iqjbh" aria-hidden="true"><svg class="brand-logo svelte-2iqjbh" viewBox="0 0 64 64" role="img"><path class="logo-shell svelte-2iqjbh" d="M32 5 55 18v20c0 10-7 18-23 21C16 56 9 48 9 38V18L32 5Z"/><path class="logo-cut svelte-2iqjbh" d="M22 39 32 25l10 14"/><circle class="logo-node svelte-2iqjbh" cx="22" cy="39" r="4"/><circle class="logo-node svelte-2iqjbh" cx="32" cy="25" r="4"/><circle class="logo-node svelte-2iqjbh" cx="42" cy="39" r="4"/></svg></div><div class="brand-copy svelte-2iqjbh"><div class="brand-title-wrap svelte-2iqjbh"><span class="brand-version-top svelte-2iqjbh">${t('app.version')}</span><div class="brand-title-row svelte-2iqjbh"><div class="brand-title svelte-2iqjbh">Podkop Manager</div></div></div><div class="brand-subtitle svelte-2iqjbh">${escapeHtml(subtitle)}</div>${byline}</div>${actions}</header>`;
}

function renderSetupView(isSettings = false) {
  syncFormFromSettings();
  const subtitle = isSettings ? t('settings.connected') : t('setup.subtitle');
  return `<main class="popup svelte-2iqjbh ${busy ? 'is-busy' : ''}"><section class="setup-panel pk-glass-strong svelte-2iqjbh">
    ${renderBrandHeader(subtitle, { back: isSettings, byline: true })}
    <label class="setup-field svelte-2iqjbh"><span>${t('settings.routerUrl')}</span><div class="gateway-grid svelte-2iqjbh">${gatewayOctets(form.routerUrl).map((part, index) => `<input id="gatewayPart${index}" class="gateway-part svelte-2iqjbh" value="${escapeHtml(part)}" inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="off" spellcheck="false" ${busy ? 'disabled' : ''}>${index < 3 ? '<span class="gateway-dot svelte-2iqjbh">.</span>' : ''}`).join('')}</div><small>${t('settings.gatewayHelp')}</small></label>
    <label class="setup-field svelte-2iqjbh"><span>${t('settings.routerToken')}</span><div class="token-shell svelte-2iqjbh"><span class="token-mark svelte-2iqjbh" aria-hidden="true">${svg('key', 14)}</span><input id="routerToken" type="password" class="token-input svelte-2iqjbh" value="${escapeHtml(form.routerToken)}" placeholder="77afb92aaa4b5a26…" autocomplete="off" spellcheck="false" ${busy ? 'disabled' : ''}></div><small>${t('settings.tokenHelp')}</small></label>
    ${formError ? `<div class="setup-toast setup-toast-error svelte-2iqjbh">${svg('alert', 13)}<span>${escapeHtml(formError)}</span></div>` : ''}
    ${formStatus ? `<div class="setup-toast setup-toast-ok svelte-2iqjbh">${svg('check', 13)}<span>${escapeHtml(formStatus)}</span></div>` : ''}
    <div class="setup-actions svelte-2iqjbh">${isSettings ? `<button type="button" class="btn-ghost svelte-2iqjbh" id="backToMain2" ${busy ? 'disabled' : ''}>${t('settings.back')}</button>` : ''}<button type="button" class="btn-primary svelte-2iqjbh" id="saveSetup" ${busy || !form.routerToken ? 'disabled' : ''}>${busy ? svg('loader',14) : ''}${isSettings ? t('settings.save') : t('setup.step.auth.connect')}</button></div>
  </section>${renderImportConfirmModal()}${renderAppFooter()}${renderConsole()}${renderResetModal()}</main>`;
}


async function loadControl() {
  controlBusy = true;
  controlError = '';
  controlOk = '';
  try { controlData = await send({ type: 'GET_ROUTER_CONTROL' }); }
  catch (e) { controlError = String(e.message || e); }
  controlBusy = false;
}

function shortToken(token) {
  const s = String(token || '');
  if (!s) return 'empty';
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function skeletonLine(className = '') {
  return `<span class="pm-skeleton ${className}"></span>`;
}

function renderControlView() {
  const gateway = routerUrlToGateway(settings?.routerUrl || DEFAULT_ROUTER_URL);
  const token = shortToken(settings?.routerToken || '');
  const podkop = controlData?.podkop || {};
  const lists = controlData?.lists || {};
  const hasControlData = Boolean(controlData);
  const loadingControl = controlBusy && controlAction === 'refresh' && !hasControlData;
  const running = Boolean(podkop.running);
  const enabled = Boolean(podkop.enabled);
  const statusText = loadingControl ? '' : running ? t('control.running') : t('control.stopped');
  const enabledText = loadingControl ? '' : enabled ? t('control.enabled') : t('control.disabled');
  const togglePodkopAction = running ? 'stopPodkop' : 'startPodkop';
  const togglePodkopText = loadingControl ? t('control.stopPodkop') : running ? t('control.stopPodkop') : t('control.startPodkop');
  const toggleAutostartAction = enabled ? 'disablePodkopAutostart' : 'enablePodkopAutostart';
  const toggleAutostartText = loadingControl ? t('control.disableAutostart') : enabled ? t('control.disableAutostart') : t('control.enableAutostart');
  const domainMetric = loadingControl ? skeletonLine('metric') : `${lists.domains || 0} domains`;
  const subnetMetric = loadingControl ? skeletonLine('metric') : `${lists.subnets || 0} IPv4`;
  return `<main class="popup svelte-2iqjbh ${controlBusy ? 'is-busy' : ''}"><section class="control-panel pk-glass-strong control-panel-unified">
    <header class="control-head"><button type="button" class="tool-btn" id="backControl" title="${t('settings.back')}">${svg('back',15)}</button><div class="control-title-wrap"><h1>${t('control.title')}</h1><p>${t('control.subtitle')}</p></div><button type="button" class="tool-btn control-refresh ${controlBusy && controlAction === 'refresh' ? 'spinning' : ''}" id="refreshControl" ${controlBusy ? 'disabled' : ''} title="${t('control.refresh')}">${svg('sync',15)}</button></header>
    ${controlError ? `<div class="control-toast error">${svg('alert',13)}<span>${escapeHtml(controlError)}</span></div>` : ''}
    ${controlOk ? `<div class="control-toast ok">${svg('check',13)}<span>${escapeHtml(controlOk)}</span></div>` : ''}
    <div class="control-grid control-grid-unified ${controlBusy ? 'is-locked' : ''}">
      <article class="control-card control-card-unified">
        <div class="control-info-stack">
          <div class="control-info-grid control-info-main">
            <div class="control-mini-status ${loadingControl ? 'is-loading' : running ? 'is-running' : 'is-stopped'}">
              <span class="mini-led"></span>
              <em>${loadingControl ? skeletonLine('service-sub') : enabledText}</em>
              <strong>${loadingControl ? skeletonLine('service-main') : statusText}</strong>
            </div>
            <div class="control-connect-field"><span>${t('control.gateway')}</span><code>${escapeHtml(gateway)}</code></div>
            <div class="control-connect-field"><span>${t('control.token')}</span><code>${escapeHtml(token)}</code></div>
          </div>
          <div class="control-info-grid control-info-metrics">
            <div class="control-connect-field control-metric-field"><span>Domains proxy</span><code>${loadingControl ? skeletonLine('metric') : `${lists.domains || 0}`}</code></div>
            <div class="control-connect-field control-metric-field"><span>IPv4 proxy</span><code>${loadingControl ? skeletonLine('metric') : `${lists.subnets || 0}`}</code></div>
          </div>
        </div>

        <div class="control-actions-grid">
          <button type="button" class="control-action-btn" id="openLuci" ${controlBusy ? 'disabled' : ''}><span>${t('control.openLuci')}</span></button>
          <button type="button" class="control-action-btn primary ${controlBusy && controlAction === 'restartPodkop' ? 'busy' : ''}" id="restartPodkop" ${controlBusy ? 'disabled' : ''}>${controlBusy && controlAction === 'restartPodkop' ? svg('loader',14) : ''}<span>${t('control.restartPodkop')}</span></button>
          <button type="button" class="control-action-btn ${running ? 'danger' : 'primary'} ${controlBusy && controlAction === togglePodkopAction ? 'busy' : ''}" id="togglePodkop" data-control-action="${togglePodkopAction}" ${controlBusy ? 'disabled' : ''}>${controlBusy && controlAction === togglePodkopAction ? svg('loader',14) : ''}<span>${togglePodkopText}</span></button>
          <button type="button" class="control-action-btn ${enabled ? 'danger' : ''} ${controlBusy && controlAction === toggleAutostartAction ? 'busy' : ''}" id="toggleAutostart" data-control-action="${toggleAutostartAction}" ${controlBusy ? 'disabled' : ''}>${controlBusy && controlAction === toggleAutostartAction ? svg('loader',14) : ''}<span>${toggleAutostartText}</span></button>
          <button type="button" class="control-action-btn danger ${controlBusy && controlAction === 'rebootRouter' ? 'busy' : ''}" id="rebootRouter" ${controlBusy ? 'disabled' : ''}>${controlBusy && controlAction === 'rebootRouter' ? svg('loader',14) : ''}<span>${t('control.rebootRouter')}</span></button>
        </div>
      </article>
    </div>
  </section>${renderAppFooter()}${renderConsole()}${renderResetModal()}</main>`;
}



function renderImportConfirmModal() {
  if (!importConfirmOpen) return '';
  const fileName = importPendingName || 'selected file';
  return `<div class="import-confirm-overlay"><div class="import-confirm-modal pk-glass-strong"><div class="import-confirm-icon">${svg('download',18)}</div><h2>Import this file?</h2><p>Current overview data will be replaced and synced to OpenWrt.</p><div class="import-confirm-file">${escapeHtml(fileName)}</div><div class="import-confirm-actions"><button type="button" class="import-confirm-btn ghost" id="cancelImportConfirm">Cancel</button><button type="button" class="import-confirm-btn primary" id="confirmImportReplace">Import</button></div></div></div>`;
}

function renderLibraryView() {
  const data = library || { sites: [], siteCount: 0, domainCount: 0, ipCount: 0, aggregate: { domains: [], ips: [] }, disabled: { disabledDomains: [], disabledIps: [] } };
  const sites = data.sites || [];
  const disabledData = data.disabled || {};
  const disabledDomains = disabledData.disabledDomains || [];
  const disabledIps = disabledData.disabledIps || [];

  const renderManualChip = (value, kind, target = 'direct') => {
    const selected = libraryDeletePick?.target === target && libraryDeletePick?.kind === kind && libraryDeletePick?.value === value;
    return `<span class="library-chip-wrap ${selected ? 'selected' : ''} ${isPendingEntry(kind, value) ? 'is-syncing-entry' : ''}"><button type="button" class="library-manual-chip ${selected ? 'selected' : ''} ${isPendingEntry(kind, value) ? 'is-syncing-entry' : ''}" data-library-pick-target="${escapeHtml(target)}" data-library-pick-kind="${kind}" data-library-pick-value="${escapeHtml(value)}"><code>${escapeHtml(value)}</code></button>${selected ? `<button type="button" class="library-chip-remove" data-library-remove-target="${escapeHtml(target)}" data-library-remove-kind="${kind}" data-library-remove-value="${escapeHtml(value)}" title="Remove" aria-label="Remove ${escapeHtml(value)}">×</button>` : ''}</span>`;
  };

  const directHtml = `<div class="disabled-library"><div class="disabled-section ${disabledDomains.length ? '' : 'is-empty'}"><div class="disabled-title">Domains <em>${disabledDomains.length}</em></div>${disabledDomains.length ? `<div class="disabled-chip-list">${disabledDomains.map(v => renderManualChip(v, 'domain', 'direct')).join('')}</div>` : ''}</div><div class="disabled-section ${disabledIps.length ? '' : 'is-empty'}"><div class="disabled-title">IPv4 <em>${disabledIps.length}</em></div>${disabledIps.length ? `<div class="disabled-chip-list">${disabledIps.map(v => renderManualChip(v, 'ip', 'direct')).join('')}</div>` : ''}</div><form class="library-add-form ${libraryAddError && librarySitesPane === 'direct' ? 'invalid' : ''}" data-add-target="direct"><input class="library-add-input" value="${escapeHtml(libraryAddDraft.direct || '')}" placeholder="${t('library.addPlaceholder')}" autocomplete="off" spellcheck="false" ${libraryAddBusyTarget === 'direct' ? 'disabled' : ''}><button type="submit" class="library-add-btn ${libraryAddBusyTarget === 'direct' ? 'spinning' : ''}" title="${t('library.add')}" ${libraryAddBusyTarget === 'direct' ? 'disabled' : ''}>${libraryAddBusyTarget === 'direct' ? svg('loader',14) : svg('plus',14)}</button></form></div>`;

  const renderSiteEntryChip = (value, kind, active = true) =>
    `<button type="button" class="library-chip route-toggle ${active ? 'active' : 'off'} ${isPendingEntry(kind, value) ? 'is-syncing-entry' : ''}" data-library-disable-kind="${kind}" data-library-disable-value="${escapeHtml(value)}" title="${active ? 'Move to Direct' : 'Already direct'}">${escapeHtml(value)}</button>`;

  const siteRows = (libraryBusy && !sites.length) ? `<div class="library-empty">${t('common.loading')}</div>` : sites.length ? sites.map(site => {
    const activeDomains = site.domains || [];
    const activeIps = site.ips || [];
    const disabledSiteDomains = site.disabledDomains || [];
    const disabledSiteIps = site.disabledIps || [];
    const allDomains = [...activeDomains.map(v => [v, true]), ...disabledSiteDomains.map(v => [v, false])];
    const allIps = [...activeIps.map(v => [v, true]), ...disabledSiteIps.map(v => [v, false])];
    const originDisabled = disabledDomains.includes(String(site.origin || '').toLowerCase());
    const originPending = isPendingEntry('domain', site.origin);
    const noEffectiveProxy = (site.mode || 'direct') === 'direct' || (!activeDomains.length && !activeIps.length);
    const cardOff = originDisabled || noEffectiveProxy;
    const scopeText = site.scope === 'both' ? 'DOMAINS + IPS' : String(t('popup.scope.' + site.scope) || site.scope).toUpperCase();
    const modeText = String(site.mode || 'direct').toUpperCase();
    const expanded = libraryExpandedSites.has(site.origin);
    const originTitle = originDisabled ? `Enable ${escapeHtml(site.origin)} globally` : `Disable ${escapeHtml(site.origin)} globally`;
    return `<article class="library-site pk-glass ${expanded ? 'expanded' : ''} ${cardOff ? 'is-site-off' : ''} ${originDisabled ? 'origin-globally-disabled' : ''}" data-library-site="${escapeHtml(site.origin)}"><div role="button" tabindex="0" class="library-site-summary" data-library-site-toggle="${escapeHtml(site.origin)}" title="${expanded ? 'Collapse' : 'Expand'}"><span class="site-caret">${svg('chevronRight',13)}</span><span class="site-main"><span class="library-origin-row"><code class="library-origin-title copyable ${originDisabled ? 'off' : 'on'}" data-copy-value="${escapeHtml(site.origin)}" title="copy"><span>${escapeHtml(site.origin)}</span></code></span><span class="site-route-line"><span class="site-route-pill"><b>${escapeHtml(modeText)}</b><i></i><em>${escapeHtml(scopeText)}</em>${originDisabled ? `<span class="site-route-flag" title="Origin is in global exceptions">EXCEPT</span>` : ''}</span></span></span><span class="site-counts"><span>Domains <em>${allDomains.length}</em></span><span>IPS <em>${allIps.length}</em></span></span></div><div class="library-site-details"><div class="library-columns"><div><div class="library-label">${t('library.domains')} · ${allDomains.length}</div><div class="library-values">${allDomains.length ? allDomains.map(([d, active]) => renderSiteEntryChip(d, 'domain', active)).join('') : '<span class="library-muted" aria-label="No entries"></span>'}</div></div><div><div class="library-label">${t('library.ips')} · ${allIps.length}</div><div class="library-values">${allIps.length ? allIps.map(([ip, active]) => renderSiteEntryChip(ip, 'ip', active)).join('') : '<span class="library-muted" aria-label="No entries"></span>'}</div></div></div></div></article>`;
  }).join('') : `<div class="library-empty">${t('library.empty')}</div>`;

  const routerDomainsCount = (routerLists?.rawDomains || routerLists?.domains || []).length;
  const routerSubnetsCount = (routerLists?.rawSubnets || routerLists?.subnets || []).length;
  const routerLoadingInitial = routerListsBusy && routerListAction !== 'save' && !routerLists;
  const routerListsHtml = `<div class="router-lists-editor ${routerLoadingInitial ? 'is-loading' : ''}"><label class="router-list-field"><span class="router-list-title">${t('library.domainsList')} <em>${routerLoadingInitial ? '…' : routerDomainsCount}</em></span>${routerLoadingInitial ? `<div class="textarea-skeleton">${skeletonLine('line wide')}${skeletonLine('line mid')}${skeletonLine('line short')}</div>` : `<textarea id="routerDomainsText" spellcheck="false" autocomplete="off" ${routerListsBusy ? 'disabled' : ''}>${escapeHtml(routerListsDraft.domains || '')}</textarea>`}<small>${t('library.domainsHint')}</small></label><label class="router-list-field"><span class="router-list-title">${t('library.subnetsList')} <em>${routerLoadingInitial ? '…' : routerSubnetsCount}</em></span>${routerLoadingInitial ? `<div class="textarea-skeleton">${skeletonLine('line mid')}${skeletonLine('line wide')}${skeletonLine('line short')}</div>` : `<textarea id="routerSubnetsText" spellcheck="false" autocomplete="off" ${routerListsBusy ? 'disabled' : ''}>${escapeHtml(routerListsDraft.subnets || '')}</textarea>`}<small>${t('library.subnetsHint')}</small></label><div class="router-list-actions"><button type="button" class="router-save-btn ${routerListsBusy && routerListAction === 'save' ? 'saving' : ''} ${routerSaveOk ? 'saved' : ''}" id="saveRouterLists" ${routerListsBusy || routerLoadingInitial ? 'disabled' : ''}>${routerSaveOk ? svg('check',14) : (routerListsBusy && routerListAction === 'save' ? svg('loader',14) : '')}<span>${t('library.saveLists')}</span></button></div></div>`;

  const sitesSubtabs = `<div class="library-subtabs"><button type="button" class="library-subtab ${librarySitesPane === 'proxied' ? 'active' : ''}" data-library-sites-pane="proxied">${t('library.proxied')}</button><button type="button" class="library-subtab ${librarySitesPane === 'direct' ? 'active' : ''}" data-library-sites-pane="direct">${t('library.direct')}</button></div>`;
  const sitesContent = librarySitesPane === 'direct' ? directHtml : siteRows;
  const sitesStats = librarySitesPane === 'proxied'
    ? `<div class="library-stats"><span>${data.siteCount || 0} sites</span><span>${data.domainCount || 0} domains</span><span>${data.ipCount || 0} ips</span></div>`
    : '';

  return `<main class="popup svelte-2iqjbh ${(libraryBusy || routerListsBusy) ? 'is-busy' : ''}"><section class="library-panel pk-glass-strong"><header class="library-head"><button type="button" class="tool-btn" id="backLibrary" title="${t('library.back')}">${svg('back',15)}</button><div class="library-title-wrap"><h1>${t('library.title')}</h1><p>${libraryPane === 'router' ? t('library.routerSubtitle') : librarySitesPane === 'direct' ? t('library.disabledSubtitle') : t('library.proxiedSubtitle')}</p></div><div class="library-tools">${libraryPane === 'sites' ? `<button type="button" class="tool-btn ${importOk ? 'import-ok' : ''}" id="importLibrary" title="${t('library.import')}">${importOk ? svg('check',15) : svg('download',15)}</button><button type="button" class="tool-btn" id="exportLibrary" title="${t('library.export')}">${svg('upload',15)}</button><input type="file" id="importLibraryFile" accept="application/json,.json" hidden>` : libraryPane === 'router' ? `<button type="button" class="tool-btn router-refresh-btn ${routerListsBusy && routerListAction === 'refresh' ? 'spinning' : ''}" id="refreshRouterListsTop" title="${t('library.refresh')}" ${routerListsBusy ? 'disabled' : ''}>${svg('sync',15)}</button>` : ''}</div></header><div class="library-tabs"><button type="button" class="library-tab ${libraryPane === 'sites' ? 'active' : ''}" data-library-pane="sites">${t('library.sites')}</button><button type="button" class="library-tab ${libraryPane === 'router' ? 'active' : ''}" data-library-pane="router">${t('library.routerLists')}</button></div>${libraryPane === 'sites' ? sitesSubtabs + sitesStats : ''}${libraryError ? `<div class="banner banner-error svelte-2iqjbh">${svg('alert', 14)}<div>${escapeHtml(libraryError)}</div></div>` : ''}${libraryStatus && libraryPane !== 'router' ? `<div class="banner banner-info svelte-2iqjbh">${svg('check', 14)}<div>${escapeHtml(libraryStatus)}</div></div>` : ''}<div class="library-list">${libraryPane === 'router' ? routerListsHtml : sitesContent}</div></section>${renderImportConfirmModal()}${renderAppFooter()}${renderConsole()}${renderResetModal()}</main>`;
}

function renderSyncIndicator() {
  return '';
}

function setSyncStatus(state, holdMs = 0) {
  if (syncResetTimer) {
    clearTimeout(syncResetTimer);
    syncResetTimer = null;
  }
  syncStatus = state;
  applyGlobalSyncLock();
  if (holdMs > 0) {
    syncResetTimer = setTimeout(() => {
      syncStatus = 'idle';
      syncResetTimer = null;
      render();
    }, holdMs);
  }
}

function snapshotForOptimistic() {
  return snap ? JSON.parse(JSON.stringify(snap)) : null;
}

function optimisticSetMode(mode) {
  if (!snap?.origin) return;
  if (!snap.originState) snap.originState = { origin: snap.origin, mode: 'direct', scope: snap.profileScope || 'both', writtenDomains: [], writtenIps: [] };
  snap.originState.mode = mode;
  snap.originState.scope = snap.originState.scope || snap.profileScope || 'both';
}

function optimisticSetScope(scope) {
  if (!snap) return;
  snap.profileScope = scope;
  if (snap.originState) snap.originState.scope = scope;
}

function optimisticToggleEntry(kind, value) {
  if (!snap) return;
  const normalizedKind = kind === 'ip' ? 'ip' : 'domain';
  const normalizedValue = String(value || '').trim().toLowerCase();
  if (!normalizedValue) return;
  const toggles = {
    disabledDomains: [...(snap.toggles?.disabledDomains || [])],
    disabledIps: [...(snap.toggles?.disabledIps || [])]
  };
  const key = normalizedKind === 'ip' ? 'disabledIps' : 'disabledDomains';
  const set = new Set(toggles[key]);
  const wasOn = !set.has(normalizedValue);
  if (set.has(normalizedValue)) set.delete(normalizedValue);
  else set.add(normalizedValue);
  toggles[key] = [...set];
  snap.toggles = toggles;
  // Mirror change into library.disabled so the proxied overview reflects gray state immediately.
  if (library && library.disabled) {
    const libSet = new Set(library.disabled[key] || []);
    if (wasOn) libSet.add(normalizedValue);
    else libSet.delete(normalizedValue);
    library.disabled = { ...library.disabled, [key]: [...libSet] };
  }
}

async function runRouterMutation(applyOptimistic, task) {
  if (busy) return;
  const prevSnap = snapshotForOptimistic();
  const prevLibraryDisabled = library?.disabled ? JSON.parse(JSON.stringify(library.disabled)) : null;
  try {
    busy = true;
    setSyncStatus('syncing');
    if (typeof applyOptimistic === 'function') applyOptimistic();
    render();
    const res = await task();
    if (!res?.ok) throw new Error(res?.errorObj?.message || res?.error || res?.reason || 'OpenWrt sync failed');
    await refresh();
    busy = false;
    pendingEntrySync = null;
    setSyncStatus('ok', 1050);
    render();
  } catch (e) {
    if (prevSnap) snap = prevSnap;
    if (library && prevLibraryDisabled) library.disabled = prevLibraryDisabled;
    busy = false;
    pendingEntrySync = null;
    clearLiveEntryWave();
    applyGlobalSyncLock();
    setSyncStatus('error', 1800);
    consoleLines = [...consoleLines, { at: Date.now(), level: 'error', channel: 'router', text: String(e.message || e) }].slice(-200);
    render();
  }
}

function isPendingEntry(kind, value) {
  if (!pendingEntrySync) return false;
  return pendingEntrySync.kind === (kind === 'ip' ? 'ip' : 'domain') && pendingEntrySync.value === String(value || '').trim().toLowerCase();
}

function isToggleDisabled(kind, value) {
  const t = snap?.toggles || {};
  const v = String(value || '').trim().toLowerCase();
  if (kind === 'ip') return (t.disabledIps || []).includes(v);
  return (t.disabledDomains || []).includes(v);
}

function clearLiveEntryWave() {
  if (liveEntryWaveOverlay) {
    try { liveEntryWaveOverlay.remove(); } catch (_) {}
    liveEntryWaveOverlay = null;
  }
  document.querySelectorAll('.entry-sync-live').forEach(el => {
    el.classList.remove('entry-sync-live', 'is-syncing-entry');
    el.querySelector('.entry-sync-live-wave')?.remove();
  });
}

function ensureLiveEntryWave(el) {
  if (!el) return;
  clearLiveEntryWave();

  el.classList.add('is-syncing-entry', 'entry-sync-live');

  // Keep an inline fallback layer inside the chip.
  let wave = Array.from(el.children || []).find(child => child.classList?.contains('entry-sync-live-wave'));
  if (!wave) {
    wave = document.createElement('span');
    wave.className = 'entry-sync-live-wave';
    wave.setAttribute('aria-hidden', 'true');
    el.appendChild(wave);
  }

  // Main visible layer: fixed overlay above the clicked chip.
  // This avoids chip-specific CSS conflicts and survives app innerHTML re-renders.
  const rect = el.getBoundingClientRect();
  const radius = getComputedStyle(el).borderRadius || '10px';
  const overlay = document.createElement('span');
  overlay.className = 'entry-sync-screen-wave';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.left = `${Math.round(rect.left)}px`;
  overlay.style.top = `${Math.round(rect.top)}px`;
  overlay.style.width = `${Math.max(1, Math.round(rect.width))}px`;
  overlay.style.height = `${Math.max(1, Math.round(rect.height))}px`;
  overlay.style.borderRadius = radius;

  const shine = document.createElement('span');
  shine.className = 'entry-sync-screen-wave-shine';
  overlay.appendChild(shine);
  document.body.appendChild(overlay);
  liveEntryWaveOverlay = overlay;

  try {
    shine.animate(
      [
        { transform: 'translate3d(-155%,0,0) skewX(-12deg)' },
        { transform: 'translate3d(155%,0,0) skewX(-12deg)' }
      ],
      { duration: 1050, iterations: Infinity, easing: 'ease-in-out' }
    );
  } catch (_) {}

  void overlay.offsetWidth;
}

function normalizeEntryValue(kind, value) {
  return String(value || '').trim().toLowerCase();
}

async function runEntryToggleMutation(el, kind, value, insideRequests = false) {
  if (busy) return;
  const normalizedKind = kind === 'ip' ? 'ip' : 'domain';
  const normalizedValue = normalizeEntryValue(normalizedKind, value);
  if (!normalizedValue) return;

  const prevSnap = snapshotForOptimistic();
  const prevLibraryDisabled = library?.disabled ? JSON.parse(JSON.stringify(library.disabled)) : null;
  const startedAt = Date.now();
  const minEntrySyncMs = 950;
  const waitFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const waitMs = ms => new Promise(resolve => setTimeout(resolve, ms));

  try {
    busy = true;
    setSyncStatus('syncing');
    pendingEntrySync = { kind: normalizedKind, value: normalizedValue };
    applyGlobalSyncLock();

    if (insideRequests) {
      snap.requestsOpen = true;
      requestsScrollTop = document.querySelector('.requests-inline-list')?.scrollTop || requestsScrollTop || 0;
    }

    // Keep the chip in its current active/off state and run the wave on top of it.
    ensureLiveEntryWave(el);
    await waitFrame();
    await waitMs(160);

    const res = await send({ type: 'TOGGLE_ENTRY', tabId: activeTabId, origin: snap?.origin || '', kind, value });
    if (!res?.ok) throw new Error(res?.errorObj?.message || res?.error || res?.reason || 'OpenWrt sync failed');

    const left = minEntrySyncMs - (Date.now() - startedAt);
    if (left > 0) await waitMs(left);

    await refresh(false);
    busy = false;
    pendingEntrySync = null;
    clearLiveEntryWave();
    applyGlobalSyncLock();
    setSyncStatus('ok', 1050);
    render();
  } catch (e) {
    if (prevSnap) snap = prevSnap;
    if (library && prevLibraryDisabled) library.disabled = prevLibraryDisabled;
    busy = false;
    pendingEntrySync = null;
    setSyncStatus('error', 1800);
    consoleLines = [...consoleLines, { at: Date.now(), level: 'error', channel: 'router', text: String(e.message || e) }].slice(-200);
    render();
  }
}

function renderToggleChip(value, kind, extraClass = '') {
  const off = isToggleDisabled(kind, value);
  return `<button type="button" class="toggle-chip ${kind} ${extraClass} ${off ? 'off' : 'on'} ${isPendingEntry(kind, value) ? 'is-syncing-entry' : ''}" data-toggle-kind="${kind}" data-toggle-value="${escapeHtml(value)}" title="${off ? 'Enable globally' : 'Disable globally'} ${escapeHtml(value)}"><span class="toggle-dot"></span><code>${escapeHtml(value)}</code></button>`;
}

function detectChipKind(value) {
  const v = String(value || '').trim();
  if (!v) return 'domain';
  return /^(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?$/.test(v) ? 'ip' : 'domain';
}

function renderOriginToggleChip(value, role) {
  const v = String(value || '').trim();
  if (!v) return '';
  const kind = detectChipKind(v);
  const off = isToggleDisabled(kind, v);
  const pending = isPendingEntry(kind, v);
  const titleVerb = off ? 'Enable globally' : 'Disable globally';
  return `<span class="origin-chip-wrap ${role}-wrap ${off ? 'is-off' : 'is-on'} ${pending ? 'is-syncing-entry' : ''}">`
    + `<button type="button" class="toggle-chip origin-chip ${role}-chip ${kind} ${off ? 'off' : 'on'} ${pending ? 'is-syncing-entry' : ''}" data-toggle-kind="${kind}" data-toggle-value="${escapeHtml(v)}" title="${titleVerb} ${escapeHtml(v)}">`
    + `<span class="toggle-dot"></span><code>${escapeHtml(v)}</code></button>`
    + `<button type="button" class="origin-copy-btn" data-copy-value="${escapeHtml(v)}" title="copy ${escapeHtml(v)}" aria-label="copy ${escapeHtml(v)}">${svg('copy', 12)}</button>`
    + `</span>`;
}

function renderRequestsPanel() {
  const req = snap?.requests || {};
  const domains = req.domains || [];
  const hosts = req.hosts || [];
  const ips = req.ips || [];
  const total = domains.length + hosts.length + ips.length;
  if (!total) return '';
  const chips = [
    ...domains.map(v => ({ value: v, kind: 'domain' })),
    ...hosts.map(v => ({ value: v, kind: 'domain', subtype: 'host' })),
    ...ips.map(v => ({ value: v, kind: 'ip' }))
  ];
  return `<details class="origin-requests" ${snap?.requestsOpen ? 'open' : ''}><summary class="origin-row sub requests-summary"><span class="origin-label svelte-2iqjbh">${t('popup.requests.title')}</span><span class="requests-summary-meta"><em>${total}</em><span class="requests-chevron">${svg('chevronRight',12)}</span></span></summary><div class="requests-inline-list">${chips.map(item => renderToggleChip(item.value, item.kind, `request-item ${item.subtype || ''}`)).join('')}</div></details>`;
}


function renderMainView() {
  const currentIps = resolvedIps || [];
  const ipHtml = ipsLoading ? `<span class="dim svelte-2iqjbh">${t('popup.ips.loading')}</span>` : currentIps.length === 0 ? `<span class="dim svelte-2iqjbh">${t('popup.ips.none')}</span>` : `<div class="ip-list svelte-2iqjbh toggle-list main-ip-list">${currentIps.map(ip => renderToggleChip(ip, 'ip', 'main-ip')).join('')}</div>`;
  const originChipHtml = snap.origin
    ? renderOriginToggleChip(snap.origin, 'origin')
    : `<span class="origin-empty svelte-2iqjbh">${t('popup.origin.empty')}</span>`;
  const hostChipHtml = (snap.fullHostname && snap.fullHostname !== snap.origin)
    ? `<div class="origin-row sub svelte-2iqjbh"><span class="origin-label svelte-2iqjbh">host</span>${renderOriginToggleChip(snap.fullHostname, 'host')}</div>`
    : '';
  return `<main class="popup svelte-2iqjbh">
    ${renderBrandHeader("OpenWrt routing control", { byline: true, actions: `${renderSyncIndicator()}<div class="brand-actions"><button type="button" class="tool-btn" id="openLibrary" title="${t('library.open')}" ${busy ? 'disabled' : ''}>${svg('library',15)}</button><button type="button" class="tool-btn" id="openControl" title="${t('control.title')}" ${busy ? 'disabled' : ''}>${svg('settings',15)}</button></div>` })}
    <section class="origin-panel pk-glass svelte-2iqjbh"><div class="origin-row svelte-2iqjbh"><span class="origin-label svelte-2iqjbh">origin</span>${originChipHtml}</div>${hostChipHtml}${snap.isHttpScheme ? `<div class="origin-row sub svelte-2iqjbh"><span class="origin-label svelte-2iqjbh">ips</span>${ipHtml}</div>` : ''}${snap.origin && snap.isHttpScheme ? renderRequestsPanel() : ''}</section>
    ${snap.origin && snap.isHttpScheme ? renderModeStack() + renderScopeStack() : ''}
    ${renderAppFooter()}${renderConsole()}${renderResetModal()}</main>`;
}

function markUiHydrated() {
  if (document.documentElement.dataset.pmHydrated === '1') return;
  requestAnimationFrame(() => { document.documentElement.dataset.pmHydrated = '1'; });
}

function render() {
  if (!snap || !settings) { app.innerHTML = `<main class="popup svelte-2iqjbh"><div class="loading svelte-2iqjbh">${t('common.loading')}</div></main>`; markUiHydrated(); return; }
  if (!snap.configured || view === 'setup') app.innerHTML = renderSetupView(false);
  else if (view === 'settings') app.innerHTML = renderSetupView(true);
  else if (view === 'library') app.innerHTML = renderLibraryView();
  else if (view === 'control') app.innerHTML = renderControlView();
  else app.innerHTML = renderMainView();
  bindEvents();
  const reqList = document.querySelector('.requests-inline-list');
  if (reqList && snap?.requestsOpen) reqList.scrollTop = requestsScrollTop || 0;
  applyGlobalSyncLock();
  markUiHydrated();
}

async function saveSetup() {
  updateFormFromDom();
  formError = '';
  formStatus = '';
  if (!form.routerToken) { formError = 'Router API token is required'; render(); return; }
  busy = true; render();
  const res = await send({ type: 'SETUP_COMPLETE', payload: { routerUrl: form.routerUrl, routerToken: form.routerToken, scope: 'both', defaultMode: form.defaultMode, requireTest: true } });
  busy = false;
  if (!res?.ok) {
    const msg = res?.errorObj?.message || res?.error || res?.code || 'Setup failed';
    formError = String(msg).toLowerCase().includes('invalid token') ? 'Invalid token' : normalizeSetupError(msg);
    render();
    return;
  }
  settings = await send({ type: 'GET_SETTINGS' });
  snap = activeTabId == null ? snap : await send({ type: 'GET_STATE_FOR_POPUP', tabId: activeTabId });
  formStatus = 'Saved';
  view = 'main';
  render();
}

function bindSetupEvents() {
  document.getElementById('backToMain')?.addEventListener('click', () => { view = 'main'; formError = ''; formStatus = ''; render(); });
  document.getElementById('backToMain2')?.addEventListener('click', () => { view = 'main'; formError = ''; formStatus = ''; render(); });
  const updateSetupButtons = () => {
    const enabled = !busy && Boolean((form?.routerToken || '').trim());
    const save = document.getElementById('saveSetup');
    if (save) save.disabled = !enabled;
  };
  document.querySelectorAll('.gateway-part').forEach((input, index, inputs) => {
    input.addEventListener('input', e => {
      let value = e.target.value.replace(/\D/g, '').slice(0, 3);
      if (Number(value) > 255) value = '255';
      e.target.value = value;
      form.routerUrl = normalizeGatewayToRouterUrl(gatewayFromOctetInputs());
      if (value.length === 3 && index < inputs.length - 1) inputs[index + 1].focus();
    });
    input.addEventListener('focus', e => { requestAnimationFrame(() => e.target.select()); });
    input.addEventListener('click', e => { e.target.select(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !e.target.value && index > 0) inputs[index - 1].focus();
    });
    input.addEventListener('paste', e => {
      const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
      const parts = text.replace(/^https?:\/\//i, '').replace(/\/.*$/g, '').split('.').map(x => x.replace(/\D/g, '').slice(0,3)).filter(Boolean);
      if (parts.length > 1) {
        e.preventDefault();
        parts.slice(0,4).forEach((part, i) => { if (inputs[i]) inputs[i].value = String(Math.min(Number(part || 0), 255)); });
        form.routerUrl = normalizeGatewayToRouterUrl(gatewayFromOctetInputs());
        inputs[Math.min(parts.length, 4) - 1]?.focus();
      }
    });
  });
  document.getElementById('routerToken')?.addEventListener('input', e => { form.routerToken = e.target.value; updateSetupButtons(); });
  document.getElementById('saveSetup')?.addEventListener('click', () => saveSetup());
}


async function removeLibraryEntryFromUi(target, kind, value) {
  if (!target || !kind || !value || libraryBusy) return;
  libraryBusy = true;
  pendingEntrySync = { kind: kind === 'ip' ? 'ip' : 'domain', value: String(value || '').trim().toLowerCase() };
  libraryAddError = '';
  libraryStatus = '';
  render();
  await new Promise(requestAnimationFrame);
  try {
    const res = await send({ type: 'REMOVE_LIBRARY_ENTRY', target, kind, value });
    if (!res?.ok) throw new Error(res?.errorObj?.message || res?.error || 'Could not remove entry');
    libraryDeletePick = null;
    library = await send({ type: 'GET_LOCAL_LIBRARY' });
    await refresh();
    view = 'library';
    libraryPane = 'sites';
    librarySitesPane = target;
  } catch (err) {
    libraryAddError = String(err.message || err);
  }
  pendingEntrySync = null;
  libraryBusy = false;
  render();
}

function bindEvents() {
  bindSetupEvents();
  document.getElementById('cancelReset')?.addEventListener('click', () => { showReset = false; render(); });
  document.getElementById('confirmReset')?.addEventListener('click', async () => { await send({ type: 'RESET_EXTENSION' }); showReset = false; view = 'setup'; form = null; await refresh(); });
  document.getElementById('openLibrary')?.addEventListener('click', async () => { view = 'library'; libraryPane = 'sites'; libraryStatus = ''; libraryError = ''; await loadLibrary(); render(); });
  document.getElementById('openControl')?.addEventListener('click', async () => {
    view = 'control';
    controlAction = 'refresh';
    controlOutput = '';
    controlBusy = true;
    controlError = '';
    controlOk = '';
    controlData = null;
    render();
    await loadControl();
    controlAction = '';
    render();
  });
  document.getElementById('backControl')?.addEventListener('click', () => { view = 'main'; controlError = ''; controlOk = ''; controlOutput = ''; render(); });
  document.getElementById('refreshControl')?.addEventListener('click', async () => {
    if (controlBusy) return;
    controlAction = 'refresh';
    controlOutput = '';
    controlError = '';
    controlOk = '';
    render();
    await new Promise(requestAnimationFrame);
    await loadControl();
    controlAction = '';
    render();
  });
  const runControlAction = async (action, okText) => {
    if (controlBusy) return;
    controlBusy = true;
    controlAction = action;
    controlError = '';
    controlOk = '';
    controlOutput = '';
    render();
    try {
      const res = await send({ type: 'ROUTER_CONTROL_ACTION', action });
      if (res?.podkop || res?.lists) controlData = res;
      if (res?.output) controlOutput = res.output;
      controlOk = okText || res?.message || t('control.done');
      if (action !== 'rebootRouter') {
        try { controlData = await send({ type: 'GET_ROUTER_CONTROL' }); } catch (_) {}
        if (controlData?.podkop) {
          if (action === 'stopPodkop') controlData.podkop.running = false;
          if (action === 'startPodkop' || action === 'restartPodkop') controlData.podkop.running = true;
          if (action === 'disablePodkopAutostart') controlData.podkop.enabled = false;
          if (action === 'enablePodkopAutostart') controlData.podkop.enabled = true;
        }
      }
    } catch (e) {
      controlError = String(e.message || e);
    }
    controlBusy = false;
    controlAction = '';
    render();
  };
  document.getElementById('restartPodkop')?.addEventListener('click', () => runControlAction('restartPodkop', t('control.done')));
  document.getElementById('togglePodkop')?.addEventListener('click', (e) => runControlAction(e.currentTarget.dataset.controlAction, t('control.done')));
  document.getElementById('toggleAutostart')?.addEventListener('click', (e) => runControlAction(e.currentTarget.dataset.controlAction, t('control.done')));
  document.getElementById('rebootRouter')?.addEventListener('click', () => runControlAction('rebootRouter', t('control.rebootRequested')));
  document.getElementById('openLuci')?.addEventListener('click', async () => {
    const gateway = routerUrlToGateway(settings?.routerUrl || DEFAULT_ROUTER_URL);
    await chrome.tabs.create({ url: `http://${gateway}/` });
  });
  document.getElementById('backLibrary')?.addEventListener('click', () => { view = 'main'; libraryStatus = ''; libraryError = ''; render(); });
  document.querySelectorAll('[data-library-disable-kind][data-library-disable-value]').forEach(el => el.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (libraryBusy || el.classList.contains('off')) return;
    const kind = el.dataset.libraryDisableKind;
    const value = el.dataset.libraryDisableValue;
    if (!kind || !value) return;
    pendingEntrySync = { kind: kind === 'ip' ? 'ip' : 'domain', value: String(value || '').trim().toLowerCase() };
    libraryBusy = true;
    libraryAddError = '';
    libraryStatus = '';
    render();
    try {
      const res = await send({ type: 'ADD_LIBRARY_ENTRY', target: 'direct', value });
      if (!res?.ok) throw new Error(res?.errorObj?.message || res?.error || 'Could not move to Direct');
      library = await send({ type: 'GET_LOCAL_LIBRARY' });
      await refresh();
      view = 'library';
      libraryPane = 'sites';
      librarySitesPane = 'proxied';
      pendingEntrySync = null;
    } catch (err) {
      pendingEntrySync = null;
      libraryAddError = String(err.message || err);
    }
    libraryBusy = false;
    render();
  }));
  document.querySelectorAll('[data-library-remove-target][data-library-remove-kind][data-library-remove-value]').forEach(el => el.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    await removeLibraryEntryFromUi(el.dataset.libraryRemoveTarget, el.dataset.libraryRemoveKind, el.dataset.libraryRemoveValue);
  }));
  document.querySelectorAll('[data-library-pick-target][data-library-pick-kind][data-library-pick-value]').forEach(el => el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    libraryDeletePick = {
      target: el.dataset.libraryPickTarget,
      kind: el.dataset.libraryPickKind,
      value: el.dataset.libraryPickValue
    };
    render();
  }));
  document.querySelectorAll('.library-add-input').forEach(input => input.addEventListener('input', (e) => {
    const form = e.target.closest('[data-add-target]');
    const target = form?.dataset.addTarget;
    if (target) {
      libraryAddDraft[target] = e.target.value;
      if (libraryAddError && librarySitesPane === target) {
        libraryAddError = '';
        form.classList.remove('invalid');
      }
    }
  }));
  document.querySelectorAll('.library-add-form').forEach(form => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const target = form.dataset.addTarget;
    const input = form.querySelector('.library-add-input');
    const value = input?.value?.trim() || '';
    if (!target || !value || libraryBusy) return;
    libraryBusy = true;
    libraryAddBusyTarget = target;
    libraryAddError = '';
    libraryStatus = '';
    render();
    await new Promise(requestAnimationFrame);
    try {
      const res = await send({ type: 'ADD_LIBRARY_ENTRY', target, value });
      if (!res?.ok) throw new Error(res?.errorObj?.message || res?.error || 'Could not add entry');
      libraryAddDraft[target] = '';
      libraryDeletePick = null;
      library = await send({ type: 'GET_LOCAL_LIBRARY' });
      await refresh();
      view = 'library';
      libraryPane = 'sites';
      librarySitesPane = target;
    } catch (err) {
      libraryAddError = String(err.message || err);
    }
    libraryBusy = false;
    libraryAddBusyTarget = '';
    render();
  }));
  document.querySelectorAll('[data-library-pane]').forEach(btn => btn.addEventListener('click', async () => {
    const pane = btn.dataset.libraryPane;
    if (!pane || pane === libraryPane) return;
    libraryPane = pane;
    libraryStatus = '';
    libraryError = '';
    librarySaveOk = false;
    routerSaveOk = false;
    routerListAction = '';
    if (pane === 'sites') await loadLibrary();
    if (pane === 'router') {
      routerListAction = 'refresh';
      routerListsBusy = true;
      routerLists = null;
      routerListsDraft = { domains: '', subnets: '' };
      render();
      await loadRouterLists();
      routerListAction = '';
    }
    render();
  }));
  document.querySelectorAll('[data-library-sites-pane]').forEach(btn => btn.addEventListener('click', () => {
    const pane = btn.dataset.librarySitesPane;
    if (!pane || pane === librarySitesPane) return;
    librarySitesPane = pane;
    libraryStatus = '';
    libraryError = '';
    libraryAddError = '';
    libraryDeletePick = null;
    render();
  }));
  document.getElementById('refreshRouterListsTop')?.addEventListener('click', async () => {
    if (routerListsBusy) return;
    libraryStatus = '';
    libraryError = '';
    librarySaveOk = false;
    routerSaveOk = false;
    routerListAction = 'refresh';
    routerListsBusy = true;
    render();
    await loadRouterLists();
    routerListAction = '';
    render();
  });
  document.getElementById('routerDomainsText')?.addEventListener('input', e => { routerListsDraft.domains = e.target.value; });
  document.getElementById('routerSubnetsText')?.addEventListener('input', e => { routerListsDraft.subnets = e.target.value; });
  document.getElementById('saveRouterLists')?.addEventListener('click', async () => {
    if (routerListsBusy) return;
    routerListsDraft.domains = document.getElementById('routerDomainsText')?.value || '';
    routerListsDraft.subnets = document.getElementById('routerSubnetsText')?.value || '';
    routerListsBusy = true;
    routerListAction = 'save';
    routerSaveOk = false;
    libraryStatus = '';
    libraryError = '';
    render();
    try {
      routerLists = await send({ type: 'SAVE_ROUTER_LISTS', domains: routerListsDraft.domains, subnets: routerListsDraft.subnets });
      routerListsDraft = {
        domains: (routerLists.rawDomains || routerLists.domains || []).join('\n'),
        subnets: (routerLists.rawSubnets || routerLists.subnets || []).join('\n')
      };
      library = await send({ type: 'GET_LOCAL_LIBRARY' });
      if (activeTabId != null) {
        snap = await send({ type: 'GET_STATE_FOR_POPUP', tabId: activeTabId });
        resolvedIps = snap.resolvedIps ?? snap.originState?.writtenIps ?? [];
        ipsLoading = Boolean(snap.ipsLoading);
      }
      routerSaveOk = true;
      render();
      await new Promise(resolve => setTimeout(resolve, 850));
    } catch (e) {
      libraryError = String(e.message || e);
    }
    routerSaveOk = false;
    routerListAction = '';
    routerListsBusy = false;
    render();
  });
  document.getElementById('exportLibrary')?.addEventListener('click', async () => { if (busy) return; try { await exportLibraryFile(); libraryStatus = 'Exported'; render(); } catch (e) { libraryError = String(e.message || e); render(); } });
  document.getElementById('importLibrary')?.addEventListener('click', () => { if (!busy && !libraryBusy) document.getElementById('importLibraryFile')?.click(); });
  document.getElementById('importLibraryFile')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      importPendingText = await file.text();
      importPendingName = file.name || 'selected file';
      importConfirmOpen = true;
      libraryError = '';
      libraryStatus = '';
      render();
    } catch (err) {
      importPendingText = '';
      importPendingName = '';
      importConfirmOpen = false;
      libraryError = String(err.message || err);
      render();
    }
  });
  document.getElementById('cancelImportConfirm')?.addEventListener('click', () => {
    importPendingText = '';
    importPendingName = '';
    importConfirmOpen = false;
    render();
  });
  document.getElementById('confirmImportReplace')?.addEventListener('click', async () => {
    if (!importPendingText || libraryBusy) return;
    const text = importPendingText;
    importConfirmOpen = false;
    importPendingText = '';
    importPendingName = '';
    libraryBusy = true;
    libraryError = '';
    libraryStatus = '';
    render();
    try {
      const res = await send({ type: 'IMPORT_LIBRARY', payload: text, strategy: 'replace' });
      if (!res?.ok) throw new Error(res?.error || 'Import failed');
      await loadLibrary();
      await refresh();
      view = 'library';
      libraryBusy = false;
      importOk = true;
      render();
      await new Promise(resolve => setTimeout(resolve, 950));
      importOk = false;
      render();
      return;
    } catch (err) {
      libraryError = String(err.message || err);
    }
    libraryBusy = false;
    render();
  });
  document.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', async () => {
    if (busy || !snap?.origin) return;
    const mode = btn.dataset.mode;
    if (mode === snap.originState?.mode) return;
    await runRouterMutation(
      () => optimisticSetMode(mode),
      async () => {
        const res = await send({ type: 'SET_ORIGIN_MODE', tabId: activeTabId, origin: snap.origin, mode });
        if (!res?.ok && res?.reason === 'not-configured') view = 'setup';
        return res;
      }
    );
  }));
  document.querySelectorAll('[data-scope]').forEach(btn => btn.addEventListener('click', async () => {
    if (busy || !snap?.origin) return;
    const scope = btn.dataset.scope;
    if (scope === (snap.originState?.scope || snap.profileScope || 'both')) return;
    await runRouterMutation(
      () => optimisticSetScope(scope),
      () => send({ type: 'SET_PROFILE_SCOPE', profile: 'default', origin: snap.origin, tabId: activeTabId, scope })
    );
  }));
  const trigger = document.getElementById('profileTrigger');
  const dd = document.getElementById('profileDropdown');
  trigger?.addEventListener('click', () => { dd.hidden = !dd.hidden; });
  document.querySelectorAll('[data-profile]').forEach(btn => btn.addEventListener('click', async () => { await send({ type: 'SWITCH_PROFILE', profile: btn.dataset.profile }); await refresh(); }));
  document.getElementById('addProfile')?.addEventListener('click', () => { document.getElementById('createProfileRow').hidden = false; document.getElementById('profileName').focus(); });
  document.getElementById('createProfile')?.addEventListener('click', async () => {
    const name = document.getElementById('profileName').value.trim();
    const res = await send({ type: 'CREATE_PROFILE', profile: name });
    if (res?.ok) await refresh(); else { const err = document.getElementById('profileError'); err.textContent = res?.code || t('popup.profile.invalid'); err.hidden = false; }
  });
  document.querySelector('.origin-requests > summary')?.addEventListener('click', () => {
    const details = document.querySelector('.origin-requests');
    if (!snap || !details) return;
    snap.requestsOpen = !details.open;
  });
  document.querySelector('.requests-inline-list')?.addEventListener('scroll', (e) => {
    requestsScrollTop = e.currentTarget.scrollTop || 0;
  }, { passive: true });
  document.querySelectorAll('[data-toggle-kind][data-toggle-value]').forEach(el => el.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const kind = el.dataset.toggleKind;
    const value = el.dataset.toggleValue;
    if (!kind || !value) return;
    const insideRequests = Boolean(el.closest('.requests-inline-list'));
    await runEntryToggleMutation(el, kind, value, insideRequests);
  }));
  document.getElementById('copyConsole')?.addEventListener('click', async (e) => { e.stopPropagation(); await navigator.clipboard.writeText((consoleLines || []).map(l => `[${fmtTime(l.at)}] [${l.channel}] [${l.level}] ${l.text}`).join('\n')); });
  const toggleLibrarySite = (origin) => {
    if (!origin) return;
    if (libraryExpandedSites.has(origin)) libraryExpandedSites.delete(origin);
    else libraryExpandedSites.add(origin);
    render();
  };
  document.querySelectorAll('[data-library-site]').forEach(el => el.addEventListener('click', (e) => {
    if (e.target?.closest?.('[data-copy-value],[data-library-disable-kind],[data-toggle-kind],button.library-chip')) return;
    e.preventDefault();
    toggleLibrarySite(el.dataset.librarySite);
  }));
  document.querySelectorAll('[data-library-site-toggle]').forEach(el => el.addEventListener('click', (e) => {
    if (e.target?.closest?.('[data-copy-value],[data-toggle-kind]')) return;
    e.preventDefault();
    e.stopPropagation();
    toggleLibrarySite(el.dataset.librarySiteToggle);
  }));
  document.querySelectorAll('[data-copy-value]').forEach(el => el.addEventListener('click', async (e) => {
    if (e.target !== el && !el.contains(e.target)) return;
    e.stopPropagation();
    const value = el.dataset.copyValue || el.textContent || '';
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      el.classList.add('copied');
      window.setTimeout(() => el.classList.remove('copied'), 650);
    } catch (_) {}
  }));
}


function sameArrayValues(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}
function sameRequestsPayload(a = {}, b = {}) {
  return sameArrayValues(a.domains || [], b.domains || [])
    && sameArrayValues(a.hosts || [], b.hosts || [])
    && sameArrayValues(a.ips || [], b.ips || []);
}

chrome.runtime.onMessage.addListener((m) => {
  if (m.type === 'CONSOLE_LINE' && m.line) {
    consoleLines = [...consoleLines, m.line].slice(-200);
    // Do not re-render while a chip sync is active: it destroys the live wave layer.
    if (consoleOpen && !busy && !pendingEntrySync) render();
  }
  if (m.type === 'IPS_RESOLVED' && m.hostname && snap?.fullHostname === m.hostname) {
    resolvedIps = m.ips || []; ipsLoading = false;
    if (!busy && !pendingEntrySync && !snap?.requestsOpen) render();
  }
  if (m.type === 'REQUESTS_UPDATED' && snap?.origin && m.origin === snap.origin && m.requests) {
    if (sameRequestsPayload(snap.requests || {}, m.requests)) return;
    const prevRequestsOpen = Boolean(snap.requestsOpen);
    const prevRequestsScrollTop = requestsScrollTop || document.querySelector('.requests-inline-list')?.scrollTop || 0;
    snap = { ...snap, requests: m.requests, requestsOpen: prevRequestsOpen };
    requestsScrollTop = prevRequestsScrollTop;
    // If Requests is open, keep the visible DOM stable. Update state silently only.
    if (!busy && !pendingEntrySync && !prevRequestsOpen) render();
  }
});



document.addEventListener('click', async (e) => {
  const remove = e.target?.closest?.('[data-library-remove-target][data-library-remove-kind][data-library-remove-value]');
  if (!remove) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  await removeLibraryEntryFromUi(remove.dataset.libraryRemoveTarget, remove.dataset.libraryRemoveKind, remove.dataset.libraryRemoveValue);
}, true);

document.addEventListener('keydown', (e) => {
  if (e.code !== 'Backquote' && e.key !== '`' && e.key !== '~' && e.key !== 'ё' && e.key !== 'Ё') return;
  const tag = String(e.target?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
  e.preventDefault();
  consoleOpen = !consoleOpen;
  render();
});

refresh().catch(e => { app.innerHTML = `<main class="popup svelte-2iqjbh"><div class="banner banner-error svelte-2iqjbh">${escapeHtml(e.message || e)}</div></main>`; });
