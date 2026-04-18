"use server";

import { logger } from "./logger";

export async function logClientError(input: {
  message: string;
  name?: string;
  stack?: string;
  digest?: string;
  path?: string;
}) {
  const err = new Error(input.message);
  if (input.name) err.name = input.name;
  if (input.stack) err.stack = input.stack;
  logger.error("client", "Client error boundary triggered", {
    err,
    digest: input.digest ?? null,
    path: input.path ?? null,
  });
}
