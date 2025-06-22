const logger = require('../utils/logger');

module.exports = function(wss) {
  wss.on('connection', (ws) => {
    logger.info('New WebSocket client connected');
    
    ws.on('close', () => {
      logger.info('WebSocket client disconnected');
    });
    
    ws.on('error', (error) => {
      logger.error(`WebSocket error: ${error}`);
    });
  });
  
  return wss;
};