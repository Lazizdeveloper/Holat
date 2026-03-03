/* eslint-disable no-console */
const API_BASE = (process.env.SMOKE_API_BASE || "http://localhost:4000/api").replace(/\/$/, "");

async function request(path, { method = "GET", token, body, rawBody, headers: extraHeaders } = {}) {
  const headers = { ...(extraHeaders || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  } else if (rawBody !== undefined) {
    payload = rawBody;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: payload,
  });

  const raw = await res.text();
  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { message: raw };
    }
  }

  if (!res.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join(", ")
      : data?.message || `Request failed (${res.status})`;
    throw new Error(`${method} ${path} -> ${message}`);
  }

  return data;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function randomDigits(length) {
  let value = "";
  while (value.length < length) {
    value += Math.floor(Math.random() * 10).toString();
  }
  return value.slice(0, length);
}

async function run() {
  console.log(`[smoke] API base: ${API_BASE}`);

  const health = await request("/health");
  assert(health?.status === "ok", "Health check failed");
  console.log("[smoke] health: ok");

  const now = Date.now();
  const suffix = String(now).slice(-6);
  const today = new Date().toISOString().slice(0, 10);
  const pinfl = randomDigits(14);

  const citizen = await request("/auth/register/citizen", {
    method: "POST",
    body: {
      fullName: `Smoke Citizen ${suffix}`,
      email: `smoke-citizen-${now}@example.com`,
      password: "SmokePass123!",
      pinfl,
      phone: "+998901234567",
      region: "Toshkent shahri",
    },
  });
  assert(citizen?.accessToken, "Citizen register did not return accessToken");
  console.log("[smoke] citizen register: ok");

  const gov = await request("/auth/register/gov", {
    method: "POST",
    body: {
      fullName: `Smoke Gov ${suffix}`,
      email: `smoke-gov-${now}@example.com`,
      password: "SmokePass123!",
      ministryKey: "road",
      ministryName: "Yol va Transport",
      position: "Mutaxassis",
      region: "Toshkent shahri",
    },
  });
  assert(gov?.accessToken, "Gov register did not return accessToken");
  console.log("[smoke] gov register: ok");

  const refreshedCitizen = await request("/auth/refresh", {
    method: "POST",
    body: {
      refreshToken: citizen.refreshToken,
    },
  });
  assert(
    refreshedCitizen?.accessToken && refreshedCitizen?.refreshToken,
    "Refresh endpoint did not return new token pair",
  );
  console.log("[smoke] token refresh: ok");

  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgwJ/lU2xVQAAAABJRU5ErkJggg==",
    "base64",
  );
  const uploadForm = new FormData();
  uploadForm.append("file", new Blob([tinyPng], { type: "image/png" }), "smoke.png");

  const uploaded = await request("/uploads", {
    method: "POST",
    token: refreshedCitizen.accessToken,
    rawBody: uploadForm,
  });
  assert(uploaded?.imageUrl, "Upload endpoint did not return imageUrl");
  console.log("[smoke] upload image: ok");

  const createdIssue = await request("/issues", {
    method: "POST",
    token: refreshedCitizen.accessToken,
    body: {
      category: "road",
      title: `Smoke issue ${suffix}`,
      description: "Smoke test issue description",
      priority: "high",
      region: "Toshkent shahri",
      latitude: 41.311081,
      longitude: 69.240562,
      imageUrl: uploaded.imageUrl,
    },
  });
  assert(createdIssue?.id, "Issue create did not return id");
  console.log("[smoke] issue create: ok");

  const meStats = await request("/users/me/stats", {
    token: refreshedCitizen.accessToken,
  });
  assert(meStats?.reports >= 1, "User stats reports was not updated");
  assert(meStats?.votes >= 1, "User stats votes was not updated");
  console.log("[smoke] user stats: ok");

  const myIssues = await request("/users/me/issues?page=1&limit=10&sortBy=createdAt&sortOrder=desc", {
    token: refreshedCitizen.accessToken,
  });
  assert(Array.isArray(myIssues?.items), "User issues endpoint did not return paginated items");
  assert(myIssues?.total >= 1, "User issues total is invalid");
  console.log("[smoke] user issues pagination: ok");

  const initialPrefs = await request("/users/me/preferences", {
    token: refreshedCitizen.accessToken,
  });
  assert(typeof initialPrefs?.notifOn === "boolean", "User preferences response is invalid");

  const updatedPrefs = await request("/users/me/preferences", {
    method: "PATCH",
    token: refreshedCitizen.accessToken,
    body: {
      notifOn: false,
      emailOn: true,
    },
  });
  assert(updatedPrefs?.notifOn === false, "User notification preference was not updated");
  assert(updatedPrefs?.emailOn === true, "User email preference was not updated");
  console.log("[smoke] user preferences: ok");

  const claim = await request(`/claims/issues/${createdIssue.id}`, {
    method: "POST",
    token: gov.accessToken,
    body: {
      organization: "Smoke Organization",
      statement: "Muammo bartaraf etildi",
      claimDate: today,
      status: "in_progress",
    },
  });
  assert(claim?.id, "Claim create did not return id");
  console.log("[smoke] claim create: ok");

  const vote = await request(`/claims/issues/${createdIssue.id}/vote`, {
    method: "POST",
    token: refreshedCitizen.accessToken,
    body: {
      type: "confirm",
    },
  });
  assert(vote?.confirmCount >= 1, "Claim vote confirmCount was not updated");
  console.log("[smoke] claim vote: ok");

  await request(`/issues/${createdIssue.id}/status`, {
    method: "PATCH",
    token: gov.accessToken,
    body: {
      status: "resolved",
    },
  });
  console.log("[smoke] issue status update: ok");

  const issueFeed = await request(`/issues/feed/${createdIssue.id}`, {
    token: refreshedCitizen.accessToken,
  });
  assert(issueFeed?.status === "resolved", "Feed issue status is not resolved");
  assert(issueFeed?.gc, "Feed issue latest claim is missing");
  assert(issueFeed?.mine === true, "Feed issue mine flag is invalid");
  assert(issueFeed?.voted === true, "Feed issue voted flag is invalid");
  assert(issueFeed?.mv === "confirm", "Feed issue mv flag is invalid");
  assert(issueFeed?.image, "Feed issue image is missing");
  console.log("[smoke] issue feed verification: ok");

  const feedPaged = await request("/issues/feed?page=1&limit=5&sortBy=votes&sortOrder=desc", {
    token: refreshedCitizen.accessToken,
  });
  assert(Array.isArray(feedPaged?.items), "Feed pagination endpoint did not return paginated items");
  assert(typeof feedPaged?.total === "number", "Feed pagination total is missing");
  console.log("[smoke] issue feed pagination: ok");

  const analyticsRegions = await request("/analytics/regions?page=1&limit=5&sortBy=totalIssues&sortOrder=desc");
  assert(Array.isArray(analyticsRegions?.items), "Analytics regions did not return list");

  const analyticsMinistries = await request("/analytics/ministries?page=1&limit=5&sortBy=totalIssues&sortOrder=desc");
  assert(Array.isArray(analyticsMinistries?.items), "Analytics ministries did not return list");

  const analyticsOverview = await request("/analytics/overview");
  assert(analyticsOverview?.totals?.issues >= 1, "Analytics overview totals are invalid");
  console.log("[smoke] analytics endpoints: ok");

  const logout = await request("/auth/logout", {
    method: "POST",
    token: refreshedCitizen.accessToken,
  });
  assert(logout?.success === true, "Logout did not return success");
  console.log("[smoke] logout: ok");

  let refreshAfterLogoutFailed = false;
  try {
    await request("/auth/refresh", {
      method: "POST",
      body: { refreshToken: refreshedCitizen.refreshToken },
    });
  } catch {
    refreshAfterLogoutFailed = true;
  }
  assert(refreshAfterLogoutFailed, "Refresh token still worked after logout");
  console.log("[smoke] refresh invalidated after logout: ok");

  console.log("[smoke] All checks passed");
}

run().catch((error) => {
  console.error(`[smoke] Failed: ${error.message}`);
  process.exit(1);
});
