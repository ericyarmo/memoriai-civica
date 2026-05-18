// Worker entry point: serves viewer UI + API routes.

import { HTML } from './viewer';
import { chat } from './gemini';
import { getLastCrystal } from './tools';
import { decryptCrystal, type Role } from './crystal';

interface Env {
  GEMINI_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    // Static viewer
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // Chat API
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      return handleChat(request, env);
    }

    // Crystal decrypt API
    if (url.pathname === '/api/crystal/decrypt' && request.method === 'POST') {
      return handleDecrypt(request);
    }

    // Favicon
    if (url.pathname === '/favicon.ico') {
      return new Response(null, { status: 204 });
    }

    return new Response('Not found', { status: 404 });
  },
};

async function handleChat(request: Request, env: Env): Promise<Response> {
  try {
    const { messages } = await request.json() as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    };

    if (!env.GEMINI_API_KEY) {
      return json({ error: 'GEMINI_API_KEY not configured' }, 500);
    }

    const reply = await chat(messages, env.GEMINI_API_KEY);

    // Check if a crystal was built during this chat turn
    const crystal = getLastCrystal();

    return json({ reply, crystal });
  } catch (err) {
    console.error('Chat error:', err);
    return json({ error: String(err) }, 500);
  }
}

async function handleDecrypt(request: Request): Promise<Response> {
  try {
    const { role, memBytesB64 } = await request.json() as {
      role: Role;
      memBytesB64: string;
    };

    if (!memBytesB64) {
      return json({ error: 'No crystal data provided' }, 400);
    }

    if (!['public', 'planner', 'researcher'].includes(role)) {
      return json({ error: 'Invalid role' }, 400);
    }

    const frames = decryptCrystal(memBytesB64, role);
    return json({ frames, role });
  } catch (err) {
    console.error('Decrypt error:', err);
    return json({ error: String(err) }, 500);
  }
}

function json(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
