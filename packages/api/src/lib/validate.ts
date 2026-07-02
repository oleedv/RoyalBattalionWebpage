import { zValidator } from "@hono/zod-validator";
import { fail } from "./crud-helpers";

/**
 * Drop-in replacement for `zValidator` (same call signature: `validate(target, schema)`)
 * that returns the standard `{ success: false, error: <string> }` envelope on validation
 * failure instead of the raw ZodError object. Keeps API error responses consistent and
 * displayable by the web client.
 */
// Internal impl uses `any` to avoid fighting zValidator's overloaded generics; the public
// export is cast back to `typeof zValidator` so call sites keep full type inference
// (e.g. `c.req.valid("json")`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const impl = (target: any, schema: any) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  zValidator(target, schema, (result: any, c: any) => {
    if (!result.success) {
      const msg =
        (result.error?.issues ?? [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((i: any) => i?.message)
          .filter(Boolean)
          .join("; ") || "Invalid request";
      return fail(c, msg, 400);
    }
  });

export const validate = impl as unknown as typeof zValidator;
