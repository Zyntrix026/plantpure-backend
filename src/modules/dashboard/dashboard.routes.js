import express from "express";
import { getDashboardStats } from "./dashboard.controller.js";
import { adminOnly } from "../../middleware/role.middleware.js";

const router = express.Router();

router.get("/stats", adminOnly, getDashboardStats);

export default router;
