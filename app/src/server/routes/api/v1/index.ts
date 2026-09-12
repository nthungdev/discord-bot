import { Router } from "express";
import authRouter from "./authRouter";
import botsRouter from "./botsRouter";
import configRouter from "./configRouter";
import dashboardRouter from "./dashboardRouter";
import guildsRouter from "./guildsRouter";
import memoryRouter from "./memoryRouter";

const v1Router = Router();

v1Router.use("/auth", authRouter);
v1Router.use("/bots", botsRouter);
v1Router.use("/guilds", guildsRouter);
v1Router.use("/config", configRouter);
v1Router.use("/dashboard", dashboardRouter);
v1Router.use("/memory", memoryRouter);

export default v1Router;
