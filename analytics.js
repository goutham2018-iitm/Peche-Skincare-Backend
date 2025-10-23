require("dotenv").config();
const { BetaAnalyticsDataClient } = require("@google-analytics/data");

const PROPERTY_ID = process.env.GOOGLE_ANALYTICS_PROPERTY_ID;
const MEASUREMENT_ID = process.env.VITE_GA_MEASUREMENT_ID;

function isAnalyticsConfigured() {
  const required = [
    "GOOGLE_CLIENT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
    "GOOGLE_ANALYTICS_PROPERTY_ID",
  ];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.log("❌ Missing GA environment variables:", missing);
    return false;
  }

  console.log("✅ Google Analytics environment variables are present");
  console.log("   Property ID:", process.env.GOOGLE_ANALYTICS_PROPERTY_ID);
  console.log("   Measurement ID:", process.env.VITE_GA_MEASUREMENT_ID);
  return true;
}

let analyticsDataClient = null;
let isConfigured = false;

try {
  if (isAnalyticsConfigured()) {
    const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");

    analyticsDataClient = new BetaAnalyticsDataClient({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: privateKey,
      },
    });

    isConfigured = true;
    console.log("✅ Google Analytics client initialized successfully");
  }
} catch (error) {
  console.error(
    "❌ Failed to initialize Google Analytics client:",
    error.message
  );
}

async function getAnalyticsData() {
  console.log("🔄 Fetching analytics data...");
  console.log("📊 Using Property ID:", PROPERTY_ID);

  if (!isConfigured || !analyticsDataClient) {
    console.log("📊 Returning mock analytics data - GA not configured");
    return getMockAnalyticsData();
  }

  try {
    console.log(`🔗 Connecting to GA property: ${PROPERTY_ID}`);

    const [testResponse] = await analyticsDataClient.runReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
      metrics: [{ name: "activeUsers" }],
    });

    console.log("✅ Successfully connected to Google Analytics");

    const [usersResponse] = await analyticsDataClient.runReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      dimensions: [{ name: "newVsReturning" }],
      metrics: [{ name: "activeUsers" }],
    });

    const [sessionsResponse] = await analyticsDataClient.runReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      metrics: [
        { name: "sessions" },
        { name: "averageSessionDuration" },
        { name: "bounceRate" },
      ],
    });

    const [pageviewsResponse] = await analyticsDataClient.runReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      metrics: [
        { name: "screenPageViews" },
        { name: "screenPageViewsPerSession" },
      ],
    });

    const [topPagesResponse] = await analyticsDataClient.runReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }, { name: "totalUsers" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 10,
    });

    const [devicesResponse] = await analyticsDataClient.runReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "activeUsers" }],
    });

    const [locationsResponse] = await analyticsDataClient.runReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      dimensions: [{ name: "country" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit: 10,
    });

    const processedData = processAnalyticsResponses({
      usersResponse,
      sessionsResponse,
      pageviewsResponse,
      topPagesResponse,
      devicesResponse,
      locationsResponse,
    });

    console.log("✅ Real analytics data processed successfully");
    return {
      ...processedData,
      source: "google_analytics",
      dataStatus: "live",
      propertyId: PROPERTY_ID,
    };
  } catch (error) {
    console.error("❌ Error fetching from Google Analytics:", error.message);
    console.log("📊 Falling back to mock data due to error");
    return getMockAnalyticsData();
  }
}

