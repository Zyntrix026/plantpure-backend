import { Order } from "../orders/order.model.js";
import { Product } from "../products/product.model.js";
import { Review } from "../reviews/review.model.js";
import User from "../users/user.model.js";
import { Category } from "../categories/category.model.js";

export const getDashboardStats = async (req, res) => {
  try {
    const now = new Date();

    // Today's date range (midnight to now)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    // This month's date range
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [
      totalOrders,
      totalProducts,
      totalCategories,
      totalCustomers,
      totalAdmins,
      pendingOrders,
      deliveredOrders,
      cancelledOrders,
      confirmedOrders,
      shippedOrders,
      outOfStockProducts,
      totalReviews,
      activeReviews,

      // Revenue aggregations
      totalRevenueAgg,
      todayRevenueAgg,
      monthRevenueAgg,

      // Today's orders count
      todayOrders,

      // Top selling products
      topSellingAgg,

      // Recent orders
      recentOrders,

      // Orders by status over last 7 days
      weeklyOrdersAgg,

      // Monthly revenue for last 6 months
      last6MonthsRevenueAgg,
    ] = await Promise.all([
      // Counts
      Order.countDocuments(),
      Product.countDocuments(),
      Category.countDocuments(),
      User.countDocuments({ role: "customer" }),
      User.countDocuments({ role: "admin" }),
      Order.countDocuments({ orderStatus: "pending" }),
      Order.countDocuments({ orderStatus: "delivered" }),
      Order.countDocuments({ orderStatus: "cancelled" }),
      Order.countDocuments({ orderStatus: "confirmed" }),
      Order.countDocuments({ orderStatus: "shipped" }),
      Product.countDocuments({ stock: 0, hasVariants: false }),
      Review.countDocuments(),
      Review.countDocuments({ isActive: true }),

      // Total revenue (paid orders only)
      Order.aggregate([
        { $match: { paymentStatus: "paid" } },
        { $group: { _id: null, total: { $sum: "$totalPrice" } } },
      ]),

      // Today's revenue
      Order.aggregate([
        { $match: { paymentStatus: "paid", createdAt: { $gte: todayStart, $lt: todayEnd } } },
        { $group: { _id: null, total: { $sum: "$totalPrice" } } },
      ]),

      // This month's revenue
      Order.aggregate([
        { $match: { paymentStatus: "paid", createdAt: { $gte: monthStart, $lt: monthEnd } } },
        { $group: { _id: null, total: { $sum: "$totalPrice" } } },
      ]),

      // Today's orders count
      Order.countDocuments({ createdAt: { $gte: todayStart, $lt: todayEnd } }),

      // Top 5 selling products by quantity
      Order.aggregate([
        { $match: { paymentStatus: "paid" } },
        { $unwind: "$orderItems" },
        {
          $group: {
            _id: "$orderItems.productId",
            name: { $first: "$orderItems.name" },
            image: { $first: "$orderItems.image" },
            totalSold: { $sum: "$orderItems.quantity" },
            totalRevenue: { $sum: { $multiply: ["$orderItems.quantity", "$orderItems.priceAtPurchase"] } },
          },
        },
        { $sort: { totalSold: -1 } },
        { $limit: 5 },
      ]),

      // Last 5 recent orders
      Order.find()
        .select("orderNumber orderStatus paymentStatus totalPrice createdAt shippingAddress.fullName")
        .sort("-createdAt")
        .limit(5)
        .lean(),

      // Orders per day for last 7 days
      Order.aggregate([
        { $match: { createdAt: { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
            revenue: { $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$totalPrice", 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Monthly revenue for last 6 months
      Order.aggregate([
        { $match: { paymentStatus: "paid", createdAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } } },
        {
          $group: {
            _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
            revenue: { $sum: "$totalPrice" },
            orders: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        // ── Core Counts ──────────────────────────────────────────
        totalOrders,
        totalProducts,
        totalCategories,
        totalCustomers,
        totalAdmins,
        totalReviews,
        activeReviews,
        outOfStockProducts,

        // ── Order Status Breakdown ───────────────────────────────
        orderStatus: {
          pending: pendingOrders,
          confirmed: confirmedOrders,
          shipped: shippedOrders,
          delivered: deliveredOrders,
          cancelled: cancelledOrders,
        },

        // ── Revenue ──────────────────────────────────────────────
        totalRevenue: totalRevenueAgg[0]?.total || 0,
        todayRevenue: todayRevenueAgg[0]?.total || 0,
        monthlyRevenue: monthRevenueAgg[0]?.total || 0,

        // ── Today ────────────────────────────────────────────────
        todayOrders,

        // ── Charts / Lists ───────────────────────────────────────
        topSellingProducts: topSellingAgg,
        recentOrders,
        weeklyOrders: weeklyOrdersAgg,
        last6MonthsRevenue: last6MonthsRevenueAgg,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
