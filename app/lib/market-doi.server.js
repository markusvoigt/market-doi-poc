import { ApiVersion } from "@shopify/shopify-app-react-router/server";

const DEFAULT_DOI_COUNTRIES = ["DE", "AT"];

// The Storefront `customerEmailMarketingSubscribe` mutation is only available on
// the unstable API version. The rest of the app stays on the pinned stable
// version (see app/shopify.server.js); we override the version per-request just
// for this call until the mutation graduates to a stable version.
const STOREFRONT_DOI_API_VERSION = ApiVersion.Unstable;

// NOTE: The `customer` field returns `CustomerMarketingSubscribe`, which only
// exposes `id` (and that requires a customer access token we don't have in this
// unauthenticated app-proxy context). The shopify.dev example selecting
// `customer { email }` is out of date with the unstable schema, so we only read
// back `customerUserErrors`.
const STOREFRONT_SUBSCRIBE_MUTATION = `#graphql
  mutation customerEmailMarketingSubscribe($email: String!) {
    customerEmailMarketingSubscribe(email: $email) {
      customerUserErrors {
        field
        message
        code
      }
    }
  }
`;

const FIND_CUSTOMER_BY_EMAIL_QUERY = `#graphql
  query FindCustomerByEmail($query: String!) {
    customers(first: 1, query: $query) {
      nodes {
        id
        email
        defaultEmailAddress {
          emailAddress
          marketingState
          marketingOptInLevel
          marketingUpdatedAt
        }
      }
    }
  }
`;

