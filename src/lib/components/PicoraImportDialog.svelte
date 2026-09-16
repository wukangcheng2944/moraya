<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { listen, type UnlistenFn } from '@tauri-apps/api/event';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { isTauri } from '$lib/utils/platform';
  import { t } from '$lib/i18n';
  import { settingsStore } from '$lib/stores/settings-store';
  import {
    createDefaultImageHostTarget,
    PICORA_DEFAULT_API_BASE,
    PICORA_DEFAULT_API_URL,
    PICORA_DEFAULT_IMG_DOMAIN,
    type ImageHostTarget,
  } from '$lib/services/image-hosting';

  interface PicoraDeeplinkPayload {
    version?: string;
    ott?: string;
    key?: string;
    name?: string;
    apiBase?: string;
  }

  interface PicoraUserInfo { email: string; plan: string; nickname?: string }
  interface PicoraImportPayload {
    apiUrl: string;
    apiKey: string;
    imgDomain: string;
    user: PicoraUserInfo;
  }

  type Mode = 'closed' | 'manual' | 'verifying' | 'preview' | 'failed';

  let { onToast }: { onToast?: (text: string, type?: 'success' | 'error') => void } = $props();

  const tr = $t;

  let mode = $state<Mode>('closed');
  let manualKey = $state('');
  let manualApiBase = $state(PICORA_DEFAULT_API_BASE);
  let preview = $state<{ apiUrl: string; apiKey: string; imgDomain: string; user: PicoraUserInfo } | null>(null);
  let errorMsg = $state('');
  let busy = $state(false);

  let unlisten: UnlistenFn | null = null;

  /** Public entry point for the manual-entry button in ImageHostingSettings. */
  export function openManual() {
    manualKey = '';
    manualApiBase = PICORA_DEFAULT_API_BASE;
    preview = null;
    errorMsg = '';
    mode = 'manual';
  }

  function close() {
    mode = 'closed';
    preview = null;
    errorMsg = '';
    manualKey = '';
  }

  function maskToken(token: string): string {
    if (!token) return '';
    if (token.length <= 12) return token.slice(0, 4) + '***';
    return token.slice(0, 8) + '***' + token.slice(-4);
  }

  async function handleDeeplink(payload: PicoraDeeplinkPayload) {
    errorMsg = '';
    preview = null;
    busy = true;
    mode = 'verifying';
    const apiBase = payload.apiBase || PICORA_DEFAULT_API_BASE;
    try {
      if (payload.ott) {
        const result = await invoke<PicoraImportPayload>('exchange_picora_export_token', {
          apiBase,
          ott: payload.ott,
        });
        preview = result;
        mode = 'preview';
      } else if (payload.key) {
        const user = await invoke<PicoraUserInfo>('verify_picora_token', {
          apiBase,
          apiKey: payload.key,
        });
        preview = {
          apiUrl: `${apiBase.replace(/\/$/, '')}/v1/images`,
          apiKey: payload.key,
          imgDomain: PICORA_DEFAULT_IMG_DOMAIN,
          user,
        };
        mode = 'preview';
      } else {
        errorMsg = tr('image_host.picora_import_invalid');
        mode = 'failed';
      }
    } catch (e: unknown) {
      errorMsg = e instanceof Error ? e.message : String(e);
      mode = 'failed';
    } finally {
      busy = false;
    }
  }

  async function verifyManual() {
    const key = manualKey.trim();
    if (!key) return;
    busy = true;
    errorMsg = '';
    try {
      const user = await invoke<PicoraUserInfo>('verify_picora_token', {
        apiBase: manualApiBase,
        apiKey: key,
      });
      preview = {
        apiUrl: `${manualApiBase.replace(/\/$/, '')}/v1/images`,
        apiKey: key,
        imgDomain: PICORA_DEFAULT_IMG_DOMAIN,
        user,
      };
      mode = 'preview';
    } catch (e: unknown) {
      errorMsg = e instanceof Error ? e.message : String(e);
      mode = 'failed';
    } finally {
      busy = false;
    }
  }

  function applyImport() {
    if (!preview) return;
    const target: ImageHostTarget = {
      ...createDefaultImageHostTarget('picora'),
      name: 'Picora',
      picoraApiUrl: preview.apiUrl || PICORA_DEFAULT_API_URL,
      picoraApiKey: preview.apiKey,
      picoraImgDomain: preview.imgDomain || PICORA_DEFAULT_IMG_DOMAIN,
      picoraUserEmail: preview.user.email,
      featured: true,
      picoraImportedAt: Date.now(),
      autoUpload: true,
    };
    const current = $settingsStore;
    const targets = (current.imageHostTargets || []).filter(
      (existing: ImageHostTarget) => existing.provider !== 'picora',
    );
    settingsStore.update({
      imageHostTargets: [target, ...targets],
      defaultImageHostId: target.id,
    });
    const successMsg = tr('image_host.picora_import_success').replace('{email}', preview.user.email);
    onToast?.(successMsg, 'success');
    close();
  }

  async function openPicoraConsole() {
    try {
      await openUrl('https://center.picora.me');
    } catch {
      /* ignore — surface no error */
    }
  }

  function manualOpenHandler() { openManual(); }

  onMount(async () => {
    // 1) Drain any URL the OS handed us before this component mounted.
    try {
      const pending = await invoke<PicoraDeeplinkPayload | null>('take_pending_picora_import');
      if (pending) await handleDeeplink(pending);
    } catch { /* ignore */ }

    // 2) Subscribe to runtime deep-link events.
    if (isTauri) {
      unlisten = await listen<PicoraDeeplinkPayload>('picora-import-request', event => {
        void handleDeeplink(event.payload);
      });
    }

    // 3) In-app trigger from "Add Picora" menu button.
    window.addEventListener('moraya:picora-open-manual', manualOpenHandler);
  });

  onDestroy(() => {
    if (unlisten) unlisten();
    window.removeEventListener('moraya:picora-open-manual', manualOpenHandler);
  });