function processAnalyticsResponses(responses) {
  const {
    usersResponse,
    sessionsResponse,
    pageviewsResponse,
    topPagesResponse,
    devicesResponse,
    locationsResponse,
  } = responses;

  let totalUsers = 0;
  let newUsers = 0;
  let returningUsers = 0;

  usersResponse.rows?.forEach((row) => {
    const users = parseInt(row.metricValues[0].value);
    totalUsers += users;
    if (row.dimensionValues[0].value === "new") {
      newUsers = users;
    } else {
      returningUsers = users;
    }
  });

  const sessions = parseInt(
    sessionsResponse.rows?.[0]?.metricValues[0]?.value || 0
  );
  const avgDuration = parseFloat(
    sessionsResponse.rows?.[0]?.metricValues[1]?.value || 0
  );
  const bounceRate = parseFloat(
    sessionsResponse.rows?.[0]?.metricValues[2]?.value || 0
  );

  const pageviews = parseInt(
    pageviewsResponse.rows?.[0]?.metricValues[0]?.value || 0
  );
  const pageviewsPerSession = parseFloat(
    pageviewsResponse.rows?.[0]?.metricValues[1]?.value || 0
  );

  const topPages =
    topPagesResponse.rows?.map((row) => ({
      path: row.dimensionValues[0].value,
      views: parseInt(row.metricValues[0].value),
      uniqueViews: parseInt(row.metricValues[1].value),
    })) || [];

  let totalDeviceUsers = 0;
  const deviceData = { desktop: 0, mobile: 0, tablet: 0 };

  devicesResponse.rows?.forEach((row) => {
    const users = parseInt(row.metricValues[0].value);
    totalDeviceUsers += users;
    const device = row.dimensionValues[0].value.toLowerCase();
    if (deviceData.hasOwnProperty(device)) {
      deviceData[device] = users;
    }
  });

  const devices = {
    desktop:
      totalDeviceUsers > 0
        ? Math.round((deviceData.desktop / totalDeviceUsers) * 100)
        : 0,
    mobile:
      totalDeviceUsers > 0
        ? Math.round((deviceData.mobile / totalDeviceUsers) * 100)
        : 0,
    tablet:
      totalDeviceUsers > 0
        ? Math.round((deviceData.tablet / totalDeviceUsers) * 100)
        : 0,
  };

  const locations =
    locationsResponse.rows?.map((row) => ({
      country: row.dimensionValues[0].value,
      users: parseInt(row.metricValues[0].value),
    })) || [];

  return {
    users: {
      total: totalUsers,
      new: newUsers,
      returning: returningUsers,
    },
    sessions: {
      total: sessions,
      avgDuration: formatDuration(avgDuration),
      bounceRate: `${bounceRate.toFixed(1)}%`,
    },
    pageviews: {
      total: pageviews,
      perSession: pageviewsPerSession.toFixed(1),
    },
    topPages,
    devices,
    locations,
  };
}

function getMockAnalyticsData() {
  const totalUsers = Math.floor(Math.random() * 5000) + 1000;
  const newUsers = Math.floor(totalUsers * 0.7);
  const returningUsers = totalUsers - newUsers;

  return {
    users: {
      total: totalUsers,
      new: newUsers,
      returning: returningUsers,
    },
    sessions: {
      total: Math.floor(totalUsers * 1.2),
      avgDuration: formatDuration(Math.random() * 120 + 60),
      bounceRate: `${(Math.random() * 20 + 30).toFixed(1)}%`,
    },
    pageviews: {
      total: Math.floor(totalUsers * 3.5),
      perSession: (Math.random() * 2 + 2.5).toFixed(1),
    },
    topPages: [
      { path: "/", views: 3456, uniqueViews: 2345 },
      { path: "/products", views: 2876, uniqueViews: 1987 },
      { path: "/about", views: 1567, uniqueViews: 1234 },
      { path: "/contact", views: 987, uniqueViews: 876 },
      { path: "/blog", views: 765, uniqueViews: 654 },
    ],
    devices: {
      desktop: 45,
      mobile: 52,
      tablet: 3,
    },
    locations: [
      { country: "United States", users: 2345 },
      { country: "India", users: 1234 },
      { country: "United Kingdom", users: 567 },
      { country: "Canada", users: 456 },
      { country: "Australia", users: 345 },
    ],
    source: "mock_data",
    dataStatus: "demo",
  };
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}m ${secs}s`;
}

module.exports = { getAnalyticsData, isAnalyticsConfigured };
