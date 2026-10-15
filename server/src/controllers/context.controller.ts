import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import Product from "../models/products.model";
import Supplier from "../models/supplier.model";
import Employee from "../models/employee.model";
import StockMovement from "../models/stockMovement.model";
import PurchaseOrder from "../models/purchaseOrder.model";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toLimit = (value: unknown) => {
  const parsed = Number(value ?? DEFAULT_LIMIT);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
};

const objectIdOrNull = (id: string) => (Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null);

const productFilter = (query: any) => {
  const filter: Record<string, any> = {
    isDeleted: { $ne: true },
    isActive: { $ne: false },
    approvalStatus: "Approved",
  };
  const search = String(query.search ?? query.q ?? "").trim();
  if (search) {
    const regex = { $regex: escapeRegex(search), $options: "i" };
    filter.$or = [
      { partNo: regex },
      { itemCode: regex },
      { nickName: regex },
      { productName: regex },
      { productDescription: regex },
      { brand: regex },
    ];
  }
  if (query.type) filter.type = query.type;
  return filter;
};

const productProjection = {
  partNo: 1,
  itemCode: 1,
  nickName: 1,
  productName: 1,
  productDescription: 1,
  productCategory: 1,
  productSegment: 1,
  brand: 1,
  type: 1,
  unitOfMeasure: 1,
  defaultSellingPrice: 1,
  estimatedCost: 1,
  defaultVendor: 1,
};

const supplierFilter = (query: any) => {
  const filter: Record<string, any> = {
    isDeleted: { $ne: true },
    status: "Approved",
    isBlocked: { $ne: true },
  };
  const search = String(query.search ?? query.q ?? "").trim();
  if (search) {
    const regex = { $regex: escapeRegex(search), $options: "i" };
    filter.$or = [
      { supplierId: regex },
      { supplierName: regex },
      { supplierType: regex },
      { "products.productName": regex },
    ];
  }
  if (query.supplierType) filter.supplierType = query.supplierType;
  return filter;
};

const supplierProjection = {
  supplierId: 1,
  supplierName: 1,
  supplierType: 1,
  category: 1,
  contactDetails: 1,
  products: 1,
  creditDays: 1,
  creditValue: 1,
  status: 1,
};

const employeeFilter = (query: any) => {
  const filter: Record<string, any> = {
    isDeleted: { $ne: true },
    isBlocked: { $ne: true },
  };
  const search = String(query.search ?? query.q ?? "").trim();
  if (search) {
    const regex = { $regex: escapeRegex(search), $options: "i" };
    filter.$or = [
      { employeeId: regex },
      { firstName: regex },
      { lastName: regex },
      { email: regex },
      { designation: regex },
    ];
  }
  if (Types.ObjectId.isValid(query.department)) {
    filter.department = new Types.ObjectId(query.department);
  }
  if (query.role === "technician") filter.isTechnician = true;
  if (query.role === "driver") filter.isDriver = true;
  if (query.role === "projectManager") filter.isProjectManager = true;
  return filter;
};

const employeeProjection = {
  employeeId: 1,
  firstName: 1,
  lastName: 1,
  email: 1,
  designation: 1,
  department: 1,
  reportingTo: 1,
  isTechnician: 1,
  isDriver: 1,
  isProjectManager: 1,
};

export const getProductsContext = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const products = await Product.find(productFilter(req.query), productProjection)
      .limit(toLimit(req.query.limit))
      .sort({ partNo: 1 })
      .populate("productCategory", "categoryName category categoryType departmentName name")
      .populate("productSegment", "departmentName")
      .populate("defaultVendor", "supplierId supplierName")
      .lean();

    return res.status(200).json({ success: true, data: products });
  } catch (error) {
    next(error);
  }
};

export const getProductContext = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = objectIdOrNull(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Invalid product id" });

    const product = await Product.findOne({ _id: id, ...productFilter({}) }, productProjection)
      .populate("productCategory", "categoryName category categoryType departmentName name")
      .populate("productSegment", "departmentName")
      .populate("defaultVendor", "supplierId supplierName")
      .lean();
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    // Last purchase info is the latest stock Receipt in the ledger.
    const lastReceipt: any = await StockMovement.findOne({
      product: id, movementType: 'Receipt', stockStatus: { $ne: 'Quarantine' }, reversalOf: { $exists: false }, isDeleted: { $ne: true },
    })
      .sort({ movementDate: -1, createdDate: -1 })
      .populate("supplier", "supplierId supplierName")
      .populate("warehouse", "wareHouseName")
      .lean();
    const lastStockEntry = lastReceipt ? {
      dateOfPurchase: lastReceipt.movementDate,
      supplierName: lastReceipt.supplier,
      supplierLpoNo: lastReceipt.lpoNo,
      quantity: lastReceipt.quantityIn,
      uom: (product as any).unitOfMeasure,
      unitCost: lastReceipt.unitCost,
      targetWarehouse: lastReceipt.warehouse,
      isQuarantined: false,
    } : null;

    return res.status(200).json({
      success: true,
      data: {
        ...product,
        purchaseContext: {
          lastStockEntry: lastStockEntry ?? null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getSuppliersContext = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const suppliers = await Supplier.find(supplierFilter(req.query), supplierProjection)
      .limit(toLimit(req.query.limit))
      .sort({ supplierName: 1 })
      .populate("category", "departmentName")
      .lean();

    return res.status(200).json({ success: true, data: suppliers });
  } catch (error) {
    next(error);
  }
};

export const getSupplierContext = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = objectIdOrNull(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Invalid supplier id" });

    const supplier = await Supplier.findOne({ _id: id, ...supplierFilter({}) }, supplierProjection)
      .populate("category", "departmentName")
      .lean();
    if (!supplier) return res.status(404).json({ success: false, message: "Supplier not found" });

    const lastPurchaseOrder = await PurchaseOrder.findOne({ supplierId: id }, {
      poNo: 1,
      poStatus: 1,
      poDate: 1,
      currency: 1,
      items: { $slice: 5 },
    })
      .sort({ poDate: -1, createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        ...supplier,
        purchaseContext: {
          lastPurchaseOrder: lastPurchaseOrder ?? null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getEmployeesContext = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const employees = await Employee.find(employeeFilter(req.query), employeeProjection)
      .limit(toLimit(req.query.limit))
      .sort({ firstName: 1, lastName: 1 })
      .populate("department", "departmentName code")
      .populate("reportingTo", "employeeId firstName lastName designation")
      .lean();

    return res.status(200).json({ success: true, data: employees });
  } catch (error) {
    next(error);
  }
};

export const getEmployeeContext = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = objectIdOrNull(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Invalid employee id" });

    const employee = await Employee.findOne({ _id: id, ...employeeFilter({}) }, employeeProjection)
      .populate("department", "departmentName code")
      .populate("reportingTo", "employeeId firstName lastName designation")
      .lean();
    if (!employee) return res.status(404).json({ success: false, message: "Employee not found" });

    return res.status(200).json({ success: true, data: employee });
  } catch (error) {
    next(error);
  }
};
