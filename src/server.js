import http from 'http';
import app from './app.js';
import connectDB from './config/db.js';
import { PORT } from './config/env.js';
import { initSocket } from './config/socket.js';

const RETRY_DELAY_MS = 10000;

const httpServer = http.createServer(app);
initSocket(httpServer);

const connectWithRetry = async () => {
  try {
    await connectDB();
  } catch (error) {
    console.error(`Database connection unavailable: ${error.message}`);
    console.error(`Retrying database connection in ${RETRY_DELAY_MS / 1000} seconds...`);
    setTimeout(connectWithRetry, RETRY_DELAY_MS);
  }
};

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

connectWithRetry();
