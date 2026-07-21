import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import routes from "./routes/index.js";
import { stripeWebhook } from "./modules/payments/payment.controller.js";
import facebookRoutes from './modules/facebook/facebook.routes.js';
import webhookRoutes from "./modules/webhook/webhook.routes.js";
import instagramRoutes from "./modules/instagram/instagram.routes.js";
import respondRoutes from "./modules/instagram/respond.routes.js";
const app = express();

/* =======================
   DB STATE
======================= */
const DB_STATE = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

/* =======================
   CORS CONFIG
======================= */
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://www.plantpure.in",
  "https://plantpure.in",
  "https://admin.plantpure.in",
  "https://www.craftworld.online",
  "https://craftworld.online"
];

const corsOptions = {
  origin: function (origin, callback) {
    // allow Postman / curl / server-to-server
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("CORS not allowed"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

/* =======================
   APPLY CORS
======================= */
app.use(cors(corsOptions));
app.options("/{*path}", cors(corsOptions));

/* =======================
   STRIPE WEBHOOK (before JSON)
======================= */
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

/* =======================
   BODY PARSER
======================= */
app.use((req, res, next) => {
  console.log("➡️", req.method, req.originalUrl);
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =======================
   HEALTH CHECK
======================= */
const getHealthPayload = () => {
  const readyState = mongoose.connection.readyState;

  return {
    success: true,
    message: "API is running",
    database: {
      state: DB_STATE[readyState] ?? "unknown",
      ready: readyState === 1,
    },
    timestamp: new Date().toISOString(),
  };
};


app.use('/api/v1/facebook', facebookRoutes)
app.get("/health", (req, res) => {
  const payload = getHealthPayload();
  res.status(payload.database.ready ? 200 : 503).json(payload);
});

app.get("/api/health", (req, res) => {
  const payload = getHealthPayload();
  res.status(payload.database.ready ? 200 : 503).json(payload);
});

app.use("/webhook", webhookRoutes);
app.use("/api/instagram", instagramRoutes);
app.use("/api/respond", respondRoutes);
/* =======================
   ROOT
======================= */
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "PlantPure API Running",
  });
});

/* =======================
   ROUTES
======================= */
app.use("/api", routes);

/* =======================
   404 HANDLER
======================= */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

/* =======================
   ERROR HANDLER
======================= */
app.use((err, req, res, next) => {
  console.error("Error:", err.message);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

export default app;