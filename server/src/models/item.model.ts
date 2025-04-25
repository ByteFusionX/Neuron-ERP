import { Schema, Document, model, Types } from "mongoose";

interface Item extends Document {
    itemName: String;
    QTY: Number;
    unitPrice: Number;
    comparison:[];

}