import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import StockEntry from "../models/stockEntry.model";
import StockBlock from "../models/stockBlock.model";
import Product from "../models/products.model";
import Supplier from "../models/supplier.model";
import Department from "../models/department.model";
import ProductCategory from "../models/productCategory.model";
import Warehouse from "../models/warehouse.model";
import Customer from "../models/customer.model";
import jobModel from "../models/job.model";
import { getEmployeeData, buildPrivilegeAccessFilter } from "../common/utils/util";
import { ObjectId } from "mongodb";
import Employee from "../models/employee.model";
import { getNextSequence } from "../models/counter.model";

// grn values can carry a per-line suffix (e.g. GRN-2026-0009-1, -2, -3 for multiple
// stock entries filed under the same GRN), so the main sequence must be read from the
// digits immediately after the prefix, and the max must be taken across all matching
// entries rather than the most recently created one.
const seedStockEntryGrnSequence = (prefix: string) => async (): Promise<number> => {
    const entries = await StockEntry.find({
        grn: new RegExp(`^${prefix}-\\d+`)
    }).select('grn').lean();

    let maxNum = 0;
    const pattern = new RegExp(`^${prefix}-(\\d+)`);
    for (const entry of entries) {
        const match = entry.grn.match(pattern);
        if (match) {
            maxNum = Math.max(maxNum, parseInt(match[1], 10));
        }
    }
    return maxNum;
};

