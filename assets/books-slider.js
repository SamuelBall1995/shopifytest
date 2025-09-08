(function () {
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  document.addEventListener('DOMContentLoaded', () => {
    $$('.book-carousel').forEach(initCarousel);
  });

  async function initCarousel(root) {
    try {
      const configUrl = root.dataset.configAsset;
      if (!configUrl) return;

      const resp = await fetch(configUrl, { credentials: 'same-origin' });
      const conf = await resp.json();

      // Apply config -> CSS variables
      root.style.setProperty('--gap', (conf.slider?.gap ?? 16) + 'px');
      root.style.setProperty('--cols-mobile', (conf.slider?.visibleMobile ?? 2));
      root.style.setProperty('--cols-tablet', (conf.slider?.visibleTablet ?? 3));
      root.style.setProperty('--cols-desktop', (conf.slider?.visibleDesktop ?? 5));
      root.style.setProperty('--cta-bg', conf.theme?.ctaBg ?? '#f4ce00');
      root.style.setProperty('--cta-text', conf.theme?.ctaText ?? '#111');
      root.style.setProperty('--badge-bg', conf.theme?.badgeBg ?? '#1aa96b');
      root.style.setProperty('--badge-text', conf.theme?.badgeText ?? '#fff');
      root.style.setProperty('--price-color', conf.theme?.priceColor ?? '#111');
      root.style.setProperty('--title-color', conf.theme?.titleColor ?? '#111');
      root.style.setProperty('--muted-color', conf.theme?.mutedColor ?? '#555');
      root.style.setProperty('--card-bg', conf.theme?.cardBg ?? '#fff');
      root.style.setProperty('--card-border', conf.theme?.cardBorder ?? '#e5e5e5');

      // Header text + "View all" link
      const titleEl = root.querySelector('.book-carousel__title');
      const viewAllEl = root.querySelector('.book-carousel__viewall');
      if (titleEl) titleEl.textContent = conf.title ?? '';
      if (viewAllEl && conf.viewAllUrl) {
        viewAllEl.href = conf.viewAllUrl;
        viewAllEl.hidden = false;
      }

      // Fetch products via AJAX API
      const handle = conf.collection;
      const limit = conf.limit ?? 12;
      const productsUrl = `/collections/${encodeURIComponent(handle)}/products.json?limit=${limit}`;
      const prodResp = await fetch(productsUrl, { credentials: 'same-origin' });
      const prodJson = await prodResp.json();
      const products = prodJson.products || [];

      // Render
      const scroller = root.querySelector('.book-carousel__scroller');
      scroller.innerHTML = products.map(p => renderCard(p, conf)).join('');

      // Wire up Add to cart + nav buttons
      wireCart(scroller);
      wireNav(root);

    } catch (e) {
      console.error('Books slider init failed:', e);
    }
  }

  function renderCard(product, conf) {
    const firstAvailable = (product.variants || []).find(v => v.available) || product.variants?.[0];
    const variantId = firstAvailable ? firstAvailable.id : null;

    // price string -> format as currency
    const priceRaw = firstAvailable ? firstAvailable.price : product.price;
    const price = formatMoney(priceRaw);

    const imgSrc =
      (product.images?.[0]?.src || product.featured_image) +
      (product.images?.[0]?.src?.includes('?') ? '' : '?width=400');

    const ctaText = conf.ctaText ?? 'Add to Basket';
    const badge = conf.promoBadgeText;

    return `
      <article class="book-card">
        <div class="book-card__media">
          <a href="/products/${product.handle}" aria-label="${escapeHtml(product.title)}">
            <img src="${imgSrc}" alt="${escapeHtml(product.title)}" loading="lazy" decoding="async" />
          </a>
          <button class="book-card__save" aria-label="Save for later" title="Save">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" fill="currentColor"/>
            </svg>
          </button>
        </div>

        ${badge ? `<div class="book-card__badge">${escapeHtml(badge)}</div>` : ''}

        <h3 class="book-card__title">
          <a href="/products/${product.handle}">${escapeHtml(product.title)}</a>
        </h3>
        ${product.vendor ? `<p class="book-card__vendor">${escapeHtml(product.vendor)}</p>` : ''}

        ${price ? `<p class="book-card__price">${price}</p>` : ''}

        ${variantId ? `
          <button class="book-card__cta" data-variant-id="${variantId}">
            ${escapeHtml(ctaText)}
          </button>` : `
          <a class="book-card__cta" href="/products/${product.handle}">
            ${escapeHtml(ctaText)}
          </a>`}
      </article>
    `;
  }

  function wireCart(scroller) {
    scroller.addEventListener('click', async (e) => {
      const btn = e.target.closest('.book-card__cta[data-variant-id]');
      if (!btn) return;
      btn.disabled = true;
      try {
        const id = Number(btn.dataset.variantId);
        await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ id, quantity: 1 })
        });
        // Optional: show a toast or update cart count
        btn.textContent = 'Added!';
        setTimeout(() => (btn.textContent = btn.getAttribute('data-original') || 'Add'), 1800);
      } catch (err) {
        console.error(err);
        alert('Sorry, could not add to basket.');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function wireNav(root) {
    const scroller = root.querySelector('.book-carousel__scroller');
    const prev = root.querySelector('.book-carousel__nav--prev');
    const next = root.querySelector('.book-carousel__nav--next');

    const update = () => {
      const maxScroll = scroller.scrollWidth - scroller.clientWidth - 1;
      prev.disabled = scroller.scrollLeft <= 0;
      next.disabled = scroller.scrollLeft >= maxScroll;
    };
    update();

    const step = () => scroller.clientWidth; // one “page”
    prev.addEventListener('click', () => scroller.scrollBy({ left: -step(), behavior: 'smooth' }));
    next.addEventListener('click', () => scroller.scrollBy({ left:  step(), behavior: 'smooth' }));
    scroller.addEventListener('scroll', throttle(update, 100));
    window.addEventListener('resize', throttle(update, 200));
  }

  // ---- helpers ----
  function formatMoney(price) {
    if (price == null) return '';
    // Shopify AJAX often sends price as string like "3.90" or as number/minor units depending on theme.
    const val = typeof price === 'string' ? Number(price) : price;
    // If it's in cents, normalize (heuristic: > 100 means likely cents)
    const normalized = val > 100 ? val / 100 : val;
    const currency = document.querySelector('.book-carousel')?.dataset.currency || 'USD';
    try {
      return new Intl.NumberFormat(
        document.querySelector('.book-carousel')?.dataset.locale || 'en',
        { style: 'currency', currency }
      ).format(normalized);
    } catch {
      return `£${normalized.toFixed(2)}`;
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function throttle(fn, wait) {
    let t = 0;
    return function (...args) {
      const now = Date.now();
      if (now - t > wait) { t = now; fn.apply(this, args); }
    };
  }
})();
