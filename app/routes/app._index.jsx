import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { getDoiCountries } from "../lib/market-doi.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return {
    doiCountries: getDoiCountries(),
    appProxyPath: "/apps/market-doi",
    subscribePath: "/apps/market-doi/subscribe",
    checkoutEndpoint: "/public/checkout/subscribe",
  };
};

export default function Index() {
  const { doiCountries, appProxyPath, subscribePath, checkoutEndpoint } = useLoaderData();

  return (
    <s-page heading="Market-aware double opt-in POC">
      <s-section heading="What this POC does">
        <s-paragraph>
          This app implements the workaround discussed in the Slack thread: keep
          Shopify&apos;s global double opt-in setting enabled, replace native
          subscription UI with a custom form, detect buyer country, and route
          consent differently by market.
        </s-paragraph>
        <s-unordered-list>
          <s-list-item>
            DOI country: call Storefront API <s-code>customerEmailMarketingSubscribe</s-code> so Shopify can send the confirmation email.
          </s-list-item>
          <s-list-item>
            Non-DOI country: use Admin API <s-code>customerEmailMarketingConsentUpdate</s-code> to set the customer to <s-code>SUBSCRIBED</s-code> directly.
          </s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section heading="Configuration">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            DOI countries are read from <s-code>DOI_COUNTRIES</s-code>. Current value: <s-code>{doiCountries.join(", ")}</s-code>
          </s-paragraph>
          <s-paragraph>
            App proxy root: <s-code>{appProxyPath}</s-code>
            <br />
            App proxy subscription endpoint: <s-code>{subscribePath}</s-code>
            <br />
            Checkout extension endpoint: <s-code>{checkoutEndpoint}</s-code>
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Setup checklist">
        <s-ordered-list>
          <s-list-item>
            In Shopify Admin, enable the global Marketing double opt-in setting.
          </s-list-item>
          <s-list-item>
            Deploy this app and install it on a development store.
          </s-list-item>
          <s-list-item>
            Ensure the app has <s-code>write_customers</s-code>, <s-code>unauthenticated_write_customers</s-code>, and <s-code>write_app_proxy</s-code> scopes.
          </s-list-item>
          <s-list-item>
            Add the included theme app block to the storefront, or browse to <s-code>{appProxyPath}</s-code>.
          </s-list-item>
          <s-list-item>
            For Checkout, deploy the included checkout UI extension and set <s-code>PUBLIC_APP_URL</s-code> to your app URL.
          </s-list-item>
        </s-ordered-list>
      </s-section>
    </s-page>
  );
}
