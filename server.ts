import express from 'express';
import { createServer as createViteServer } from 'vite';
import { addAccount, getAccounts, removeAccount, getAccountByFakeId } from './src/lib/db';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// API Routes
app.get('/api/accounts', (req, res) => {
  try {
    const accounts = getAccounts();
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

app.post('/api/accounts', (req, res) => {
  const { name, fakeid } = req.body;
  if (!name || !fakeid) {
    return res.status(400).json({ error: 'Name and fakeid are required' });
  }
  try {
    const existing = getAccountByFakeId(fakeid);
    if (existing) {
      return res.status(409).json({ error: 'Account already exists' });
    }
    addAccount(name, fakeid);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add account' });
  }
});

app.delete('/api/accounts/:id', (req, res) => {
  try {
    removeAccount(Number(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Proxy for MPText API to avoid CORS and hide keys if we wanted (though keys are client provided for now)
app.post('/api/proxy/mptext', async (req, res) => {
  const { url, method = 'GET', headers = {}, params = {} } = req.body;
  
  console.log(`[Proxy] Requesting: ${url} with params:`, params);

  try {
    const queryString = new URLSearchParams(params).toString();
    const fullUrl = queryString ? `${url}?${queryString}` : url;

    const response = await fetch(fullUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    });

    console.log(`[Proxy] Response status: ${response.status}`);
    
    const data = await response.json();
    console.log('[Proxy] Response data:', JSON.stringify(data, null, 2));
    
    if (!response.ok) {
      console.error('[Proxy] Upstream error:', data);
    }

    res.status(response.status).json(data);
  } catch (error) {
    console.error('[Proxy] Server error:', error);
    res.status(500).json({ error: 'Proxy request failed', details: String(error) });
  }
});

// Proxy for downloading HTML content (text response)
app.post('/api/proxy/download', async (req, res) => {
  const { url, headers = {} } = req.body;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...headers,
      },
    });

    const text = await response.text();
    res.send(text);
  } catch (error) {
    console.error('Download proxy error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});


async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve static files from dist
    app.use(express.static(path.resolve(__dirname, 'dist')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
