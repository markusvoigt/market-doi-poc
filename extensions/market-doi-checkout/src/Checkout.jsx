import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

export default async function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  // `shopify.settings` is a signal — read `.value` to get the settings record.
  const settings = shopify.settings.value || {};
  const endpoint = settings.app_url?.toString().trim();
  const label =
    settings.label?.toString().trim() || 'I agree to receive email marketing.';

  // Buyer context. The customer signal is populated only for signed-in buyers
  // (and requires protected customer data access). Email + country come from
  // checkout directly, so we never ask the buyer to retype them.
  const customer = shopify.buyerIdentity?.customer?.value;
  const email = (shopify.buyerIdentity?.email?.value || '').trim();
  const country = shopify.localization?.country?.value?.isoCode || '';

  const [checked, setChecked] = useState(false);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);

  const endpointConfigured = useMemo(
    () => Boolean(endpoint) && !endpoint.includes('YOUR_APP_URL'),
    [endpoint],
  );

  // Auto-subscribe as soon as the box is ticked. If the buyer hasn't entered
  // their email yet, wait and fire the moment it becomes available.
  useEffect(() => {
    if (!checked) return;
    if (status === 'loading' || status === 'success' || inFlight.current) return;

    if (!endpointConfigured) {
      setStatus('error');
      setMessage('Subscribe endpoint is not configured in the extension settings.');
      return;
    }

    if (!email) {
      setStatus('idle');
      setMessage('Enter your email above and we’ll subscribe you.');
      return;
    }

    subscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, email, endpointConfigured]);

  async function subscribe() {
    inFlight.current = true;
    setStatus('loading');
    setMessage('');

    try {
      const token = await shopify.sessionToken.get();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, country }),
      });
      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(json.error || 'Subscription failed');
      }

      setStatus('success');
      setMessage(
        json.requiresDoubleOptIn
          ? 'Thanks — please check your inbox to confirm your subscription.'
          : 'Thanks — you are subscribed.',
      );
    } catch (error) {
      setStatus('error');
      setMessage(error.message || 'Subscription failed');
    } finally {
      inFlight.current = false;
    }
  }

  // Hide the extension entirely for signed-in customers who have already
  // accepted email marketing — no point asking again.
  if (customer?.id && customer.acceptsEmailMarketing) {
    return null;
  }

  const tone =
    status === 'error' ? 'critical' : status === 'success' ? 'success' : 'info';

  return (
    <s-stack gap="base">
      <s-checkbox
        label={label}
        checked={checked}
        disabled={status === 'loading' || status === 'success'}
        onChange={(event) => setChecked(event.currentTarget.checked)}
      />
      {message ? <s-banner tone={tone}>{message}</s-banner> : null}
    </s-stack>
  );
}
