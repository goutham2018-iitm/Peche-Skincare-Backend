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
const fetch = require("node-fetch"); // v2 works with require

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

// PDF download link from Supabase Storage
const PDF_DOWNLOAD_LINK = process.env.PDF_DOWNLOAD_LINK || "https://ktqussafddgyklyspars.supabase.co/storage/v1/object/sign/PDF/The%20Ultimate%20Bare%20Skin%20Confidence%20Blueprint%20(1).pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9mZWZiZWFlOS1mMTU4LTQ4NTUtOTYxOS1kYTg2Nzc2OTg4ZDQiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJQREYvVGhlIFVsdGltYXRlIEJhcmUgU2tpbiBDb25maWRlbmNlIEJsdWVwcmludCAoMSkucGRmIiwiaWF0IjoxNzYwMTY4Mzk1LCJleHAiOjIwNzU1MjgzOTV9.L9ckA4Q124XR4Ik5IYMLV1ITqupUBa8Ox7njb0Geh-U";

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const razorpay = new Razorpay({
  key_id: KEY_ID,
  key_secret: KEY_SECRET,
});

// Admin email transporter setup (for OTP and admin notifications)
const adminTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// PDF email transporter setup (for customer purchase confirmations)
const pdfTransporter = nodemailer.createTransport({
  host: process.env.PDF_SMTP_HOST,
  port: process.env.PDF_SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.PDF_SMTP_USER,
    pass: process.env.PDF_SMTP_PASS,
  },
});

