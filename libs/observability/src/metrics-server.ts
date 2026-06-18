import { createServer, type Server } from 'node:http';
import type { Metrics } from './metrics';

/** Lightweight HTTP server exposing Prometheus metrics for worker processes. */
export function startMetricsServer(metrics: Metrics, port: number): Server | null {
  if (port <= 0) return null;

  const server = createServer(async (req, res) => {
    if (req.url !== '/metrics') {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    const exposed = await metrics.expose();
    res.statusCode = 200;
    res.setHeader('content-type', exposed.contentType);
    res.end(exposed.body);
  });

  server.listen(port);
  return server;
}
