import axios from "axios";
import { createAppleServerApiToken } from "./appleJwtService";
import { appleConfig } from "../../configs/apple";

function baseUrl() {
  const env = (appleConfig.env || "PRODUCTION").toUpperCase();
  return env === "SANDBOX"
    ? "https://api.storekit-sandbox.itunes.apple.com"
    : "https://api.storekit.itunes.apple.com";
}

function logAppleApiError(label: string, e: any, context: Record<string, any>) {
  console.error(label, {
    ...context,
    status: e?.response?.status,
    data: e?.response?.data,
    code: e?.code,
    message: e?.message,
    stack: e?.stack,
  });
}

export async function getTransactionInfo(transactionId: string) {
  const token = await createAppleServerApiToken();
  const url = `${baseUrl()}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`;

  try {
    const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000, });
    return res.data;
  } catch (e: any) {
    logAppleApiError("Apple transaction API error", e, {
      url,
      appleEnv: appleConfig.env,
      transactionId,
    });
    throw e;
  }
}

export async function getSubscriptionInfo(transactionId: string) {
  const token = await createAppleServerApiToken();
  const url = `${baseUrl()}/inApps/v1/subscriptions/${encodeURIComponent(transactionId)}`;

  try {
    const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000, });
    return res.data;
  } catch (e: any) {
    logAppleApiError("Apple subscription API error", e, {
      url,
      appleEnv: appleConfig.env,
      transactionId,
    });
    throw e;
  }
}

type AppleHistoryQuery = Partial<{
  revision: string;
  startDate: string;
  endDate: string;
  productId: string;
  productType: string;
  sort: string;
  subscriptionGroupIdentifier: string;
  inAppOwnershipType: string;
  revoked: string;
}>;

export async function getTransactionHistory(transactionId: string, query?: AppleHistoryQuery) {
  const token = await createAppleServerApiToken();
  const url = `${baseUrl()}/inApps/v2/history/${encodeURIComponent(transactionId)}`;

  try {
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      params: query,
      timeout: 15000,
    });
    return res.data;
  } catch (e: any) {
    logAppleApiError("Apple transaction history API error", e, {
      url,
      query,
      appleEnv: appleConfig.env,
      transactionId,
    });
    throw e;
  }
}
