import { authenticate, unauthenticated } from "../shopify.server";
import {
  errorToJson,
  normalizeShopDomain,
  subscribeWithMarketAwareDoi,
} from "../lib/market-doi.server";

export async function action({ request }) {
  const { sessionToken, cors } = await authenticate.public.checkout(request, {
    corsHeaders: ["Content-Type"],
  });

  try {
    const body = await request.json();
    const shop = normalizeShopDomain(sessionToken.dest);
    const { admin } = await unauthenticated.admin(shop);
    const { storefront } = await unauthenticated.storefront(shop);

    const result = await subscribeWithMarketAwareDoi({
      request,
      admin,
      storefront,
      email: body.email,
      country: body.country,
      source: "checkout-ui-extension",
    });

    return cors(Response.json(result));
  } catch (error) {
    console.error("Market DOI checkout subscribe failed", error);
    return cors(Response.json(errorToJson(error), { status: 400 }));
  }
}

export async function loader({ request }) {
  const { cors } = await authenticate.public.checkout(request, {
    corsHeaders: ["Content-Type"],
  });

  return cors(
    Response.json(
      {
        ok: false,
        error: "POST checkout email + country to this endpoint with a checkout session token.",
      },
      { status: 405 },
    ),
  );
}
