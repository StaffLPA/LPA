import { Router, type IRouter } from "express";
import healthRouter from "./health";
import invitesRouter from "./invites";
import messagingRouter from "./messaging";
import adminCalendarRouter from "./adminCalendar";

const router: IRouter = Router();

router.use(healthRouter);
router.use(invitesRouter);
router.use(messagingRouter);
router.use(adminCalendarRouter);

export default router;
