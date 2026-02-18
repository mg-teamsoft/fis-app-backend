import axios from "axios";
import { createAppleServerApiToken } from "./appleJwtService";
import { appleConfig } from "../../configs/apple";

function baseUrl() {
  const env = (appleConfig.env || "PRODUCTION").toUpperCase();
  return env === "SANDBOX"
    ? "https://api.storekit-sandbox.itunes.apple.com"
    : "https://api.storekit.itunes.apple.com";
}

export async function getTransactionInfo(transactionId: string) {
  const token = await createAppleServerApiToken();
  const url = `${baseUrl()}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`;

  try {
    const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000, });
    return res.data;
  } catch (e: any) {
    console.error("Apple API error", {
      status: e?.response?.status,
      data: e?.response?.data,
      url,
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
    console.error("Apple API error", {
      status: e?.response?.status,
      data: e?.response?.data,
      url,
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
    console.error("Apple API error", {
      status: e?.response?.status,
      data: e?.response?.data,
      url,
      query,
    });
    throw e;
  }
}
