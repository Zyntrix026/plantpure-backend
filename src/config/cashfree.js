const cashfreeConfig = {
  env: process.env.CASHFREE_ENV || "SANDBOX", // 'SANDBOX' ya 'PRODUCTION'
  appId: process.env.CASHFREE_APP_ID,
  secretKey: process.env.CASHFREE_SECRET_KEY,
  version: "2023-08-01", // Latest stable API version
};

export default cashfreeConfig;
