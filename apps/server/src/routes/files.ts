import express, { type Router } from "express";
import {
  canRead,
  FileNotFoundError,
  formatToday,
  InvalidPathError,
  type FileRepository,
} from "@gtd/core";
import { ApiError } from "../middleware/error-handler.js";

export interface FileContentBody {
  content: string;
}

// Express 5 delivers a named wildcard as decoded path segments
// (`["tasks", "inbox.md"]`), so vault paths containing `/` arrive intact where
// a `:param` would stop at the first slash.
export function filesRouter(repo: FileRepository, now: () => Date): Router {
  const router = express.Router();
  router.get("/api/files/*path", async (req, res) => {
    const filePath = joinSegments(req.params.path);
    try {
      // Same GTD scope as the LLM tools: core `canRead` throws
      // `InvalidPathError` for unsafe paths and is false outside the layout.
      if (!canRead(filePath, formatToday(now()))) {
        throw new ApiError(
          403,
          "path_out_of_scope",
          `Path is outside the GTD layout: ${filePath}`,
        );
      }
      const body: FileContentBody = { content: await repo.read(filePath) };
      res.json(body);
    } catch (err) {
      throw toApiError(err);
    }
  });
  return router;
}

function joinSegments(value: unknown): string {
  return Array.isArray(value) ? value.join("/") : String(value);
}

// Core path errors become stable client codes; an `ApiError` passes through,
// anything else stays unknown and reaches the 500 handler.
function toApiError(err: unknown): unknown {
  if (err instanceof InvalidPathError)
    return new ApiError(400, "invalid_path", err.message);
  if (err instanceof FileNotFoundError)
    return new ApiError(404, "file_not_found", err.message);
  return err;
}
