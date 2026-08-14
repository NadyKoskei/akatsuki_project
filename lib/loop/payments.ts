import "server-only";
import { loopConfig, isDemoMode } from "./config";
import { LoopApiError } from "./client";
import { getAccessToken, loopNonce, loopTimestamp, loopTxnReference, signRequest } from "./auth";
import type { TillCredentials } from "./transactions";

/**
 * Outgoing payments — what standing orders use.
 *
 * Same envelope as the history API: serviceCode + a unique txnReference, with
 * requestParameters carrying the signed fields. The signature covers
 * "merchantTill|timestamp|nonce" exactly as before, so a payment is signed with
 * the same till secret that proves the account.
 */

export interface TransferInput {
  credentials: TillCredentials;
  /** Minor units, as stored. LOOP wants whole KES. */
  amount: number;
  /** Paybill or till number being paid. */
  destination: string;
  /** Account reference the paybill expects (invoice, meter, account no.). */
  accountNumber: string;
  narrative: string;
  clientReference: string;
}

export interface TransferResult {
  loopTransactionId: string | null;
  status: "sent" | "pending" | "failed";
  reference: string;
  message: string;
}

interface PaymentEnvelope {
  statusCode?: number;
  message?: string;
  data?: {
    serviceTransactionStatus?: string;
    requestReference?: string;
    txnReference?: string;
    response?: { transactionRef?: string; rspMessage?: string; status?: string };
  };
}

/**
 * Pays a paybill from the connected till.
 *
 * In demo mode nothing is sent — the caller synthesises the debit so the flow
 * is demonstrable without moving sandbox money.
 */
export async function initiateTransfer(input: TransferInput): Promise<TransferResult> {
  if (isDemoMode()) {
    return { loopTransactionId: null, status: "sent", reference: input.clientReference, message: "demo" };
  }

  const token = await getAccessToken();
  const timestamp = loopTimestamp();
  const nonce = loopNonce();
  const { merchantTill, tillSecret } = input.credentials;

  const body = {
    serviceCode: "MRCHNT_PAYMENTS",
    txnReference: loopTxnReference(),
    requestParameters: {
      merchantTill,
      merchantRcvTill: input.destination,
      accountNumber: input.accountNumber || input.clientReference,
      // LOOP takes whole KES; Chroma stores minor units.
      amount: Math.round(input.amount / 100),
      channel: "LOOP",
      timestamp,
      nonce,
      signature: signRequest(merchantTill, timestamp, nonce, tillSecret),
    },
  };

  const res = await fetch(loopConfig.payToPaybillUrl, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let envelope: PaymentEnvelope;
  try {
    envelope = JSON.parse(text) as PaymentEnvelope;
  } catch {
    throw new LoopApiError("pay-to-paybill", res.status, text.slice(0, 400));
  }

  // As with history, the body's statusCode is the authoritative outcome.
  const status = envelope.statusCode ?? res.status;
  if (status !== 200) {
    return {
      loopTransactionId: null,
      status: "failed",
      reference: input.clientReference,
      message: envelope.message ?? `LOOP returned ${status}`,
    };
  }

  return {
    loopTransactionId: envelope.data?.response?.transactionRef ?? envelope.data?.requestReference ?? null,
    status: "sent",
    reference: input.clientReference,
    message: envelope.message ?? "accepted",
  };
}
