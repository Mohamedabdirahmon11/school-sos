import { NextFunction, Request, Response, Router } from 'express';

type Next = (error?: unknown) => void;

function wrapLayer(layer: any): void {
  const original = layer.handle;
  if (typeof original !== 'function' || original.length >= 4) return;
  layer.handle = function asyncErrorForwarder(req: Request, res: Response, next: Next) {
    try {
      const result = original(req, res, next);
      if (result && typeof result.then === 'function') {
        result.catch(next);
      }
    } catch (error) {
      next(error);
    }
  };
}

export function forwardAsyncErrors(router: Router): void {
  const stack = (router as any).stack as any[] | undefined;
  if (!Array.isArray(stack)) return;
  for (const layer of stack) {
    if (layer.route?.stack) {
      for (const routeLayer of layer.route.stack) wrapLayer(routeLayer);
    } else {
      wrapLayer(layer);
    }
  }
}

export function apiErrorHandler(error: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(error);
    return;
  }
  const message = error instanceof Error ? error.message : 'Unknown server error';
  console.error(`[api-error] ${req.method} ${req.originalUrl || req.path}: ${message}`);
  res.status(500).json({ error: 'An unexpected server error occurred. Please try again.' });
}
