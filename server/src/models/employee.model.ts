import { Schema, Document, model, Types } from "mongoose";

interface Employee extends Document {
    employeeId: string;
    firstName: string;
    lastName: string;
    email: string;
    contactNo: number;
    designation: string;
    dob: Date;
    department: Types.ObjectId;
    category: Types.ObjectId;
    dateOfJoining: Date;
    reportingTo: Types.ObjectId;
    userRole: string;
    password: string;
    createdBy: Types.ObjectId;
    targets: Target[];
    isBlocked: boolean;
    isDeleted: boolean;
    lastActivity: number;
}

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

enum UserRole {
    user,
    admin,
    superAdmin
}

const employeeSchema = new Schema<Employee>({
    employeeId: {
        type: String,
        required: true,
        unique: true,
    },
    firstName: {
        type: String,
        required: true,
    },
    lastName: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
    },
    contactNo: {
        type: Number,
        required: true,
    },
    designation: {
        type: String,
        required: true,
    },
    dob: {
        type: Date,
        required: true,
    },
    department: {
        type: Schema.Types.ObjectId,
        ref: 'InternalDepartment',
        required: true,
    },
    category: {
        type: Schema.Types.ObjectId,
        ref: 'Category',
        required: true,
    },
    dateOfJoining: {
        type: Date,
        required: true,
    },
    reportingTo: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        default: null,
    },
    password: {
        type: String,
        required: true,
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    targets: {
      type: [targetSchema], 
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    lastActivity: {
        type: Number,
        required: false
    }
});

employeeSchema.index({ firstName: 1, lastName: 1 })
export default model<Employee>("Employee", employeeSchema);
