# Market-aware double opt-in POC

<a href="https://youtu.be/I00RxKuqrUA">
     <img src="https://img.youtube.com/vi/I00RxKuqrUA/maxresdefault.jpg" alt="Demo video" width="600">
</a>


This is a minimal Shopify app POC for routing email marketing consent by buyer country / market.

It implements the workaround discussed for per-market double opt-in:

1. Keep Shopify's global Marketing double opt-in setting enabled.
2. Replace the native newsletter / checkout marketing subscription field with app-owned UI.
3. Detect the buyer country.
4. Route consent:
   - **DOI-required countries** (default: `DE,AT`) → Storefront API `customerEmailMarketingSubscribe(email)` so Shopify triggers the native confirmation flow when global DOI is enabled.
   - **Non-DOI countries** → Admin API `customerEmailMarketingConsentUpdate` to set the customer to `SUBSCRIBED` directly.

## What is included

- Shopify CLI React Router app scaffold.
- App proxy endpoint for Storefront newsletter forms:
  - `GET /apps/market-doi` renders a minimal Liquid newsletter form.
  - `POST /apps/market-doi/subscribe` routes the subscription.
- Theme app extension with a configurable newsletter block:
  - `extensions/market-doi-newsletter`
- Checkout UI extension POC:
  - `extensions/market-doi-checkout`
  - Renders a custom checkbox and posts to the app backend using a checkout session token.
- Public checkout backend endpoint:
  - `POST /public/checkout/subscribe`

## Dev-docs

- App proxies: `https://shopify.dev/docs/apps/build/online-store/app-proxies`
- Admin GraphQL `customerEmailMarketingConsentUpdate`: `https://shopify.dev/docs/api/admin-graphql/latest/mutations/customerEmailMarketingConsentUpdate`
- Storefront API `customerEmailMarketingSubscribe`: `https://shopify.dev/docs/api/storefront/unstable/mutations/customerEmailMarketingSubscribe`
- Checkout UI extension configuration / network access: `https://shopify.dev/docs/api/checkout-ui-extensions/latest/configuration`
- Checkout session token API: `https://shopify.dev/docs/api/checkout-ui-extensions/2026-01/apis/session-token`

## Required app scopes

Configured in `shopify.app.toml`:

```toml
scopes = "read_customers,write_customers,unauthenticated_write_customers,write_app_proxy"
```

Notes:

- `write_customers` / `read_customers` are used for Admin customer lookup/create/update.
- `unauthenticated_write_customers` is required by Storefront `customerEmailMarketingSubscribe`.
- `write_app_proxy` is required to configure the app proxy from TOML.

## Required Shopify Admin settings (merchant setup)

This app deliberately does **not** change store-wide consent behaviour on its own. Two
native Admin settings must be configured by the merchant for the market-aware DOI flow to
work correctly. The principle is:

> **Keep Shopify's global double opt-in ON** (so the confirmation email fires for the
> countries we route through the Storefront API), and **turn OFF Shopify's own native
> marketing checkboxes** (so this app owns the consent UI and is the single source of the
> opt-in signal).

### 1. Enable the global Marketing double opt-in
<img width="737" height="278" alt="24-51-kltut-x36vc" src="https://github.com/user-attachments/assets/a71f23eb-2755-4612-a86f-543af1ea72fc" />
**Settings → Notifications → Customer marketing confirmation** (the "Marketing double opt-in"
panel).


- Turn the **Customer marketing confirmation** toggle **ON**.
  > _Sent to subscribers so they can confirm their email or SMS subscription._
- Under **Send to**, tick **New email subscribers**.
- **New SMS subscribers** can stay unticked (this POC handles email only).

Why: when this toggle is ON, calling the Storefront API
`customerEmailMarketingSubscribe(email)` makes Shopify send the native confirmation email
(true double opt-in). The app routes **DOI-required countries** (default `DE,AT`) down this
path. If this toggle is OFF, that same call would subscribe the customer directly with no
confirmation, defeating the purpose.

### 2. Disable the native checkout marketing checkboxes
<img width="1193" height="339" alt="24-13-05a90-bs9qm" src="https://github.com/user-attachments/assets/a995c5c1-3aff-4eb4-87b7-a6705abcf25a" />
**Settings → Checkout → Marketing options** ("Display a checkbox for customers to sign up for
email or SMS marketing").

- Turn the **Email** toggle **OFF**.
- Turn the **SMS** toggle **OFF**.

Why: Shopify's native checkout marketing checkbox applies a single, store-wide consent
behaviour and cannot route by market. Leaving it on would create a second, conflicting
opt-in control next to this app's Checkout UI extension checkbox. Disabling it makes the
app's extension the only marketing opt-in at checkout, so every consent decision flows
through the market-aware routing logic.

### Settings summary

| Admin setting | Location | Required state | Reason |
| --- | --- | --- | --- |
| Marketing double opt-in (Customer marketing confirmation) | Settings → Notifications | **ON** + "New email subscribers" ticked | Triggers the native confirmation email for DOI-required countries via the Storefront API |
| Checkout marketing options → Email | Settings → Checkout | **OFF** | Removes the native checkout checkbox so the app's extension owns consent |
| Checkout marketing options → SMS | Settings → Checkout | **OFF** | Out of scope for this POC (email only) |

> Note: exact menu labels can shift between Shopify Admin releases. Match on the section
> titles shown above ("Marketing double opt-in" / "Marketing options") if the navigation
> path differs in your store.

## Configuration

Set countries that require double opt-in:

```bash
DOI_COUNTRIES=DE,AT
```

Unknown country defaults to the safer DOI path. To make unknown country subscribe directly instead, set:

```bash
UNKNOWN_COUNTRY_REQUIRES_DOI=false
```

For the Checkout UI extension, configure the extension setting `app_url` to the full backend endpoint, for example:

```text
https://your-app-url.com/public/checkout/subscribe
```

## Run locally

```bash
cd ~/Desktop/market-doi-poc
pnpm install
pnpm run dev
```

The Shopify CLI will update app URLs during dev because `automatically_update_urls_on_dev = true` is enabled.

## Storefront path

After the app proxy is configured, storefront requests route through Shopify:

```text
https://{shop-domain}/apps/market-doi
https://{shop-domain}/apps/market-doi/subscribe
```

The included theme app extension block posts to `/apps/market-doi/subscribe` and passes:

- `email`
- `country` from `{{ localization.country.iso_code }}`
- `source=theme-app-extension`

## Checkout path

The checkout extension sends:

```json
{
  "email": "buyer@example.com",
  "country": "DE"
}
```

to:

```text
POST /public/checkout/subscribe
Authorization: Bearer <checkout session token>
```

The server validates the checkout session token via `authenticate.public.checkout(request)`, resolves the shop from the token, then gets offline Admin + Storefront contexts via `unauthenticated.admin(shop)` and `unauthenticated.storefront(shop)`.

## Important limitations / assumptions

- This is a POC, not production-ready compliance advice.
- The DOI path assumes Shopify's global double opt-in setting is enabled. If it is disabled, Storefront `customerEmailMarketingSubscribe` may subscribe directly instead of sending confirmation.
- Checkout email access can require protected customer data approval. The extension includes an email field fallback if `buyerIdentity.email` is unavailable.
- Country detection is strongest in Checkout. Storefront/theme usage relies on Liquid `localization.country.iso_code`, explicit form country, or request headers as fallback.
- Production hardening should add rate limiting, bot protection, duplicate suppression, audit logging, jurisdiction/legal review, localized consent copy, and more robust country/buyer-context detection.