export const generateGRN = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const currentYear = new Date().getFullYear();
        const prefix = `GRN-${currentYear}`;

        const sequence = await getNextSequence(`stockEntryGrn-${currentYear}`, seedStockEntryGrnSequence(prefix));
        const grn = `${prefix}-${sequence.toString().padStart(4, '0')}`;

        return res.status(200).json({ grn });
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const createStockEntry = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data: any = req.body;
        const token = (req as any).user;

        if (!data.grn || !data.partNo || !data.dateOfPurchase || !data.supplierName || 
            !data.productDescription || !data.productSegment || !data.productCategory || 
            !data.targetWarehouse || !data.quantity || !data.unitCost || !data.totalCost) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const refIds = [data.partNo, data.supplierName, data.productSegment, data.productCategory, data.targetWarehouse];
        if (data.jobId) refIds.push(data.jobId);

        if (!refIds.every((id: string) => ObjectId.isValid(id))) {
            return res.status(400).json({ message: "Invalid reference id(s) provided" });
        }

        const existing = await StockEntry.findOne({ grn: data.grn, isDeleted: { $ne: true } });
        if (existing) {
            return res.status(409).json({ message: "Stock entry with this GRN already exists" });
        }

        const [productExist, supplierExist, segmentExist, categoryExist, warehouseExist] = await Promise.all([
            Product.findById(data.partNo),
            Supplier.findById(data.supplierName),
            Department.findById(data.productSegment),
            ProductCategory.findById(data.productCategory),
            Warehouse.findById(data.targetWarehouse)
        ]);

        if (!productExist || !supplierExist || !segmentExist || !categoryExist || !warehouseExist) {
            return res.status(400).json({ message: "Invalid references provided" });
        }

        if (data.jobId) {
            const jobExist = await jobModel.findById(data.jobId);
            if (!jobExist) {
                return res.status(400).json({ message: "Invalid job ID provided" });
            }
        }

        const employee = await getEmployeeData(token);
        if (!employee) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const stockEntry = await StockEntry.create({
            grn: data.grn.trim(),
            partNo: data.partNo,
            dateOfPurchase: data.dateOfPurchase,
            jobId: data.jobId || undefined,
            supplierName: data.supplierName,
            supplierLpoNo: data.supplierLpoNo?.trim() || undefined,
            productDescription: data.productDescription.trim(),
            productSegment: data.productSegment,
            productCategory: data.productCategory,
            targetWarehouse: data.targetWarehouse,
            quantity: data.quantity,
            uom: data.uom?.trim(),
            unitCost: data.unitCost,
            totalCost: data.totalCost,
            sellingPrice: data.sellingPrice,
            serialNumbers: data.serialNumbers || [],
            remarks: data.remarks?.trim(),
            createdBy: employee._id,
            createdDate: new Date(),
            updatedDate: new Date(),
            isDeleted: false
        });

        const populated = await StockEntry.findById(stockEntry._id)
            .populate('partNo')
            .populate('supplierName')
            .populate('productSegment')
            .populate('productCategory')
            .populate('targetWarehouse')
            .populate('jobId')
            .populate('createdBy', 'firstName lastName');

        return res.status(201).json(populated);
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const getStockEntries = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            page = '1',
            row = '10',
            search,
            grn,
            partNo,
            supplierName,
            productCategory,
            productSegment,
            targetWarehouse,
            jobId,
            fromDate,
            toDate
        } = req.query;

        const tokenData = (req as any).user;
        const employee = await getEmployeeData(tokenData);
        if (!employee) {
            return res.status(401).json({
                success: false,
                message: "Employee not found",
            });
        }

        const privileges = employee.category?.privileges;
        const accessFilter = privileges?.inventory?.stockEntries?.viewReport 
            ? await buildPrivilegeAccessFilter(employee._id, privileges.inventory.stockEntries.viewReport, 'createdBy')
            : {};

        const pageNum = Math.max(parseInt(page as string, 10) || 1, 1);
        const rowNum = Math.max(parseInt(row as string, 10) || 10, 1);
        const skip = (pageNum - 1) * rowNum;

        const filter: any = { 
            isDeleted: { $ne: true },
            ...accessFilter
        };

        if (grn) {
            filter.grn = { $regex: grn as string, $options: 'i' };
        }

        if (partNo && ObjectId.isValid(partNo as string)) {
            filter.partNo = new ObjectId(partNo as string);
        }

        if (supplierName && ObjectId.isValid(supplierName as string)) {
            filter.supplierName = new ObjectId(supplierName as string);
        }

        if (productCategory && ObjectId.isValid(productCategory as string)) {
            filter.productCategory = new ObjectId(productCategory as string);
        }

        if (productSegment && ObjectId.isValid(productSegment as string)) {
            filter.productSegment = new ObjectId(productSegment as string);
        }

        if (targetWarehouse && ObjectId.isValid(targetWarehouse as string)) {
            filter.targetWarehouse = new ObjectId(targetWarehouse as string);
        }

        if (jobId && ObjectId.isValid(jobId as string)) {
            filter.jobId = new ObjectId(jobId as string);
        }

        if (fromDate || toDate) {
            filter.dateOfPurchase = {};
            if (fromDate) {
                filter.dateOfPurchase.$gte = new Date(fromDate as string);
            }
            if (toDate) {
                const endDate = new Date(toDate as string);
                endDate.setHours(23, 59, 59, 999);
                filter.dateOfPurchase.$lte = endDate;
            }
        }

        const searchTerm = typeof search === 'string' ? search.trim() : '';
        if (searchTerm) {
            const regex = new RegExp(searchTerm, 'i');
            const productMatches = await Product.find({ partNo: regex }).select('_id');

            const searchConditions: any[] = [
                { grn: regex },
                { productDescription: regex },
                { supplierLpoNo: regex }
            ];

            if (productMatches.length) {
                searchConditions.push({ partNo: { $in: productMatches.map(product => product._id) } });
            }

            filter.$or = searchConditions;
        }

        const [stockEntries, total] = await Promise.all([
            StockEntry.find(filter)
                .populate('partNo')
                .populate('supplierName', 'supplierName')
                .populate('productSegment', 'departmentName')
                .populate('productCategory', 'categoryName')
                .populate('targetWarehouse', 'wareHouseName')
                .populate('jobId', 'jobId')
                .populate('createdBy', 'firstName lastName')
                .sort({ createdDate: -1 })
                .skip(skip)
                .limit(rowNum),
            StockEntry.countDocuments(filter)
        ]);

        const stockEntryIds = stockEntries.map(entry => entry._id);
        const now = new Date();
        
        const activeBlocks = await StockBlock.find({
            stockEntryId: { $in: stockEntryIds },
            isDeleted: { $ne: true },
            toDate: { $gte: now }
        })
        .populate('customerId', 'companyName clientRef')
        .lean();

        const blocksByEntryId = new Map<string, any[]>();
        activeBlocks.forEach(block => {
            const entryId = block.stockEntryId.toString();
            if (!blocksByEntryId.has(entryId)) {
                blocksByEntryId.set(entryId, []);
            }
            blocksByEntryId.get(entryId)!.push(block);
        });

        const enrichedEntries = stockEntries.map((entry: any) => {
            const entryId = entry._id.toString();
            const blocks = blocksByEntryId.get(entryId) || [];
            const blockedQuantity = blocks.reduce((sum, block) => sum + (block.quantity || 0), 0);
            const availableQuantity = Math.max(0, entry.quantity - blockedQuantity);
            
            return {
                ...entry.toObject(),
                availableQuantity,
                blockedQuantity,
                activeBlocks: blocks.filter(block => new Date(block.toDate) >= now),
                remarks: entry.remarks || ''
            };
        });

        return res.status(200).json({
            success: true,
            message: 'Stock entries fetched successfully',
            data: {
                stockEntries: enrichedEntries,
                pagination: {
                    total,
                    page: pageNum,
                    pages: Math.ceil(total / rowNum),
                    limit: rowNum
                }
            }
        });
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const getStockEntryById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

        const stockEntry = await StockEntry.findOne({ _id: id, isDeleted: { $ne: true } })
            .populate('partNo')
            .populate('supplierName')
            .populate('productSegment')
            .populate('productCategory')
            .populate('targetWarehouse')
            .populate('jobId')
            .populate('createdBy', 'firstName lastName');
        
        if (!stockEntry) return res.status(404).json({ message: "Stock entry not found" });
        return res.status(200).json(stockEntry);
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const updateStockEntry = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const data: any = req.body;
        const token = (req as any).user;

        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

        if (data.grn) {
            const exist = await StockEntry.findOne({ _id: { $ne: id }, grn: new RegExp(`^${data.grn}$`, 'i'), isDeleted: { $ne: true } });
            if (exist) return res.status(409).json({ message: "Stock entry with this GRN already exists" });
        }

        const refChecks: Promise<any>[] = [];
        if (data.partNo) refChecks.push(Product.findById(data.partNo));
        if (data.supplierName) refChecks.push(Supplier.findById(data.supplierName));
        if (data.productSegment) refChecks.push(Department.findById(data.productSegment));
        if (data.productCategory) refChecks.push(ProductCategory.findById(data.productCategory));
        if (data.targetWarehouse) refChecks.push(Warehouse.findById(data.targetWarehouse));
        if (data.jobId) {
            refChecks.push(jobModel.findById(data.jobId));
        }

        if (refChecks.length) {
            const checks = await Promise.all(refChecks);
            if (checks.some((c) => !c)) return res.status(400).json({ message: "Invalid references provided" });
        }

        const employee = await getEmployeeData(token);
        if (!employee) return res.status(401).json({ message: "Unauthorized" });

        const updated = await StockEntry.findOneAndUpdate(
            { _id: id, isDeleted: { $ne: true } },
            {
                $set: {
                    ...(data.grn ? { grn: data.grn.trim() } : {}),
                    ...(data.partNo ? { partNo: data.partNo } : {}),
                    ...(data.dateOfPurchase ? { dateOfPurchase: data.dateOfPurchase } : {}),
                    ...(data.jobId !== undefined ? { jobId: data.jobId || null } : {}),
                    ...(data.supplierName ? { supplierName: data.supplierName } : {}),
                    ...(data.supplierLpoNo !== undefined ? { supplierLpoNo: data.supplierLpoNo?.trim() || null } : {}),
                    ...(data.productDescription ? { productDescription: data.productDescription.trim() } : {}),
                    ...(data.productSegment ? { productSegment: data.productSegment } : {}),
                    ...(data.productCategory ? { productCategory: data.productCategory } : {}),
                    ...(data.targetWarehouse ? { targetWarehouse: data.targetWarehouse } : {}),
                    ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
                    ...(data.uom !== undefined ? { uom: data.uom?.trim() || null } : {}),
                    ...(data.unitCost !== undefined ? { unitCost: data.unitCost } : {}),
                    ...(data.totalCost !== undefined ? { totalCost: data.totalCost } : {}),
                    ...(data.sellingPrice !== undefined ? { sellingPrice: data.sellingPrice } : {}),
                    ...(data.serialNumbers !== undefined ? { serialNumbers: data.serialNumbers } : {}),
                    ...(data.remarks !== undefined ? { remarks: data.remarks?.trim() || null } : {}),
                    updatedBy: employee._id,
                    updatedDate: new Date()
                }
            },
            { new: true }
        )
            .populate('partNo')
            .populate('supplierName')
            .populate('productSegment')
            .populate('productCategory')
            .populate('targetWarehouse')
            .populate('jobId')
            .populate('createdBy', 'firstName lastName');

        if (!updated) return res.status(404).json({ message: "Stock entry not found" });
        return res.status(200).json(updated);
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const deleteStockEntry = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

        const deleted = await StockEntry.findOneAndUpdate(
            { _id: id, isDeleted: { $ne: true } },
            { $set: { isDeleted: true } },
            { new: true }
        );
        
        if (!deleted) return res.status(404).json({ message: "Stock entry not found or already deleted" });
        return res.status(200).json({ success: true, message: "Stock entry deleted" });
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const getAvailableQuantity = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { stockEntryId } = req.query;
        
        if (!stockEntryId || !ObjectId.isValid(stockEntryId as string)) {
            return res.status(400).json({ message: "Invalid stock entry id" });
        }

        const stockEntry = await StockEntry.findOne({ _id: stockEntryId, isDeleted: { $ne: true } });
        if (!stockEntry) {
            return res.status(404).json({ message: "Stock entry not found" });
        }

        const now = new Date();
        const activeBlocks = await StockBlock.find({
            stockEntryId: new ObjectId(stockEntryId as string),
            isDeleted: { $ne: true },
            toDate: { $gte: now }
        });

        const blockedQuantity = activeBlocks.reduce((sum, block) => sum + (block.quantity || 0), 0);
        const availableQuantity = Math.max(0, stockEntry.quantity - blockedQuantity);

        return res.status(200).json({
            success: true,
            data: {
                availableQuantity,
                totalQuantity: stockEntry.quantity,
                blockedQuantity
            }
        });
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const createStockBlock = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data: any = req.body;
        const token = (req as any).user;

        if (!data.stockEntryId || !data.salesPersonName || !data.customerName || 
            !data.quantity || !data.fromDate || !data.toDate) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        if (!ObjectId.isValid(data.stockEntryId)) {
            return res.status(400).json({ message: "Invalid stock entry id" });
        }

        const stockEntry = await StockEntry.findOne({ _id: data.stockEntryId, isDeleted: { $ne: true } });
        if (!stockEntry) {
            return res.status(404).json({ message: "Stock entry not found" });
        }

        let customerId: Types.ObjectId | undefined = undefined;
        if (data.customerId && ObjectId.isValid(data.customerId)) {
            const customer = await Customer.findOne({ _id: data.customerId, isDeleted: { $ne: true } });
            if (!customer) {
                return res.status(400).json({ message: "Invalid customer id provided" });
            }
            customerId = customer._id as Types.ObjectId;
        }

        const now = new Date();
        const activeBlocks = await StockBlock.find({
            stockEntryId: data.stockEntryId,
            isDeleted: { $ne: true },
            toDate: { $gte: now }
        });

        const blockedQuantity = activeBlocks.reduce((sum, block) => sum + (block.quantity || 0), 0);
        const availableQuantity = Math.max(0, stockEntry.quantity - blockedQuantity);

        if (data.quantity > availableQuantity) {
            return res.status(400).json({ 
                message: `Cannot block ${data.quantity} units. Only ${availableQuantity} units available.` 
            });
        }

        const employee = await getEmployeeData(token);
        if (!employee) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const stockBlock = await StockBlock.create({
            stockEntryId: data.stockEntryId,
            salesPersonName: data.salesPersonName.trim(),
            customerId: customerId,
            customerName: data.customerName.trim(),
            quantity: data.quantity,
            fromDate: new Date(data.fromDate),
            toDate: new Date(data.toDate),
            createdBy: employee._id,
            createdDate: new Date(),
            updatedDate: new Date(),
            isDeleted: false
        });

        const populated = await StockBlock.findById(stockBlock._id)
            .populate('stockEntryId')
            .populate('customerId', 'companyName clientRef')
            .populate('createdBy', 'firstName lastName');

        return res.status(201).json({
            success: true,
            message: 'Stock block created successfully',
            data: populated
        });
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const getStockBlocks = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { stockEntryId } = req.query;
        
        if (!stockEntryId || !ObjectId.isValid(stockEntryId as string)) {
            return res.status(400).json({ message: "Invalid stock entry id" });
        }

        const blocks = await StockBlock.find({
            stockEntryId: new ObjectId(stockEntryId as string),
            isDeleted: { $ne: true }
        })
        .populate('customerId', 'companyName clientRef')
        .populate('createdBy', 'firstName lastName')
        .sort({ createdDate: -1 });        return res.status(200).json({
            success: true,
            data: blocks
        });
    } catch (error) {
        console.error(error);
        next(error);
    }
};
