// analytics.js - Google Analytics Integration
require("dotenv").config();
const { BetaAnalyticsDataClient } = require("@google-analytics/data");

const analyticsDataClient = new BetaAnalyticsDataClient({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
});


const PROPERTY_ID = process.env.VITE_GA_MEASUREMENT_ID;
async function getAnalyticsData() {
  try {
    // Get user metrics
    const [usersResponse] = await analyticsDataClient.runReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'newVsReturning' }],
      metrics: [{ name: 'activeUsers' }],
    });

    // Get session metrics
    const [sessionsResponse] = await analyticsDataClient.runReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      metrics: [
        { name: 'sessions' },
        { name: 'averageSessionDuration' },
        { name: 'bounceRate' },
      ],
    });

    // Get pageview metrics
    const [pageviewsResponse] = await analyticsDataClient.runReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      metrics: [
        { name: 'screenPageViews' },
        { name: 'screenPageViewsPerSession' },
      ],
    });

    // Get top pages
    const [topPagesResponse] = await analyticsDataClient.runReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [
        { name: 'screenPageViews' },
        { name: 'totalUsers' },
      ],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 10,
    });

    // Get device breakdown
    const [devicesResponse] = await analyticsDataClient.runReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [{ name: 'activeUsers' }],
    });

    // Get top locations
    const [locationsResponse] = await analyticsDataClient.runReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'country' }],
      metrics: [{ name: 'activeUsers' }],
      orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
      limit: 10,
    });

    // Process users data
    let totalUsers = 0;
    let newUsers = 0;
    let returningUsers = 0;

    usersResponse.rows?.forEach(row => {
      const users = parseInt(row.metricValues[0].value);
      totalUsers += users;
      if (row.dimensionValues[0].value === 'new') {
        newUsers = users;
      } else {
        returningUsers = users;
      }
    });

    // Process session data
    const sessions = parseInt(sessionsResponse.rows?.[0]?.metricValues[0]?.value || 0);
    const avgDuration = parseFloat(sessionsResponse.rows?.[0]?.metricValues[1]?.value || 0);
    const bounceRate = parseFloat(sessionsResponse.rows?.[0]?.metricValues[2]?.value || 0);

    // Process pageview data
    const pageviews = parseInt(pageviewsResponse.rows?.[0]?.metricValues[0]?.value || 0);
    const pageviewsPerSession = parseFloat(pageviewsResponse.rows?.[0]?.metricValues[1]?.value || 0);

    // Process top pages
    const topPages = topPagesResponse.rows?.map(row => ({
      path: row.dimensionValues[0].value,
      views: parseInt(row.metricValues[0].value),
      uniqueViews: parseInt(row.metricValues[1].value),
    })) || [];

    // Process device breakdown
    let totalDeviceUsers = 0;
    const deviceData = { desktop: 0, mobile: 0, tablet: 0 };

    devicesResponse.rows?.forEach(row => {
      const users = parseInt(row.metricValues[0].value);
      totalDeviceUsers += users;
      const device = row.dimensionValues[0].value.toLowerCase();
      if (deviceData.hasOwnProperty(device)) {
        deviceData[device] = users;
      }
    });

    // Convert to percentages
    const devices = {
      desktop: totalDeviceUsers > 0 ? Math.round((deviceData.desktop / totalDeviceUsers) * 100) : 0,
      mobile: totalDeviceUsers > 0 ? Math.round((deviceData.mobile / totalDeviceUsers) * 100) : 0,
      tablet: totalDeviceUsers > 0 ? Math.round((deviceData.tablet / totalDeviceUsers) * 100) : 0,
    };

    // Process locations
    const locations = locationsResponse.rows?.map(row => ({
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
  } catch (error) {
    console.error('Error fetching analytics:', error);
    throw error;
  }
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}m ${secs}s`;
}

module.exports = { getAnalyticsData };