import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'

const generateVersion = () => ({
  name: 'generate-version',
  writeBundle() {
    fs.writeFileSync('./dist/version.json', JSON.stringify({ version: Date.now() }));
  }
});

const apiMiddleware = () => ({
  name: 'api-middleware',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url.startsWith('/api')) {
        try {
          const urlObj = new URL(req.url, `http://${req.headers.host}`);
          const pathname = urlObj.pathname;
          const modulePath = `.${pathname}.js`;
          
          // Use Vite's ssrLoadModule to dynamically import the API file and support HMR
          const module = await server.ssrLoadModule(modulePath);
          const handler = module.default;
          
          // Parse JSON body
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            let body = '';
            req.on('data', chunk => body += chunk);
            await new Promise(resolve => req.on('end', () => {
              if (body) {
                try { req.body = JSON.parse(body); } catch(e) {}
              }
              resolve();
            }));
          }
          
          // Parse query parameters
          req.query = Object.fromEntries(urlObj.searchParams);
          
          // Polyfill res.status and res.json for Vercel-like API
          res.status = (code) => {
            res.statusCode = code;
            return res;
          };
          res.json = (data) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
          };

          await handler(req, res);
        } catch (e) {
          console.error("API Error in Vite Middleware:", e);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: e.message }));
        }
      } else {
        next();
      }
    });
  }
});

export default defineConfig(({ mode }) => {
  // Load env variables into process.env so /api endpoints can access them
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  
  // Read version cleanly from package.json
  const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
  const version = `v${pkg.version}`;
  
  return {
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
    plugins: [react(), tailwindcss(), apiMiddleware(), generateVersion()],
  }
})
