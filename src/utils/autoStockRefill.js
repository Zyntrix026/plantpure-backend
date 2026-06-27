import { Product } from "../modules/products/product.model.js";
import { sendOutOfStockAlertToAdmin } from "./email.service.js";

const AUTO_REFILL_AMOUNT = 20;

export const checkAndRefillStock = async (orderItems) => {
  const refillOperations = [];

  for (const item of orderItems) {
    const product = await Product.findById(item.productId);
    if (!product) continue;

    if (product.hasVariants && item.variantId) {
      // Variant stock check
      const variant = product.variants.id(item.variantId);
      if (variant && variant.stock <= 0) {
        refillOperations.push({
          updateOne: {
            filter: { _id: item.productId, "variants._id": item.variantId },
            update: { $set: { "variants.$.stock": AUTO_REFILL_AMOUNT } },
          },
        });
      }
    } else {
      // Simple product stock check
      if (product.stock <= 0) {
        refillOperations.push({
          updateOne: {
            filter: { _id: item.productId },
            update: { $set: { stock: AUTO_REFILL_AMOUNT } },
          },
        });
      }
    }
  }

  if (refillOperations.length > 0) {
    await Product.bulkWrite(refillOperations);
    console.log(`✅ Auto-refilled stock for ${refillOperations.length} product(s)`);
  }
};


// export const checkAndNotifyStockOut = async (orderItems) => {

//   const zeroStockItems = [];

//   for (const item of orderItems) {
//     const product = await Product.findById(item.productId);
//     if (!product) continue;

//     if (product.hasVariants && item.variantId) {
//       // 1. Variant stock evaluation
//       const variant = product.variants.id(item.variantId);
//       if (variant && variant.stock <= 0) {
//         zeroStockItems.push({
//           productId: product._id,
//           name: product.title,
//           image: product.images?.[0]?.url || null,
//           variantLabel: variant.label || "N/A",
//         });
//       }
//     } else {
//       // 2. Simple product stock evaluation
//       if (product.stock <= 0) {
//         zeroStockItems.push({
//           productId: product._id,
//           name: product.title,
//           image: product.images?.[0]?.url || null,
//           variantLabel: null,
//         });
//       }
//     }
//   }

//   // Agar items out of stock hain, toh admin ko ek single integrated mail trigger hogi
//   if (zeroStockItems.length > 0) {
//     try {
//       await sendOutOfStockAlertToAdmin(zeroStockItems);
//       console.log(`✉️ Stock alert email successfully dispatched to admin for ${zeroStockItems.length} item(s).`);
//     } catch (emailError) {
//       console.error("❌ Failed to broadcast inventory warning email to admin:", emailError);
//     }
//   }
// };


export const checkAndNotifyStockOut = async (orderItems) => {
  const stockAlertItems = [];

  for (const item of orderItems) {
    const product = await Product.findById(item.productId);
    if (!product) continue;

    const orderedQuantity = item.quantity; 

    if (product.hasVariants && item.variantId) {
      const variant = product.variants.id(item.variantId);
      if (!variant) continue;

      const currentStock = variant.stock;
      const previousStock = currentStock + orderedQuantity;

      if (currentStock === 0 || (currentStock <= 5 && previousStock > 5)) {
        const alertType = currentStock === 0 ? "OUT OF STOCK" : "LOW STOCK (5 or less)";
        
        stockAlertItems.push({
          productId: product._id,
          name: `${product.title} (${variant.label || "N/A"})`,
          image: product.images?.[0]?.url || null,
          variantLabel: variant.label || "N/A",
          currentStock: currentStock,
          alertType: alertType 
        });
      }
    } else {
      const currentStock = product.stock;
      const previousStock = currentStock + orderedQuantity;

      if (currentStock === 0 || (currentStock <= 5 && previousStock > 5)) {
        const alertType = currentStock === 0 ? "OUT OF STOCK" : "LOW STOCK (5 or less)";

        stockAlertItems.push({
          productId: product._id,
          name: product.title,
          image: product.images?.[0]?.url || null,
          variantLabel: null,
          currentStock: currentStock,
          alertType: alertType
        });
      }
    }
  }

  if (stockAlertItems.length > 0) {
    try {
      await sendOutOfStockAlertToAdmin(stockAlertItems);
      console.log(`✉️ Stock alert email sent to admin for ${stockAlertItems.length} item(s).`);
    } catch (emailError) {
      console.error("❌ Failed to send inventory warning email to admin:", emailError);
    }
  }
};