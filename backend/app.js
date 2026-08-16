import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import userRoutes from "./routes/userRoutes.js";
import eventRoutes from "./routes/eventRoutes.js";
import adminEventRoutes from "./routes/adminEventRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import inviteRoutes from "./routes/inviteRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import { authMiddleware } from "./middleware/auth.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import ticketRoutes from "./routes/ticketRoutes.js";
import ticketTypeRoutes from "./routes/ticketTypeRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import cronRoutes from "./routes/cronRoutes.js";
import footerRoutes from "./routes/footerRoutes.js";
import adminFooterRoutes from "./routes/adminFooterRoutes.js";
import footerColumnRoutes from "./routes/footerColumnRoutes.js";
import adminFooterColumnRoutes from "./routes/adminFooterColumnRoutes.js";
import couponRoutes from "./routes/couponRoutes.js";
import adminCouponRoutes from "./routes/adminCouponRoutes.js";

dotenv.config();
const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : [];

const rawBodySaver = (req, res, buf) => {
  if (buf && buf.length) {
    req.rawBody = buf.toString("utf8");
  }
};

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server / Postman / curl
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.error("Blocked by CORS:", origin);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));


app.use(helmet());
app.use(morgan("dev"));

app.use(cookieParser());
app.use(
  "/api/payments/hitpay/webhook",
  express.raw({
    type: ["application/json", "application/x-www-form-urlencoded", "*/*"],
    limit: "1mb",
  }),
  (req, res, next) => {
    if (Buffer.isBuffer(req.body)) {
      req.rawBody = req.body.toString("utf8");
      const contentType = req.headers["content-type"] || "";

      try {
        if (contentType.includes("application/json")) {
          req.body = req.rawBody ? JSON.parse(req.rawBody) : {};
        } else if (contentType.includes("application/x-www-form-urlencoded")) {
          req.body = Object.fromEntries(new URLSearchParams(req.rawBody));
        } else {
          try {
            req.body = req.rawBody ? JSON.parse(req.rawBody) : {};
          } catch {
            try {
              req.body = Object.fromEntries(new URLSearchParams(req.rawBody));
            } catch {
              req.body = {};
            }
          }
        }
      } catch (err) {
        console.error("Webhook body parsing error:", err);
        req.body = {};
      }
    }
    next();
  }
);
app.use(express.json({ verify: rawBodySaver }));
app.use(express.urlencoded({ extended: false, verify: rawBodySaver }));

app.use("/api/events", eventRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/ticket-types", ticketTypeRoutes);
app.use("/api", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/invite", inviteRoutes);
app.use("/api", analyticsRoutes);
app.use("/api", userRoutes);
app.use("/api/admin/events", authMiddleware, adminEventRoutes);
app.use("/api/footer-links", footerRoutes);
app.use("/api/admin/footer-links", authMiddleware, adminFooterRoutes);
app.use("/api/footer-columns", footerColumnRoutes);
app.use("/api/admin/footer-columns", authMiddleware, adminFooterColumnRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/admin/coupons", authMiddleware, adminCouponRoutes);
app.use("/api/cron", cronRoutes);

export default app;
