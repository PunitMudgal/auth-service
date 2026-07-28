import { pino } from "pino";

const showLogs = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",

  transport:
    showLogs
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        }
      : undefined,
});