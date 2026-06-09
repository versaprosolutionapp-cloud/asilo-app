const https = require('https');

const handler = function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end('Method not allowed');
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    const parsed = JSON.parse(body);
    const data = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 5000,
      messages: parsed.messages
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const apiReq = https.request(options, apiRes => {
      let result = '';
      apiRes.on('data', chunk => { result += chunk; });
      apiRes.on('end', () => {
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(result);
      });
    });

    apiReq.on('error', err => {
      res.writeHead(500);
      res.end(JSON.stringify({error: err.message}));
    });

    apiReq.write(data);
    apiReq.end();
  });
};

const http = require('http');
const server = http.createServer(handler);
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server running on port ' + PORT));
