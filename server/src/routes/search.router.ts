import express from "express";
import { requireReadonlyContext } from "../common/middlewares/readonly-context.middleware";
import { getRelated, globalSearch } from "../controllers/search.controller";

const searchRouter = express.Router();

searchRouter.use(requireReadonlyContext);

searchRouter.get("/", globalSearch);
searchRouter.get("/related/:module/:id", getRelated);

export default searchRouter;
