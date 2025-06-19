const express = require('express');

const app = express();
const PORT = 3007;

console.log('Creating Express app...');

app.get('/test', (req, res) => {
  res.json({ message: 'Test successful' });
});

console.log('Route defined...');

app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
}); 