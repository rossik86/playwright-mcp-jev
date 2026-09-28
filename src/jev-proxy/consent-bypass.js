// src/jev-proxy/consent-bypass.js
'use strict';

/**
 * Initialization script injected into browser pages to prevent
 * cookie/GDPR consent overlays (Didomi, OneTrust, CookieBot) from blocking clicks.
 */
(function() {
  function inject() {
    if (document.getElementById('bil-consent-bypass')) return;
    const style = document.createElement('style');
    style.id = 'bil-consent-bypass';
    style.textContent = `
      #didomi-host, #didomi-popup, .didomi-popup-backdrop, .didomi-notice-popup, .didomi-exterior-border,
      #onetrust-consent-sdk, .onetrust-pc-dark-filter,
      #CybotCookiebotDialog, #CybotCookiebotDialogBodyUnderlay {
        pointer-events: none !important;
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
      }
    `;
    if (document.head) {
      document.head.appendChild(style);
    } else if (document.documentElement) {
      document.documentElement.appendChild(style);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

  // Also notify consent managers via standard APIs if present
  const notifyConsent = () => {
    try {
      if (window.Didomi && typeof window.Didomi.setUserAgreeToAll === 'function') {
        window.Didomi.setUserAgreeToAll();
      }
      if (window.OneTrust && typeof window.OneTrust.AllowAll === 'function') {
        window.OneTrust.AllowAll();
      }
    } catch {}
  };
  const timer = setInterval(notifyConsent, 500);
  setTimeout(() => clearInterval(timer), 10000);
})();
