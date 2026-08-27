import { describe, it, expect, vi } from "vitest";
import errorHandler from "./errorHandler";
import type { Request, Response, NextFunction } from "express";

describe("errorHandler middleware", () => {
  it("should forward error to next if headers are already sent", () => {
    const req = {} as Request;
    const res = { headersSent: true } as Response;
    const next = vi.fn() as unknown as NextFunction;
    const err = new Error("Headers already sent");

    errorHandler(err, req, res, next);
    expect(next).toHaveBeenCalledWith(err);
  });

  it("should respond with 500 and error message for Error instance", () => {
    const req = {} as Request;
    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    const res = { headersSent: false, status: statusMock } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;
    const err = new Error("Something broke");

    errorHandler(err, req, res, next);
    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({
      ok: false,
      message: "Something broke",
    });
  });

  it("should respond with default message for non-Error object", () => {
    const req = {} as Request;
    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    const res = { headersSent: false, status: statusMock } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    errorHandler("String error", req, res, next);
    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({
      ok: false,
      message: "Unknown Error",
    });
  });
});
