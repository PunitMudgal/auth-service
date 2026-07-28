import { config } from "dotenv";
import { resolve } from "path";

config({
    path: resolve(__dirname, "../../.env"),
});

const { PORT, DATABASE_URL } = process.env;

export const Config = {
    port: PORT || 3000,
    databaseUrl: DATABASE_URL,
};