const CREATE_CUSTOMER_MUTATION = `#graphql
  mutation CreateCustomer($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer {
        id
        email
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const UPDATE_EMAIL_MARKETING_CONSENT_MUTATION = `#graphql
  mutation CustomerEmailMarketingConsentUpdate(
    $input: CustomerEmailMarketingConsentUpdateInput!
  ) {
    customerEmailMarketingConsentUpdate(input: $input) {
      customer {
        id
        email
        defaultEmailAddress {
          emailAddress
          marketingState
          marketingOptInLevel
          marketingUpdatedAt
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export class MarketDoiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "MarketDoiError";
    this.details = details;
  }
}

export function getDoiCountries() {
  return (process.env.DOI_COUNTRIES || DEFAULT_DOI_COUNTRIES.join(","))
    .split(",")
    .map((country) => normalizeCountry(country))
    .filter(Boolean);
}

export function normalizeCountry(country) {
  return country?.toString().trim().toUpperCase() || "";
}

export function unknownCountryRequiresDoi() {
  return process.env.UNKNOWN_COUNTRY_REQUIRES_DOI !== "false";
}

export function countryRequiresDoi(country) {
  const normalizedCountry = normalizeCountry(country);
  if (!normalizedCountry) return unknownCountryRequiresDoi();

  return getDoiCountries().includes(normalizedCountry);
}

export function normalizeShopDomain(value) {
  if (!value) return "";

  try {
    const url = value.startsWith("http") ? new URL(value) : new URL(`https://${value}`);
    return url.hostname;
  } catch {
    return value.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

export function inferCountryFromRequest(request, explicitCountry) {
  const url = new URL(request.url);
  const fromInput = normalizeCountry(explicitCountry || url.searchParams.get("country"));
  if (fromInput) return fromInput;

  // Common country headers from edge/CDN/app platforms. Use explicit buyer context
  // from Checkout or Liquid whenever possible; headers are only a fallback.
  for (const header of [
    "cf-ipcountry",
    "x-vercel-ip-country",
    "x-shopify-country",
    "cloudfront-viewer-country",
  ]) {
    const country = normalizeCountry(request.headers.get(header));
    if (country && country !== "XX") return country;
  }

  return "";
}

export async function subscribeWithMarketAwareDoi({
  request,
  admin,
  storefront,
  email,
  country,
  source = "unknown",
}) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedCountry = inferCountryFromRequest(request, country);

  if (!normalizedEmail) {
    throw new MarketDoiError("A valid email address is required", { field: "email" });
  }

  if (!admin) {
    throw new MarketDoiError(
      "Admin API context is unavailable. Install the app and ensure an offline session exists.",
    );
  }

  const requiresDoubleOptIn = countryRequiresDoi(normalizedCountry);

  if (requiresDoubleOptIn) {
    if (!storefront) {
      throw new MarketDoiError(
        "Storefront API context is unavailable. The DOI path needs Storefront API unauthenticated_write_customers access.",
      );
    }

    const storefrontResult = await triggerStorefrontDoubleOptIn(storefront, normalizedEmail);

    return {
      ok: true,
      path: "storefront_customerEmailMarketingSubscribe",
      email: normalizedEmail,
      country: normalizedCountry,
      requiresDoubleOptIn,
      state: "PENDING_OR_SUBSCRIBED_BY_SHOP_GLOBAL_SETTING",
      message:
        "Country requires DOI, so the Storefront customerEmailMarketingSubscribe flow was used. With Shopify global DOI enabled, Shopify should send the confirmation email and leave the customer pending until confirmed.",
      source,
      storefrontResult,
    };
  }

  const customer = await findOrCreateCustomerByEmail(admin, normalizedEmail);
  const consentResult = await setCustomerEmailMarketingSubscribed(admin, customer.id);

  return {
    ok: true,
    path: "admin_customerEmailMarketingConsentUpdate",
    email: normalizedEmail,
    country: normalizedCountry,
    requiresDoubleOptIn,
    state: "SUBSCRIBED",
    message:
      "Country does not require DOI, so the app bypassed the shop-global DOI flow and set email marketing consent directly with Admin API.",
    source,
    customer,
    consentResult,
  };
}

function normalizeEmail(email) {
  const normalized = email?.toString().trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return "";
  return normalized;
}

async function triggerStorefrontDoubleOptIn(storefront, email) {
  const response = await storefront.graphql(STOREFRONT_SUBSCRIBE_MUTATION, {
    variables: { email },
    apiVersion: STOREFRONT_DOI_API_VERSION,
  });
  const json = await response.json();

  const payload = json.data?.customerEmailMarketingSubscribe;
  const userErrors = payload?.customerUserErrors || [];

  if (json.errors?.length || userErrors.length) {
    throw new MarketDoiError("Storefront subscribe failed", {
      graphqlErrors: json.errors,
      userErrors,
    });
  }

  return payload;
}

async function findOrCreateCustomerByEmail(admin, email) {
  const existing = await findCustomerByEmail(admin, email);
  if (existing) return existing;

  const response = await admin.graphql(CREATE_CUSTOMER_MUTATION, {
    variables: { input: { email } },
  });
  const json = await response.json();
  const payload = json.data?.customerCreate;

  if (json.errors?.length || payload?.userErrors?.length) {
    throw new MarketDoiError("Customer create failed", {
      graphqlErrors: json.errors,
      userErrors: payload?.userErrors,
    });
  }

  return payload.customer;
}

async function findCustomerByEmail(admin, email) {
  const response = await admin.graphql(FIND_CUSTOMER_BY_EMAIL_QUERY, {
    variables: { query: `email:${email}` },
  });
  const json = await response.json();

  if (json.errors?.length) {
    throw new MarketDoiError("Customer lookup failed", { graphqlErrors: json.errors });
  }

  return json.data?.customers?.nodes?.[0] || null;
}

async function setCustomerEmailMarketingSubscribed(admin, customerId) {
  const response = await admin.graphql(UPDATE_EMAIL_MARKETING_CONSENT_MUTATION, {
    variables: {
      input: {
        customerId,
        emailMarketingConsent: {
          marketingState: "SUBSCRIBED",
          marketingOptInLevel: "SINGLE_OPT_IN",
          consentUpdatedAt: new Date().toISOString(),
        },
      },
    },
  });
  const json = await response.json();
  const payload = json.data?.customerEmailMarketingConsentUpdate;

  if (json.errors?.length || payload?.userErrors?.length) {
    throw new MarketDoiError("Email marketing consent update failed", {
      graphqlErrors: json.errors,
      userErrors: payload?.userErrors,
    });
  }

  return payload.customer;
}

export function errorToJson(error) {
  if (error instanceof MarketDoiError) {
    return { ok: false, error: error.message, details: error.details || {} };
  }

  return {
    ok: false,
    error: error?.message || "Unexpected error",
  };
}
