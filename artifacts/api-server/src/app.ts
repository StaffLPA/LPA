import express, { type Express } from "express";
import cors, { type CorsOptions } from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
const corsOptions: CorsOptions = {
  // Reflect the requesting preview origin instead of using `*`. The Expo web
  // preview sends a bearer token, so browsers require an explicit origin.
  origin: true,
  credentials: true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Accept",
    "Authorization",
    "Cache-Control",
    "Content-Type",
    "Pragma",
  ],
  optionsSuccessStatus: 204,
};

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", (_req, res, next) => {
  // Roster, invites, messages, and events are shared live data. Prevent
  // browser/proxy revalidation from returning a body-less 304 to mobile.
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  });
  next();
});

app.use("/api", router);

export default app;
