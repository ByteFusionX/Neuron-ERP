import { Router } from "express";
import { unsubscribe } from "../controllers/pushSubscription.controller";

const pushSubscriptionRouter = Router();

// Subscribing lives at POST /employee/push-subscription: it needs the session cookie, which is only sent to /employee.
pushSubscriptionRouter.post('/unsubscribe', unsubscribe);

export default pushSubscriptionRouter;
