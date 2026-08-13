import "server-only";
import { loopRequest } from "./client";
import { loopConfig, isDemoMode } from "./config";

/**
 * Request to Pay and Checkout — the money-in side for business Boards.
 *
 * Chroma does not move money on its own: it asks LOOP to raise a request, and
 * the resulting transaction comes back through the normal IPN/history path and
 * gets logged to the Board that raised it.
 */

export interface PaymentRequestInput {
  accessToken: string;
  accountRef: string;
  /** minor units */
  amount: number;
  currency?: string;
  payerPhone: string;
  narrative: string;
  /** echoed back on the resulting transaction so we can auto-file it */
  boardId: string;
}

export interface PaymentRequestResult {
  requestId: string;
  status: "pending" | "sent" | "failed";
  /** Checkout only: hosted page the payer opens. */
  checkoutUrl?: string;
  reference: string;
}

function demoReference(boardId: string): string {
  return `CHROMA-${boardId.slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
}

export async function createRequestToPay(input: PaymentRequestInput): Promise<PaymentRequestResult> {
  const reference = demoReference(input.boardId);

  if (isDemoMode()) {
    return { requestId: `RTP-${reference}`, status: "sent", reference };
  }

  const res = await loopRequest<{ request_id?: string; id?: string; status?: string }>("/payments/request-to-pay", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      account_reference: input.accountRef,
      amount: input.amount,
      currency: input.currency ?? "KES",
      payer: { phone_number: input.payerPhone },
      narrative: input.narrative,
      client_reference: reference,
      callback_url: loopConfig.ipnCallbackUrl,
    },
  });

  return {
    requestId: String(res.request_id ?? res.id ?? reference),
    status: (res.status as PaymentRequestResult["status"]) ?? "pending",
    reference,
  };
}

export async function createCheckout(input: Omit<PaymentRequestInput, "payerPhone">): Promise<PaymentRequestResult> {
  const reference = demoReference(input.boardId);

  if (isDemoMode()) {
    return {
      requestId: `CHK-${reference}`,
      status: "sent",
      reference,
      checkoutUrl: `${loopConfig.appBaseUrl}/demo/checkout/${reference}`,
    };
  }

  const res = await loopRequest<{ checkout_id?: string; id?: string; status?: string; checkout_url?: string; url?: string }>(
    "/checkout/sessions",
    {
      method: "POST",
      accessToken: input.accessToken,
      body: {
        account_reference: input.accountRef,
        amount: input.amount,
        currency: input.currency ?? "KES",
        narrative: input.narrative,
        client_reference: reference,
        callback_url: loopConfig.ipnCallbackUrl,
      },
    },
  );

  return {
    requestId: String(res.checkout_id ?? res.id ?? reference),
    status: (res.status as PaymentRequestResult["status"]) ?? "pending",
    checkoutUrl: res.checkout_url ?? res.url,
    reference,
  };
}