// Function to send e-book email with download link
async function sendEbookEmail(name, email, productName) {
  try {
    const mailOptions = {
      from: `"Pêche" <${process.env.PDF_SMTP_USER}>`,
      to: email,
      subject: "Your E-Book Purchase from Pêche",
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background: linear-gradient(135deg, #D48265 0%, #B86F56 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Pêche</h1>
            <p style="color: #FFF5F0; margin: 10px 0 0 0; font-size: 16px;">Thank you for your purchase!</p>
          </div>
          
          <div style="background: white; padding: 40px 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <p style="font-size: 18px; color: #333; margin-bottom: 20px;">Dear ${name},</p>
            
            <p style="font-size: 16px; color: #555; line-height: 1.6; margin-bottom: 20px;">
              Thank you for your purchase from <strong>Pêche</strong>! We're delighted to share your exclusive <strong>34-page e-book</strong> with you.
            </p>
            
            <div style="background: linear-gradient(135deg, #FFF5F0 0%, #FFE8DC 100%); padding: 25px; border-radius: 12px; border-left: 4px solid #D48265; margin: 30px 0; text-align: center;">
              <p style="margin: 0 0 20px 0; color: #5D3A29; font-size: 16px; font-weight: 600;">
                📚 Your E-Book is Ready!
              </p>
              <a href="${PDF_DOWNLOAD_LINK}" 
                 style="display: inline-block; background: linear-gradient(135deg, #D48265 0%, #B86F56 100%); color: white; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(212, 130, 101, 0.3); transition: transform 0.2s;">
                📥 Download Your E-Book
              </a>
              <p style="margin: 15px 0 0 0; color: #888; font-size: 12px;">
                Click the button above to download your PDF
              </p>
            </div>
            
            <p style="font-size: 16px; color: #555; line-height: 1.6; margin-bottom: 15px;">
              As per your order, the e-book has been delivered to the registered email address you provided during the checkout process: <strong style="color: #D48265;">${email}</strong>
            </p>
            
            <div style="background: #F0F9FF; border-left: 4px solid #3B82F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #1E40AF; font-size: 14px; line-height: 1.6;">
                <strong>💡 Pro Tip:</strong> Save the download link for future access. You can download the e-book multiple times!
              </p>
            </div>
            
            <p style="font-size: 16px; color: #555; line-height: 1.6; margin-bottom: 15px;">
              If you experience any issues accessing your e-book, feel free to reply to this email or contact our support team at <a href="mailto:peche.purpose@gmail.com" style="color: #D48265; text-decoration: none; font-weight: 600;">peche.purpose@gmail.com</a>
            </p>
            
            <p style="font-size: 16px; color: #555; line-height: 1.6; margin-bottom: 30px;">
              We hope you enjoy reading and find it valuable. Thank you for choosing Pêche for your cosmetic needs! 💫
            </p>
            
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
            
            <div style="text-align: left;">
              <p style="font-size: 16px; color: #333; margin-bottom: 5px;">Warm regards,</p>
              <p style="font-size: 18px; color: #D48265; font-weight: 600; margin: 5px 0;">Eqa Fakhri</p>
              <p style="font-size: 14px; color: #888; margin: 5px 0;">CEO</p>
              <p style="font-size: 14px; color: #888; margin: 5px 0;">
                <a href="https://pechepurpose.co" style="color: #D48265; text-decoration: none;">pechepurpose.co</a>
              </p>
            </div>
          </div>
          
          <div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">
            <p style="margin: 5px 0;">© 2025 Pêche. All rights reserved.</p>
            <p style="margin: 5px 0;">This email was sent to ${email} because you made a purchase on our website.</p>
          </div>
        </div>
      `
    };

    const info = await pdfTransporter.sendMail(mailOptions);
    console.log(`✅ E-book email sent to ${email}:`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Error sending e-book email:", error);
    throw error;
  }
}

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

    // Send OTP via email using admin transporter
    await adminTransporter.sendMail({
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
      name,
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

    // Use customer details from frontend
    const customerName = name || "Customer";
    const userEmail = email || payment.email || null;
    const userPhone = phone || payment.contact || null;

    console.log("✅ Payment verified. Status:", status);
    console.log({ 
      name: customerName,
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
          name: customerName,
          email: userEmail,
          phone: userPhone,
          product_name: productName,
          amount: amount / 100, // Convert paise to rupees
          currency: "INR",
          payment_method: method,
          status: status,
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

    // Send e-book email only if payment is successful (captured)
    if (status === "captured" && userEmail) {
      try {
        await sendEbookEmail(customerName, userEmail, productName);
        console.log(`✅ E-book sent successfully to ${userEmail}`);
      } catch (emailError) {
        console.error("❌ Failed to send e-book email:", emailError);
        // Don't fail the payment verification if email fails
        // You might want to log this for manual follow-up
      }
    }

    res.json({ 
      success: true, 
      message: "Payment verified and e-book sent to your email.",
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
      name,
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
          name: name || null,
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

// ---------------- SUBSCRIBE TO NEWSLETTER ----------------
app.post("/subscribe", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: "Invalid email address" });
    }

    // Check if already subscribed
    const { data: existing, error: fetchError } = await supabase
      .from("subscriptions")
      .select("email")
      .eq("email", email)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (existing) {
      return res.status(409).json({ success: false, message: "Email already subscribed" });
    }

    // Insert into Supabase
    const { data, error } = await supabase
      .from("subscriptions")
      .insert([{ email }])
      .select();

    if (error) throw error;

    console.log(`✅ New subscriber: ${email}`);

    res.json({
      success: true,
      message: "Thank you for subscribing!",
      data: data[0],
    });
  } catch (err) {
    console.error("❌ Subscription error:", err);
    res.status(500).json({ success: false, message: "Failed to subscribe" });
  }
});
// // ---------------- FETCH VERCEL ANALYTICS (Protected) ----------------
// // server.js or wherever your routes are defined

// // const app = express();
// app.get("/admin/vercel-analytics", async (req, res) => {
//   try {
//     const projectId = process.env.VERCEL_PROJECT_ID;
//     const token = process.env.VERCEL_API_TOKEN;

//     // Check if env variables are set
//     if (!projectId || !token) {
//       return res.status(500).json({
//         success: false,
//         message: "Vercel project ID or API token not set in environment",
//         analytics: null, // always include analytics key for frontend safety
//       });
//     }

//     // Call Vercel Analytics Overview API
//     const response = await fetch(
//       `https://api.vercel.com/v1/analytics/${projectId}/overview`,
//       {
//         headers: {
//           Authorization: `Bearer ${token}`,
//         },
//       }
//     );

//     const data = await response.json();

//     if (!response.ok) {
//       return res.status(response.status).json({
//         success: false,
//         message: data.error?.message || "Failed to fetch Vercel Analytics",
//         analytics: null,
//       });
//     }

//     // Success
//     res.json({ success: true, analytics: data });
//   } catch (err) {
//     console.error("Error fetching Vercel Analytics:", err);
//     res.status(500).json({
//       success: false,
//       message: "Internal server error while fetching analytics",
//       analytics: null,
//     });
//   }
// });





// ---------------- START SERVER ----------------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ Backend running at http://localhost:${PORT}`));