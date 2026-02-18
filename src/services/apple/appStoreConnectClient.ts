import axios from "axios";
import { createAppStoreConnectToken } from "./appStoreConnectJwt";

const ASC_BASE = "https://api.appstoreconnect.apple.com/v1";

export async function listInAppPurchases(appId: string) {
  const token = await createAppStoreConnectToken();

  // This endpoint lists IAPs for an app (consumables, non-consumables, subs)
  // We'll include the IAP type and productId fields.
  const url = `${ASC_BASE}/apps/${appId}/inAppPurchasesV2`;

  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    params: {
      "fields[inAppPurchases]": "name,productId,inAppPurchaseType,state",
      "limit": 20,
    },
    timeout: 15000,
  });

  return res.data;
}

export async function listSubscriptionGroupsWithSubscriptions(appId: string) {
  const token = await createAppStoreConnectToken();

  const url = `${ASC_BASE}/apps/${appId}/subscriptionGroups`;

  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    params: {
      include: "subscriptions",
      limit: 200,
      "fields[subscriptions]": "name,productId,state,subscriptionPeriod",
    },
    timeout: 15000,
  });

  return res.data;
}