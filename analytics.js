// analytics.js - Google Analytics Integration
require("dotenv").config();
const { BetaAnalyticsDataClient } = require("@google-analytics/data");

// Check if we have the required environment variables
function isAnalyticsConfigured() {
  const required = ['GOOGLE_CLIENT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'VITE_GA_MEASUREMENT_ID'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.log('❌ Missing GA environment variables:', missing);
    return false;
  }
  
  // Check if private key is properly formatted
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!privateKey || !privateKey.includes('BEGIN PRIVATE KEY')) {
    console.log('❌ Google private key appears to be malformed');
    return false;
  }
  
  console.log('✅ Google Analytics environment variables are present');
  return true;
}

let analyticsDataClient = null;
let isConfigured = false;

// Initialize the client only if configuration is valid
try {
  if (isAnalyticsConfigured()) {
    const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
    
    analyticsDataClient = new BetaAnalyticsDataClient({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: privateKey,
      },
      projectId: process.env.GOOGLE_PROJECT_ID, // Optional but helpful
    });
    
    isConfigured = true;
    console.log('✅ Google Analytics client initialized successfully');
  } else {
    console.log('⚠️ Google Analytics not configured - using mock data');
  }
} catch (error) {
  console.error('❌ Failed to initialize Google Analytics client:', error.message);
  isConfigured = false;
}

const PROPERTY_ID = process.env.VITE_GA_MEASUREMENT_ID;

async function getAnalyticsData() {
  console.log('🔄 Fetching analytics data...');
  console.log('📊 Configuration status:', isConfigured ? 'Connected to GA' : 'Using mock data');
  
  // If not configured or client failed, return mock data
  if (!isConfigured || !analyticsDataClient) {
    console.log('📊 Returning mock analytics data');
    return getMockAnalyticsData();
  }

  try {
    console.log(`🔗 Connecting to GA property: ${PROPERTY_ID}`);
    
    // Test the connection with a simple request first
    const testResponse = await analyticsDataClient.runReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      metrics: [{ name: 'activeUsers' }],
    });
    
    console.log('✅ Successfully connected to Google Analytics');

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

    // Process all data
    const processedData = processAnalyticsResponses({
      usersResponse,
      sessionsResponse,
      pageviewsResponse,
      topPagesResponse,
      devicesResponse,
      locationsResponse
    });

    console.log('✅ Real analytics data processed successfully');
    return {
      ...processedData,
      source: 'google_analytics',
      dataStatus: 'live'
    };

  } catch (error) {
    console.error('❌ Error fetching from Google Analytics:', error.message);
    
    // Check for specific common errors
    if (error.message.includes('PERMISSION_DENIED')) {
      console.error('🔐 Permission denied - check service account permissions');
    } else if (error.message.includes('not found')) {
      console.error('🔍 Property not found - check measurement ID');
    } else if (error.message.includes('UNAUTHENTICATED')) {
      console.error('🔐 Authentication failed - check credentials');
    }
    
    console.log('📊 Falling back to mock data due to error');
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
    locationsResponse
  } = responses;

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
    source: 'mock_data',
    dataStatus: 'demo'
  };
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}m ${secs}s`;
}

module.exports = { getAnalyticsData, isAnalyticsConfigured };