import express from "express";
import type { Server } from "node:http";

export interface StubDriver {
  userId: string;
  displayName: string;
  vehicleType: string | null;
}

/**
 * Tiny Express server standing in for user-service's internal driver lookup, so
 * force-assign can resolve a driver profile without a real user-service. Answers
 * `GET /v1/users/internal/drivers/:id`: 401 without an `x-service-authorization`
 * Bearer header, 404 if the id is unknown, else the driver JSON. Reads the live
 * `drivers` map on every request so tests can add/clear drivers per case.
 */
export async function startUserServiceDriverStub(
  drivers: Map<string, StubDriver>,
): Promise<{ url: string; stop: () => Promise<void> }> {
  const app = express();
  // Close the socket after each response. Node's global fetch (undici) pools
  // keep-alive sockets; against this ephemeral stub a reused socket can stall
  // (undici headersTimeout is 300s → looks like a hang). Force a fresh socket.
  app.use((_req, res, next) => {
    res.set("Connection", "close");
    next();
  });
  app.get("/v1/users/internal/drivers/:id", (req, res) => {
    if (!req.header("x-service-authorization")?.startsWith("Bearer ")) {
      res.status(401).end();
      return;
    }
    const d = drivers.get(req.params.id);
    if (!d) {
      res.status(404).end();
      return;
    }
    res.json(d);
  });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  server.keepAliveTimeout = 0;
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`,
    stop: () => new Promise<void>((r) => server.close(() => r())),
  };
}
