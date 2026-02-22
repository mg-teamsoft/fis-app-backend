import { Router } from "express";
import {
  listPurchaseTransactions,
} from "../controllers/iapCatalogController";

const router = Router();



router.get("/transactions", listPurchaseTransactions);


export default router;
