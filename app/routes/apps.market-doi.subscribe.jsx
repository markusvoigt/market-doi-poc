import { authenticate } from "../shopify.server";
import {
  errorToJson,
  subscribeWithMarketAwareDoi,
} from "../lib/market-doi.server";

export async function action({ request }) {
  try {
    const { admin, storefront } = await authenticate.public.appProxy(request);
    const formData = await request.formData();

    const result = await subscribeWithMarketAwareDoi({
      request,
      admin,
      storefront,
      email: formData.get("email"),
      country: formData.get("country"),
      source: formData.get("source") || "storefront-app-proxy",
    });

    return Response.json(result);
  } catch (error) {
    console.error("Market DOI app proxy subscribe failed", error);
    return Response.json(errorToJson(error), { status: 400 });
  }
}

export async function loader() {
  return Response.json(
    {
      ok: false,
      error: "POST an email + country to this app proxy endpoint.",
    },
    { status: 405 },
  );
}
