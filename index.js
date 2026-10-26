// Cache Control – UI for editing prompt-cache settings in config.yaml
const API = '/api/plugins/cache-control';

const KNOWN = {
    'claude.enableSystemPromptCache': {
        label: 'Cache the system prompt',
        help: 'Only worth it if your system prompt stays the same between messages.',
    },
    'claude.cachingAtDepth': {
        label: 'Cache chat history at depth',
        help: '-1 turns it off. 0 caches up to the latest message; higher numbers place the cache point further back. 2 is a common choice.',
    },
    'claude.extendedTTL': {
        label: 'Keep cache for 1 hour',
        help: 'Default is 5 minutes. The 1-hour cache costs more to write.',
    },
};

const PRESETS = {
    off: { 'claude.enableSystemPromptCache': false, 'claude.cachingAtDepth': -1, 'claude.extendedTTL': false },
    claude: { 'claude.enableSystemPromptCache': true, 'claude.cachingAtDepth': 2 },
};

const state = { keys: [], original: new Map(), dirty: new Map(), admin: true };

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const headers = () => SillyTavern.getContext().getRequestHeaders();

function panelHtml() {
    return `
<div id="ccx" class="ccx">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>Cache Control</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <p class="ccx-path">Editing <code id="ccx_path">config.yaml</code></p>
      <div class="ccx-presets">
        <button class="menu_button ccx-btn" data-preset="off">Turn off caching</button>
        <button class="menu_button ccx-btn" data-preset="claude">Claude: depth 2 + system prompt</button>
        <button class="menu_button ccx-btn" id="ccx_reload" title="Reload from config.yaml">
          <i class="fa-solid fa-rotate"></i> Reload
        </button>
      </div>
      <div id="ccx_list" class="ccx-list"></div>
      <details class="ccx-add">
        <summary>Add another key</summary>
        <div class="ccx-add-body">
          <input id="ccx_new_key" class="text_pole" placeholder="e.g. gemini.someCacheKey" autocomplete="off" autocapitalize="off" spellcheck="false">
          <select id="ccx_new_type" class="text_pole">
            <option value="boolean">On / off</option>
            <option value="number">Number</option>
            <option value="string">Text</option>
          </select>
          <button class="menu_button ccx-btn" id="ccx_add_btn">Add key</button>
        </div>
      </details>
      <div class="ccx-savebar">
        <span id="ccx_status" class="ccx-status">No changes</span>
        <button class="menu_button ccx-btn" id="ccx_revert" disabled>Revert</button>
        <button class="menu_button ccx-btn ccx-primary" id="ccx_save" disabled>Save changes</button>
      </div>
    </div>
  </div>
</div>`;
}

function controlHtml(k) {
    const id = `ccx_${k.key.replace(/\./g, '_')}`;
    if (k.type === 'boolean') {
        return `<label class="ccx-switch" for="${id}">
            <input type="checkbox" id="${id}" data-key="${esc(k.key)}" ${k.value ? 'checked' : ''}>
            <span class="ccx-slider"></span></label>`;
    }
    if (k.type === 'number') {
        return `<div class="ccx-num">
            <button class="menu_button" data-step="-1" data-key="${esc(k.key)}" aria-label="Decrease">−</button>
            <input type="number" inputmode="numeric" class="text_pole" id="${id}" data-key="${esc(k.key)}" value="${esc(k.value)}">
            <button class="menu_button" data-step="1" data-key="${esc(k.key)}" aria-label="Increase">+</button></div>`;
    }
    return `<input type="text" class="text_pole ccx-text" id="${id}" data-key="${esc(k.key)}" value="${esc(k.value)}">`;
}

function render() {
    const list = $('#ccx_list');
    if (!state.keys.length) {
        list.html('<div class="ccx-msg">No cache settings found. Add one below.</div>');
        return;
    }
    const groups = {};
    for (const k of state.keys) (groups[k.key.split('.')[0]] ??= []).push(k);
    let html = '';
    for (const [section, keys] of Object.entries(groups)) {
        html += `<div class="ccx-group"><h4 class="ccx-section">${esc(section)}</h4>`;
        for (const k of keys) {
            const meta = KNOWN[k.key] || {};
            const value = state.dirty.has(k.key) ? state.dirty.get(k.key) : k.value;
            html += `<div class="ccx-row${state.dirty.has(k.key) ? ' ccx-changed' : ''}">
              <div class="ccx-info">
                <div class="ccx-label">${esc(meta.label || k.key.split('.').slice(1).join('.'))}</div>
                <code class="ccx-key">${esc(k.key)}${k.missing ? ' (not in file yet)' : ''}</code>
                ${meta.help ? `<div class="ccx-help">${esc(meta.help)}</div>` : ''}
              </div>
              <div class="ccx-ctrl">${controlHtml({ ...k, value })}</div>
            </div>`;
        }
        html += '</div>';
    }
    list.html(html);
    if (!state.admin) list.find('input,button').prop('disabled', true);
}

