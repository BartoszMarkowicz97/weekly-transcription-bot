const express = require('express');
const path = require('path');

const app = express();

app.use(express.json());

// Meeting endpoints
app.post('/api/meeting/start', require('./api/meeting_start'));
app.post('/api/meeting/stop', require('./api/meeting_stop'));
app.get('/api/meeting/list', require('./api/meeting_list'));
app.delete('/api/meeting/:name', require('./api/meeting_delete'));
app.get('/api/meeting/:name/send', require('./api/meeting_send'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.API_PORT || 3000;
app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});

module.exports = app;
