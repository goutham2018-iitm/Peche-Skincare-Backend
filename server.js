// backend/server.js
require("dotenv").config();
const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.get("/", (req, res) => {
  res.send("🔥 Razorpay backend is running!");
});

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:8080', 
  'https://pechepurpose.co',
  'https://www.pechepurpose.co',
  'https://pechepurpose.vercel.app' 
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(bodyParser.json());

// Razorpay keys from .env
const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

// Admin credentials
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const razorpay = new Razorpay({
  key_id: KEY_ID,
  key_secret: KEY_SECRET,
});

// Email transporter setup
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Store OTPs temporarily (in production, use Redis)
const otpStore = new Map();

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  
  if (!token) {
    return res.status(401).json({ success: false, message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

// ---------------- ADMIN LOGIN (Step 1: Verify Credentials) ----------------
app.post("/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password required" });
    }

    // Verify credentials
    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP with expiry (5 minutes)
    otpStore.set(email, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    // Send OTP via email
    await transporter.sendMail({
      from: `"Pêche Admin" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Your Admin Login OTP",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563EB;">Admin Login Verification</h2>
          <p>Your OTP for admin login is:</p>
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <h1 style="color: #2563EB; margin: 0; letter-spacing: 8px;">${otp}</h1>
          </div>
          <p style="color: #6b7280;">This OTP will expire in 5 minutes.</p>
          <p style="color: #6b7280; font-size: 12px;">If you didn't request this, please ignore this email.</p>
        </div>
      `,
    });

    console.log(`✅ OTP sent to ${email}: ${otp}`);

    res.json({ success: true, message: "OTP sent to your email" });
  } catch (err) {
    console.error("Error sending OTP:", err);
    res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
});

// ---------------- ADMIN LOGIN (Step 2: Verify OTP) ----------------
app.post("/admin/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "Email and OTP required" });
    }

    const storedData = otpStore.get(email);

    if (!storedData) {
      return res.status(401).json({ success: false, message: "OTP not found or expired" });
    }

    if (Date.now() > storedData.expiresAt) {
      otpStore.delete(email);
      return res.status(401).json({ success: false, message: "OTP expired" });
    }

    if (storedData.otp !== otp) {
      return res.status(401).json({ success: false, message: "Invalid OTP" });
    }

    // OTP verified, delete it
    otpStore.delete(email);

    // Generate JWT token
    const token = jwt.sign(
      { email, role: "admin" },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      admin: { email },
    });
  } catch (err) {
    console.error("Error verifying OTP:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ---------------- GET ALL PAYMENTS (Protected) ----------------
app.get("/admin/payments", verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ success: true, payments: data });
  } catch (err) {
    console.error("Error fetching payments:", err);
    res.status(500).json({ success: false, message: "Error fetching payments" });
  }
});

// ---------------- GET PAYMENT STATISTICS (Protected) ----------------
app.get("/admin/stats", verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("payments")
      .select("amount, status, created_at");

    if (error) throw error;

    const totalPayments = data.length;
    const totalRevenue = data.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
    const successfulPayments = data.filter(p => p.status === "captured").length;

    // Group by date for chart
    const paymentsByDate = {};
    data.forEach(payment => {
      const date = new Date(payment.created_at).toLocaleDateString();
      paymentsByDate[date] = (paymentsByDate[date] || 0) + parseFloat(payment.amount);
    });

    res.json({
      success: true,
      stats: {
        totalPayments,
        totalRevenue: totalRevenue.toFixed(2),
        successfulPayments,
        successRate: ((successfulPayments / totalPayments) * 100).toFixed(2),
        paymentsByDate,
      },
    });
  } catch (err) {
    console.error("Error fetching stats:", err);
    res.status(500).json({ success: false, message: "Error fetching statistics" });
  }
});

// ---------------- CREATE ORDER ----------------
app.post("/create-order", async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount) return res.status(400).json({ error: "Amount is required" });

    const options = {
      amount: Math.round(Number(amount) * 100), // convert to paise
      currency: "INR",
      receipt: "receipt_" + Date.now(),
      payment_capture: 1,
    };

    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (err) {
    console.error("Error creating order:", err);
    res.status(500).send("Error creating order");
  }
});

