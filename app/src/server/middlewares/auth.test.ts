import { describe, it, expect, vi, beforeEach } from "vitest";
import auth from "./auth";
import type { Request, Response, NextFunction } from "express";

describe("auth middleware unit test", () => {
  beforeEach(() => {
    process.env.BEARER_TOKEN = "secret-token-123";
  });

  it("should return 401 when Authorization header is missing", () => {
    const req = { headers: {} } as Request;
    const sendMock = vi.fn();
    const statusMock = vi.fn();
    const res = {
      status: statusMock,
      send: sendMock,
    } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    auth(req, res, next);
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(sendMock).toHaveBeenCalledWith({ ok: false, message: "unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 when token is incorrect", () => {
    const req = {
      headers: { authorization: "Bearer wrong-token" },
    } as unknown as Request;
    const sendMock = vi.fn();
    const statusMock = vi.fn();
    const res = {
      status: statusMock,
      send: sendMock,
    } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    auth(req, res, next);
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(sendMock).toHaveBeenCalledWith({ ok: false, message: "unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should call next() when valid token is provided", () => {
    const req = {
      headers: { authorization: "Bearer secret-token-123" },
    } as unknown as Request;
    const res = {
      status: vi.fn(),
      send: vi.fn(),
    } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    auth(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
