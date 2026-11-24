import { ERP } from './erp.js';

let cachedSupport = null;
let loadedOnce = false;

function copyText(text, toast) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard')).catch(() => fallbackCopy(text, toast));
  } else {
    fallbackCopy(text, toast);
  }
}

function fallbackCopy(text, toast) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    toast('Copied to clipboard');
  } catch {
    toast('Copy failed');
  }
  ta.remove();
}

export const Support = {
  async render(container, ctx) {
    const { state, toast, escapeHtml } = ctx;

    if (!loadedOnce && !ERP.isStandalonePreview()) {
      loadedOnce = true;
      const remote = await ERP.getPublicSupport();
      if (remote) cachedSupport = remote;
    }

    const support = cachedSupport || {
      upiId: state.settings.upiId || '',
      coffeeUrl: state.settings.coffeeUrl || '',
      scannerImage: state.settings.scannerImage || ''
    };

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">Support LifeOS</h2>
          <p class="page-subtitle">Scan the QR code or connect via Website, GitHub, and LinkedIn.</p>
        </div>
      </div>

      <div class="card" style="max-width: 480px; margin: 0 auto; text-align: center;">
        <div class="bento-icon-circle" style="margin: 0 auto 12px;"><i data-lucide="coffee" style="width:18px;height:18px;"></i></div>
        <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 6px;">Buy Me a Coffee</h3>
        <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 18px;">
          If LifeOS helps you stay organized, feel free to scan below.
        </p>

        ${support.scannerImage ? `
          <div style="background:#FFFFFF;padding:14px;border-radius:14px;display:inline-block;border:1px solid var(--border);margin-bottom:16px;">
            <img src="${support.scannerImage}" alt="Payment QR Scanner" style="max-width:240px;width:100%;height:auto;display:block;border-radius:8px;" />
          </div>
        ` : `
          <div class="list-row" style="justify-content:center;padding:24px 16px;margin-bottom:16px;flex-direction:column;">
            <i data-lucide="qr-code" style="width:34px;height:34px;color:var(--text-muted);margin-bottom:8px;"></i>
            <span style="font-size:13px;color:var(--text-muted);">QR scanner will appear here once configured by the Admin in Settings.</span>
          </div>
        `}

        ${support.upiId ? `
          <div class="list-row" style="margin-bottom: 12px;">
            <span style="font-size:13px;font-weight:500;">UPI: ${escapeHtml(support.upiId)}</span>
            <button type="button" id="copy-upi-btn" class="btn btn-secondary btn-sm"><i data-lucide="copy"></i> Copy</button>
          </div>
        ` : ''}

        ${support.coffeeUrl && /^https?:\/\//i.test(support.coffeeUrl) ? `
          <a href="${escapeHtml(support.coffeeUrl)}" target="_blank" rel="noopener" class="btn btn-primary" style="width:100%;text-decoration:none;margin-bottom:14px;">
            <i data-lucide="external-link"></i> Open Buy Me a Coffee
          </a>
        ` : ''}

        <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;padding-top:12px;border-top:1px solid var(--border);">
          <a href="https://www.jatinlogs.in/" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="text-decoration:none;">
            <i data-lucide="globe" style="width:14px;height:14px;"></i> Website
          </a>
          <a href="https://github.com/official-Jatin" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="text-decoration:none;">
            <i data-lucide="github" style="width:14px;height:14px;"></i> GitHub
          </a>
          <a href="https://www.linkedin.com/in/jatin2234" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="text-decoration:none;">
            <i data-lucide="linkedin" style="width:14px;height:14px;"></i> LinkedIn
          </a>
        </div>
      </div>
    `;

    const copyBtn = container.querySelector('#copy-upi-btn');
    if (copyBtn) copyBtn.addEventListener('click', () => copyText(support.upiId, toast));

    if (window.lucide) window.lucide.createIcons();
  }
};
