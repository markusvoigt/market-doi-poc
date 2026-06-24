import { authenticate } from "../shopify.server";
import { getDoiCountries } from "../lib/market-doi.server";

export async function loader({ request }) {
  const { liquid } = await authenticate.public.appProxy(request);

  return liquid(
    `
    <div class="market-doi-poc" style="max-width: 520px; margin: 24px auto; padding: 20px; border: 1px solid rgba(0,0,0,.12); border-radius: 12px;">
      <h2 style="margin-top: 0;">Subscribe to email updates</h2>
      <p style="color: rgba(0,0,0,.7);">This form routes consent through the Market DOI POC app.</p>
      <form method="post" action="/apps/market-doi/subscribe" data-market-doi-form>
        <input
          type="email"
          name="email"
          required
          autocomplete="email"
          placeholder="you@example.com"
          style="width: 100%; box-sizing: border-box; padding: 12px; margin: 8px 0;"
        />
        <input type="hidden" name="country" value="{{ localization.country.iso_code }}" />
        <input type="hidden" name="source" value="app-proxy-liquid-form" />
        <label style="display: block; margin: 8px 0 16px;">
          <input type="checkbox" required />
          I agree to receive email marketing.
        </label>
        <button type="submit" style="padding: 12px 16px; cursor: pointer;">Subscribe</button>
        <p data-market-doi-result role="status" style="margin-top: 12px;"></p>
      </form>
      <p style="font-size: 12px; color: rgba(0,0,0,.55); margin-bottom: 0;">
        DOI countries configured in the app: ${getDoiCountries().join(", ")}
      </p>
    </div>
    <script>
      document.addEventListener('submit', async (event) => {
        const form = event.target.closest('[data-market-doi-form]');
        if (!form) return;
        event.preventDefault();
        const result = form.querySelector('[data-market-doi-result]');
        result.textContent = 'Subscribing…';
        try {
          const response = await fetch(form.action, {
            method: 'POST',
            body: new FormData(form),
            headers: { Accept: 'application/json' }
          });
          const json = await response.json();
          result.textContent = json.ok ? json.message : (json.error || 'Subscription failed');
        } catch (error) {
          result.textContent = error.message || 'Subscription failed';
        }
      });
    </script>
  `,
    { layout: false },
  );
}
