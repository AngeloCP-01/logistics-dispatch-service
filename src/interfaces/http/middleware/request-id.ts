import type { RequestHandler } from "express";
import { v7 as uuidV7 } from "uuid";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requestId(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.header("x-request-id");
    const id = incoming && UUID_RX.test(incoming) ? incoming : uuidV7();
    req.requestId = id;
    res.setHeader("X-Request-Id", id);
    next();
  };
}