</script>

{#if mode !== 'closed'}
  <div class="picora-overlay" role="dialog" aria-modal="true">
    <div class="picora-dialog">
      <header class="picora-header">
        <span class="picora-icon">⭐</span>
        <h3>{tr('image_host.picora_import_title')}</h3>
      </header>

      {#if mode === 'verifying'}
        <p class="picora-status">{tr('image_host.picora_verifying')}</p>
      {:else if mode === 'preview' && preview}
        <dl class="picora-preview">
          <dt>{tr('image_host.picora_user_email')}</dt>
          <dd>{preview.user.email} <span class="picora-plan">{preview.user.plan}</span></dd>
          <dt>{tr('image_host.picora_api_url')}</dt>
          <dd>{preview.apiUrl}</dd>
          <dt>{tr('image_host.picora_img_domain')}</dt>
          <dd>{preview.imgDomain}</dd>
          <dt>{tr('image_host.picora_token_preview')}</dt>
          <dd><code>{maskToken(preview.apiKey)}</code></dd>
        </dl>
      {:else if mode === 'failed'}
        <p class="picora-error">{errorMsg || tr('image_host.picora_verify_failed')}</p>
      {:else if mode === 'manual'}
        <p class="picora-hint">{tr('image_host.picora_import_hint')}</p>
        <button class="picora-link" onclick={openPicoraConsole}>
          {tr('image_host.picora_open_console')} ↗
        </button>
        <div class="picora-field">
          <label for="picora-manual-base">{tr('image_host.picora_api_url')}</label>
          <input
            id="picora-manual-base"
            type="text"
            bind:value={manualApiBase}
            placeholder={PICORA_DEFAULT_API_BASE}
          />
        </div>
        <div class="picora-field">
          <label for="picora-manual-key">{tr('image_host.picora_api_key')}</label>
          <input
            id="picora-manual-key"
            type="password"
            bind:value={manualKey}
            placeholder={tr('image_host.picora_api_key_placeholder')}
          />
        </div>
      {/if}

      <footer class="picora-footer">
        <button class="picora-btn picora-btn-secondary" onclick={close} disabled={busy}>
          {tr('common.cancel')}
        </button>
        {#if mode === 'manual'}
          <button
            class="picora-btn picora-btn-primary"
            onclick={verifyManual}
            disabled={busy || !manualKey.trim()}
          >
            {busy ? tr('image_host.picora_verifying') : tr('image_host.picora_verify')}
          </button>
        {:else if mode === 'preview'}
          <button class="picora-btn picora-btn-primary" onclick={applyImport} disabled={busy}>
            {tr('image_host.picora_confirm_import')}
          </button>
        {:else if mode === 'failed'}
          <button class="picora-btn picora-btn-primary" onclick={openManual} disabled={busy}>
            {tr('image_host.picora_manual_entry')}
          </button>
        {/if}
      </footer>
    </div>
  </div>
{/if}

<style>
  .picora-overlay {
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, #000 35%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 1rem;
  }

  .picora-dialog {
    width: min(420px, 100%);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 1.25rem;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
    color: var(--text-primary);
  }

  .picora-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .picora-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .picora-icon { font-size: 1.1rem; }

  .picora-status,
  .picora-hint {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin: 0 0 0.75rem;
  }

  .picora-error {
    font-size: var(--font-size-sm);
    color: #dc3545;
    margin: 0 0 0.75rem;
    word-break: break-word;
  }

  .picora-link {
    display: inline-block;
    background: transparent;
    border: none;
    color: var(--accent-color);
    cursor: pointer;
    font-size: var(--font-size-sm);
    margin-bottom: 0.75rem;
    padding: 0;
  }

  .picora-link:hover { text-decoration: underline; }

  .picora-preview {
    display: grid;
    grid-template-columns: max-content 1fr;
    column-gap: 0.75rem;
    row-gap: 0.4rem;
    margin: 0 0 1rem;
    font-size: var(--font-size-sm);
  }

  .picora-preview dt {
    color: var(--text-muted);
    font-weight: 500;
  }

  .picora-preview dd {
    margin: 0;
    color: var(--text-primary);
    word-break: break-all;
  }

  .picora-preview code {
    font-family: var(--font-mono, monospace);
    background: var(--bg-secondary);
    padding: 0.05rem 0.35rem;
    border-radius: 3px;
    font-size: 0.85em;
  }

  .picora-plan {
    margin-left: 0.4rem;
    font-size: var(--font-size-xs);
    background: color-mix(in srgb, var(--accent-color) 15%, transparent);
    color: var(--accent-color);
    padding: 0.05rem 0.35rem;
    border-radius: 3px;
    text-transform: uppercase;
  }

  .picora-field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin-bottom: 0.75rem;
  }

  .picora-field label {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }

  .picora-field input {
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: var(--font-size-sm);
  }

  .picora-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .picora-btn {
    padding: 0.4rem 0.85rem;
    border-radius: 4px;
    font-size: var(--font-size-sm);
    cursor: pointer;
    border: 1px solid var(--border-color);
    background: var(--bg-primary);
    color: var(--text-secondary);
  }

  .picora-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

  .picora-btn-primary {
    background: var(--accent-color);
    color: #fff;
    border-color: var(--accent-color);
  }

  .picora-btn-primary:hover {
    background: color-mix(in srgb, var(--accent-color) 80%, #000);
    color: #fff;
  }

  .picora-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