// ---------------- VERIFY PAYMENT ----------------
app.post("/verify-payment", async (req, res) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature, 
      productName,
      email,
      phone 
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: "Missing payment parameters" });
    }

    // Verify signature
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto.createHmac("sha256", KEY_SECRET).update(sign).digest("hex");

    if (razorpay_signature !== expectedSign) {
      return res.status(400).json({ success: false, message: "Payment verification failed" });
    }

    // Fetch payment details from Razorpay
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    const { method, amount, status, created_at } = payment;

    // Use email and phone from frontend (more reliable)
    const userEmail = email || payment.email || null;
    const userPhone = phone || payment.contact || null;

    console.log("✅ Payment verified. Status:", status);
    console.log({ 
      email: userEmail, 
      phone: userPhone, 
      productName, 
      paymentId: razorpay_payment_id,
      status: status
    });

    // Save payment data to Supabase
    const { data, error } = await supabase
      .from("payments")
      .insert([
        {
          payment_id: razorpay_payment_id,
          order_id: razorpay_order_id,
          email: userEmail,
          phone: userPhone,
          product_name: productName,
          amount: amount / 100, // Convert paise to rupees
          currency: "INR",
          payment_method: method,
          status: status, // This will be: captured, failed, authorized, refunded, etc.
          payment_date: new Date(created_at * 1000).toISOString(),
          razorpay_signature: razorpay_signature,
        },
      ])
      .select();

    if (error) {
      console.error("❌ Supabase error:", error);
      return res.status(500).json({ 
        success: false, 
        message: "Payment verified but failed to save to database",
        error: error.message 
      });
    }

    console.log("✅ Payment data saved to Supabase:", data);

    res.json({ 
      success: true, 
      message: "Payment verified and user info saved.",
      data: data[0]
    });
  } catch (err) {
    console.error("Error verifying payment:", err);
    res.status(500).json({ success: false, message: "Server error during verification" });
  }
});

// ---------------- HANDLE PAYMENT FAILURE ----------------
app.post("/payment-failed", async (req, res) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      error_code,
      error_description,
      productName,
      email,
      phone 
    } = req.body;

    console.log("❌ Payment failed:", error_description);

    // Try to fetch payment details from Razorpay if payment_id exists
    let amount = 0;
    let method = "unknown";
    
    if (razorpay_payment_id) {
      try {
        const payment = await razorpay.payments.fetch(razorpay_payment_id);
        amount = payment.amount / 100;
        method = payment.method || "unknown";
      } catch (err) {
        console.log("Could not fetch payment details:", err.message);
      }
    }

    // Save failed payment to Supabase
    const { data, error } = await supabase
      .from("payments")
      .insert([
        {
          payment_id: razorpay_payment_id || `failed_${Date.now()}`,
          order_id: razorpay_order_id,
          email: email || null,
          phone: phone || null,
          product_name: productName,
          amount: amount,
          currency: "INR",
          payment_method: method,
          status: "failed",
          payment_date: new Date().toISOString(),
          razorpay_signature: error_code || error_description,
        },
      ])
      .select();

    if (error) {
      console.error("❌ Supabase error:", error);
    }

    res.json({ 
      success: true, 
      message: "Failed payment recorded"
    });
  } catch (err) {
    console.error("Error recording failed payment:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ---------------- GET PAYMENT HISTORY (Optional) ----------------
app.get("/payments", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ success: true, payments: data });
  } catch (err) {
    console.error("Error fetching payments:", err);
    res.status(500).json({ success: false, message: "Error fetching payments" });
  }
});

// ---------------- GET PAYMENT BY ID (Optional) ----------------
app.get("/payment/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("payment_id", id)
      .single();

    if (error) throw error;

    res.json({ success: true, payment: data });
  } catch (err) {
    console.error("Error fetching payment:", err);
    res.status(500).json({ success: false, message: "Payment not found" });
  }
});

// ---------------- START SERVER ----------------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ Backend running at http://localhost:${PORT}`));