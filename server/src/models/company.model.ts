import { Schema, Document, model } from "mongoose";

interface Address {
  street: string;
  area: string;
  city: string;
  country: string;
}

const addressSchema = new Schema<Address>({
  street: {
    type: String,
    required: true,
  },
  area: {
    type: String,
    required: true,
  },
  city: {
    type: String,
    required: true,
  },
  country: {
    type: String,
    required: true,
  },
});

interface Target {
  _id: string;
  year:number;
  salesRevenue:RangeTarget;
  grossProfit:RangeTarget;
}

interface RangeTarget{
  targetValue: number;
  criticalRange: number;
  moderateRange: number;
}

const rangeSchema = new Schema<RangeTarget>({
  targetValue: {
    type: Number,
    required: true,
  },
  criticalRange: {
    type: Number,
    required: true,
  },
  moderateRange: {
    type: Number,
    required: true,
  },
});

const targetSchema = new Schema<Target>({
  year: {
    type: Number,
    required: true,
  },
  salesRevenue:{
    type:rangeSchema,
    required: true,
  },
  grossProfit:{
    type:rangeSchema,
    required: true,
  },
});

interface Company extends Document {
  name: string;
  description: string;
  address: Address;
  targets: Target[];
}

const companySchema = new Schema<Company>({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  address: {
    type: addressSchema,
    required: true,
  },
  targets: {
    type: [targetSchema],
  },
});

export default model<Company>("Company", companySchema);
