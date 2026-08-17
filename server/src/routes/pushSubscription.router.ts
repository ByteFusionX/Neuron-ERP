import { Router } from "express";
import { subscribe, unsubscribe } from "../controllers/pushSubscription.controller";

const pushSubscriptionRouter = Router();

pushSubscriptionRouter.post('/subscribe', subscribe);
pushSubscriptionRouter.post('/unsubscribe', unsubscribe);

export default pushSubscriptionRouter;