function updateBar() {
    const n = state.dirty.size;
    $('#ccx_status').text(n ? `${n} unsaved change${n > 1 ? 's' : ''}` : 'No changes');
    $('#ccx_save, #ccx_revert').prop('disabled', !n || !state.admin);
}

function setValue(key, value) {
    if (state.original.get(key) === value) state.dirty.delete(key);
    else state.dirty.set(key, value);
    $(`#ccx_list [data-key="${key}"]`).closest('.ccx-row').toggleClass('ccx-changed', state.dirty.has(key));
    updateBar();
}

async function load() {
    $('#ccx_list').html('<div class="ccx-msg">Loading…</div>');
    try {
        const r = await fetch(`${API}/config`, { headers: headers() });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        state.keys = data.keys;
        state.admin = data.admin !== false;
        state.original = new Map(data.keys.map(k => [k.key, k.value]));
        state.dirty.clear();
        $('#ccx_path').text(data.path);
        render();
        updateBar();
        if (!state.admin) $('#ccx_status').text('Read-only: admin account required');
    } catch (e) {
        $('#ccx_list').html(`<div class="ccx-msg ccx-err">
          <b>One-time setup needed</b> (${esc(e.message)})<br>
          1. In <code>config.yaml</code> set <code>enableServerPlugins: true</code><br>
          2. From your SillyTavern folder, run:<br>
          <code class="ccx-cmd">cp -r data/default-user/extensions/SillyTavern-CacheControl/plugin plugins/cache-control</code>
          Windows:<br>
          <code class="ccx-cmd">xcopy /E /I data\\default-user\\extensions\\SillyTavern-CacheControl\\plugin plugins\\cache-control</code>
          3. Restart SillyTavern.<br>
          <small>Installed “for all users”? Use <code>public/scripts/extensions/third-party/SillyTavern-CacheControl/plugin</code> instead. Different user name? Replace <code>default-user</code>.</small>
        </div>`);
    }
}

async function save() {
    const changes = [...state.dirty].map(([key, value]) => ({ key, value }));
    if (!changes.length) return;
    $('#ccx_save').prop('disabled', true).text('Saving…');
    try {
        const r = await fetch(`${API}/set`, {
            method: 'POST',
            headers: { ...headers(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ changes }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        toastr.success(data.live
            ? 'Saved and applied. Your next message uses the new settings.'
            : 'Saved to config.yaml. Restart SillyTavern to apply.', 'Cache Control');
        await load();
    } catch (e) {
        toastr.error(e.message, 'Cache Control: save failed');
        updateBar();
    } finally {
        $('#ccx_save').text('Save changes');
    }
}

function applyPreset(name) {
    for (const [key, value] of Object.entries(PRESETS[name])) {
        if (!state.keys.some(k => k.key === key)) continue;
        setValue(key, value);
    }
    render();
    updateBar();
    toastr.info('Preset applied. Tap “Save changes” to keep it.', 'Cache Control');
}

function addKey() {
    const key = String($('#ccx_new_key').val()).trim();
    const type = $('#ccx_new_type').val();
    if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(key)) {
        toastr.warning('Use a dotted path like section.keyName', 'Cache Control');
        return;
    }
    if (state.keys.some(k => k.key === key)) {
        toastr.info('That key is already listed.', 'Cache Control');
        return;
    }
    const value = type === 'boolean' ? false : type === 'number' ? 0 : '';
    state.keys.push({ key, value, type, missing: true });
    state.keys.sort((a, b) => a.key.localeCompare(b.key));
    state.original.set(key, undefined);
    state.dirty.set(key, value);
    $('#ccx_new_key').val('');
    render();
    updateBar();
}

function bind() {
    const list = $('#ccx_list');
    list.on('change', 'input[type="checkbox"]', function () {
        setValue(this.dataset.key, this.checked);
    });
    list.on('input', 'input[type="number"]', function () {
        const v = Number(this.value);
        if (this.value !== '' && Number.isFinite(v)) setValue(this.dataset.key, v);
    });
    list.on('input', 'input.ccx-text', function () {
        setValue(this.dataset.key, this.value);
    });
    list.on('click', 'button[data-step]', function () {
        const input = list.find(`input[type="number"][data-key="${this.dataset.key}"]`);
        const v = (Number(input.val()) || 0) + Number(this.dataset.step);
        input.val(v);
        setValue(this.dataset.key, v);
    });
    $('#ccx').on('click', '[data-preset]', function () { applyPreset(this.dataset.preset); });
    $('#ccx_reload').on('click', load);
    $('#ccx_save').on('click', save);
    $('#ccx_revert').on('click', () => { state.dirty.clear(); render(); updateBar(); });
    $('#ccx_add_btn').on('click', addKey);
}

jQuery(async () => {
    $('#extensions_settings2').append(panelHtml());
    bind();
    load();
});
