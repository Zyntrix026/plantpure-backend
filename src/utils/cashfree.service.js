import axios from 'axios';
import config from '../config/cashfree.js';

class CashfreeService {
  constructor() {
    this.baseUrl = config.env === 'PRODUCTION'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';
  }

  get headers() {
    return {
      'x-client-id': config.appId,
      'x-client-secret': config.secretKey,
      'x-api-version': config.version,
      'Content-Type': 'application/json',
    };
  }

  async createOrder(orderData) {
    try {
      const orderId = orderData.orderId || `CF_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
      const payload = {
        order_amount: parseFloat(orderData.amount.toFixed(2)),
        order_currency: 'INR',
        order_id: orderId,
        customer_details: {
          customer_id: orderData.userId,
          customer_name: orderData.customerName,
          customer_email: orderData.customerEmail,
          customer_phone: orderData.customerPhone,
        },
        order_meta: {
          return_url: orderData.redirectUrl,
          ...(orderData.webhookUrl && { notify_url: orderData.webhookUrl }),
        },
        ...(orderData.orderTags && { order_tags: orderData.orderTags }),
      };

      const response = await axios.post(`${this.baseUrl}/orders`, payload, { headers: this.headers });
      return response.data;
    } catch (error) {
      throw new Error(`Cashfree Order Creation Failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async getOrderDetails(cfOrderId) {
    try {
      const response = await axios.get(`${this.baseUrl}/orders/${cfOrderId}`, { headers: this.headers });
      return response.data;
    } catch (error) {
      throw new Error(`Cashfree Fetch Order Failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async createRefund(cfOrderId, amount, refundNote = '') {
    try {
      const payload = {
        refund_amount: parseFloat(amount.toFixed(2)),
        refund_id: `REFUND_${cfOrderId}_${Date.now()}`,
        refund_note: refundNote || 'Requested by customer',
      };
      const response = await axios.post(`${this.baseUrl}/orders/${cfOrderId}/refunds`, payload, { headers: this.headers });
      return response.data;
    } catch (error) {
      throw new Error(`Cashfree Refund Failed: ${error.response?.data?.message || error.message}`);
    }
  }
}

export default new CashfreeService();
