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
import { StockHold } from "../models/stockHold.model";
import GRN from "../models/grn.model";
import { Invoice } from "../models/invoice.model";
import StockReservation from "../models/stockReservation.model";
import StockMovement from "../models/stockMovement.model";
import PurchaseOrder from "../models/purchaseOrder.model";
import DeliveryNote from "../models/deliveryNote.model";
import Quotation from "../models/quotation.model";

const getActiveReservationFilter = (now = new Date()) => ({
    isDeleted: { $ne: true },
    status: 'Active',
    expiresAt: { $gte: now },
});

const sumActiveReservationsByProductWarehouse = async (productIds: string[] = [], warehouseIds: string[] = []) => {
    const match: any = getActiveReservationFilter();
    if (productIds.length) match.product = { $in: productIds.map(id => new ObjectId(id)) };
    if (warehouseIds.length) match.$or = [
        { warehouse: { $in: warehouseIds.map(id => new ObjectId(id)) } },
        { warehouse: { $exists: false } },
        { warehouse: null },
    ];

    const rows = await StockReservation.aggregate([
        { $match: match },
        {
            $group: {
                _id: {
                    product: '$product',
                    warehouse: '$warehouse',
                },
                quantity: { $sum: '$quantity' },
            },
        },
    ]);

    const exact = new Map<string, number>();
    const productOnly = new Map<string, number>();
    rows.forEach((row: any) => {
        const productId = row._id.product?.toString();
        const warehouseId = row._id.warehouse?.toString();
        if (!productId) return;
        if (warehouseId) {
            exact.set(`${productId}:${warehouseId}`, (exact.get(`${productId}:${warehouseId}`) || 0) + (row.quantity || 0));
        } else {
            productOnly.set(productId, (productOnly.get(productId) || 0) + (row.quantity || 0));
        }
    });

    return { exact, productOnly };
};

const normalizePlanningKey = (value: any): string => String(value || '').trim().toLowerCase();

const addPlanningQuantity = (target: Map<string, number>, key: string | undefined, quantity: number) => {
    if (!key || !quantity || quantity <= 0) return;
    target.set(key, (target.get(key) || 0) + quantity);
};

// Manual (non-GRN-receipt) stock entry creation is hidden from the UI pending a rework;
// this endpoint is kept functional but no longer generates/requires a grn value.
export const createStockEntry = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data: any = req.body;
        const token = (req as any).user;

        if (!data.partNo || !data.dateOfPurchase || !data.supplierName ||
            !data.productDescription || !data.productSegment || !data.productCategory ||
            !data.targetWarehouse || !data.quantity || !data.unitCost || !data.totalCost) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const refIds = [data.partNo, data.supplierName, data.productSegment, data.productCategory, data.targetWarehouse];
        if (data.jobId) refIds.push(data.jobId);
        if (data.grn) refIds.push(data.grn);

        if (!refIds.every((id: string) => ObjectId.isValid(id))) {
            return res.status(400).json({ message: "Invalid reference id(s) provided" });
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
            grn: data.grn || undefined,
            partNo: data.partNo,
            itemCode: data.itemCode?.trim() || productExist.itemCode || undefined,
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

        await StockMovement.create({
            product: stockEntry.partNo,
            warehouse: stockEntry.targetWarehouse,
            stockEntry: stockEntry._id,
            movementType: stockEntry.isQuarantined ? 'Quarantine' : 'Receipt',
            quantityIn: stockEntry.quantity,
            quantityOut: 0,
            reservedQuantity: 0,
            unitCost: stockEntry.unitCost,
            totalCost: stockEntry.totalCost,
            referenceType: stockEntry.grn ? 'GRN' : 'Manual Stock Entry',
            referenceId: stockEntry.grn || stockEntry._id,
            remarks: stockEntry.remarks,
            movementDate: stockEntry.dateOfPurchase || new Date(),
            createdBy: employee._id,
            createdDate: new Date(),
        });

        const populated = await StockEntry.findById(stockEntry._id)
            .populate('partNo')
            .populate('supplierName')
            .populate('productSegment')
            .populate('productCategory')
            .populate('targetWarehouse')
            .populate('jobId')
            .populate('dn', 'dnNo')
            .populate('grn', 'grnNo')
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
            toDate,
            isQuarantined
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

        // By default, exclude quarantined (rejected-pending-QC) stock from the normal
        // sellable-stock listing. Pass isQuarantined=true to view only quarantined items.
        if (isQuarantined === 'true') {
            filter.isQuarantined = true;
        } else {
            filter.isQuarantined = { $ne: true };
        }

        if (grn) {
            const matchingGrns = await GRN.find({ grnNo: { $regex: grn as string, $options: 'i' } }).select('_id');
            filter.grn = { $in: matchingGrns.map(g => g._id) };
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
            const [productMatches, grnMatches] = await Promise.all([
                Product.find({ partNo: regex }).select('_id'),
                GRN.find({ grnNo: regex }).select('_id')
            ]);

            const searchConditions: any[] = [
                { productDescription: regex },
                { supplierLpoNo: regex }
            ];

            if (productMatches.length) {
                searchConditions.push({ partNo: { $in: productMatches.map(product => product._id) } });
            }

            if (grnMatches.length) {
                searchConditions.push({ grn: { $in: grnMatches.map(g => g._id) } });
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
                .populate({
                    path: 'jobId',
                    select: 'jobId quoteId',
                    populate: {
                        path: 'quoteId',
                        select: 'enqId',
                        populate: {
                            path: 'enqId',
                            select: 'client',
                            populate: {
                                path: 'client',
                                select: 'companyName'
                            }
                        }
                    }
                })
                .populate('dn', 'dnNo')
                .populate('grn', 'grnNo')
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

        const stockHolds = await StockHold.find({
            stockEntryId: { $in: stockEntryIds },
            isDeleted: { $ne: true }
        }).select('stockEntryId status').lean();

        const stockHoldStatusByEntryId = new Map<string, string>();
        stockHolds.forEach(stockHold => {
            if (stockHold.stockEntryId) {
                stockHoldStatusByEntryId.set(stockHold.stockEntryId.toString(), stockHold.status);
            }
        });

        const dnIds = stockEntries
            .map((entry: any) => entry.dn?._id)
            .filter((dnId: any) => !!dnId);

        const invoicesForDns = dnIds.length
            ? await Invoice.find({
                isDeleted: false,
                $or: [
                    { 'items.dnId': { $in: dnIds } },
                    { 'items.dnRefs.dnId': { $in: dnIds } }
                ]
            }).select('invoiceNo items.dnId items.dnRefs.dnId').lean()
            : [];

        const invoiceNosByDnId = new Map<string, Set<string>>();
        invoicesForDns.forEach((invoice: any) => {
            (invoice.items || []).forEach((item: any) => {
                const relatedDnIds: any[] = [];
                if (item.dnId) relatedDnIds.push(item.dnId);
                (item.dnRefs || []).forEach((ref: any) => {
                    if (ref.dnId) relatedDnIds.push(ref.dnId);
                });

                relatedDnIds.forEach((dnId) => {
                    const key = dnId.toString();
                    if (!invoiceNosByDnId.has(key)) {
                        invoiceNosByDnId.set(key, new Set());
                    }
                    invoiceNosByDnId.get(key)!.add(invoice.invoiceNo);
                });
            });
        });

        const enrichedEntries = stockEntries.map((entry: any) => {
            const entryId = entry._id.toString();
            const blocks = blocksByEntryId.get(entryId) || [];
            const blockedQuantity = blocks.reduce((sum, block) => sum + (block.quantity || 0), 0);
            const availableQuantity = entry.isQuarantined ? 0 : Math.max(0, entry.quantity - blockedQuantity);
            const stockHoldStatus = stockHoldStatusByEntryId.get(entryId);
            const dnId = entry.dn?._id?.toString();
            const invoiceNos = dnId ? Array.from(invoiceNosByDnId.get(dnId) || []) : [];

            return {
                ...entry.toObject(),
                availableQuantity,
                blockedQuantity,
                activeBlocks: blocks.filter(block => new Date(block.toDate) >= now),
                remarks: entry.remarks || '',
                stockHoldStatus: stockHoldStatus || null,
                isHoldResolved: stockHoldStatus ? ['Resolved', 'Disposed'].includes(stockHoldStatus) : true,
                invoiceNos
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

export const getStockOverview = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            page = '1',
            row = '10',
            search,
            productCategory,
            productSegment,
            targetWarehouse,
            lowStock
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

        const filter: any = {
            isDeleted: { $ne: true },
            ...accessFilter
        };

        if (productCategory && ObjectId.isValid(productCategory as string)) {
            filter.productCategory = new ObjectId(productCategory as string);
        }

        if (productSegment && ObjectId.isValid(productSegment as string)) {
            filter.productSegment = new ObjectId(productSegment as string);
        }

        if (targetWarehouse && ObjectId.isValid(targetWarehouse as string)) {
            filter.targetWarehouse = new ObjectId(targetWarehouse as string);
        }

        const searchTerm = typeof search === 'string' ? search.trim() : '';
        if (searchTerm) {
            const regex = new RegExp(searchTerm, 'i');
            const productMatches = await Product.find({
                $or: [
                    { partNo: regex },
                    { itemCode: regex },
                    { productDescription: regex }
                ],
                isDeleted: { $ne: true }
            }).select('_id');

            filter.$or = [
                { itemCode: regex },
                { productDescription: regex },
                ...(productMatches.length ? [{ partNo: { $in: productMatches.map(product => product._id) } }] : [])
            ];
        }

        const stockEntries = await StockEntry.find(filter)
            .populate('partNo', 'partNo itemCode productDescription productType unitOfMeasure')
            .populate('productSegment', 'departmentName')
            .populate('productCategory', 'categoryName')
            .populate('targetWarehouse', 'wareHouseName')
            .lean();

        const entryIds = stockEntries.map((entry: any) => entry._id);
        const now = new Date();
        const activeBlocks = entryIds.length
            ? await StockBlock.find({
                stockEntryId: { $in: entryIds },
                isDeleted: { $ne: true },
                toDate: { $gte: now }
            }).select('stockEntryId quantity').lean()
            : [];

        const blockedByEntryId = new Map<string, number>();
        activeBlocks.forEach((block: any) => {
            const entryId = block.stockEntryId?.toString();
            if (!entryId) return;
            blockedByEntryId.set(entryId, (blockedByEntryId.get(entryId) || 0) + (block.quantity || 0));
        });

        const reservationSums = await sumActiveReservationsByProductWarehouse(
            [...new Set(stockEntries.map((entry: any) => entry.partNo?._id?.toString() || entry.partNo?.toString()).filter(Boolean))],
            [...new Set(stockEntries.map((entry: any) => entry.targetWarehouse?._id?.toString() || entry.targetWarehouse?.toString()).filter(Boolean))]
        );

        const overviewByItemWarehouse = new Map<string, any>();
        stockEntries.forEach((entry: any) => {
            const productId = entry.partNo?._id?.toString() || entry.partNo?.toString() || 'unknown-product';
            const warehouseId = entry.targetWarehouse?._id?.toString() || entry.targetWarehouse?.toString() || 'unknown-warehouse';
            const key = `${productId}:${warehouseId}`;
            const blockedQuantity = blockedByEntryId.get(entry._id.toString()) || 0;
            const onHandQuantity = entry.isQuarantined ? 0 : (entry.quantity || 0);
            const quarantinedQuantity = entry.isQuarantined ? (entry.quantity || 0) : 0;
            const blockedReservedQuantity = entry.isQuarantined ? 0 : blockedQuantity;
            const stockValue = onHandQuantity * (entry.unitCost || 0);
            const quarantineValue = quarantinedQuantity * (entry.unitCost || 0);

            if (!overviewByItemWarehouse.has(key)) {
                overviewByItemWarehouse.set(key, {
                    productId,
                    warehouseId,
                    itemCode: entry.itemCode || entry.partNo?.itemCode || '',
                    partNo: entry.partNo?.partNo || '',
                    productDescription: entry.productDescription || entry.partNo?.productDescription || '',
                    productType: entry.partNo?.productType || '',
                    uom: entry.uom || entry.partNo?.unitOfMeasure || '',
                    productSegment: entry.productSegment?.departmentName || '',
                    productCategory: entry.productCategory?.categoryName || '',
                    warehouseName: entry.targetWarehouse?.wareHouseName || '',
                    onHandQuantity: 0,
                    blockedQuantity: 0,
                    reservationQuantity: 0,
                    reservedQuantity: 0,
                    availableQuantity: 0,
                    quarantinedQuantity: 0,
                    stockValue: 0,
                    quarantineValue: 0,
                    stockEntryCount: 0,
                    earliestStockDate: entry.dateOfPurchase || null,
                    latestStockDate: entry.dateOfPurchase || null
                });
            }

            const overview = overviewByItemWarehouse.get(key);
            overview.onHandQuantity += onHandQuantity;
            overview.blockedQuantity += blockedReservedQuantity;
            overview.quarantinedQuantity += quarantinedQuantity;
            overview.stockValue += stockValue;
            overview.quarantineValue += quarantineValue;
            overview.stockEntryCount += 1;

            if (entry.dateOfPurchase) {
                const entryDate = new Date(entry.dateOfPurchase);
                if (!overview.earliestStockDate || entryDate < new Date(overview.earliestStockDate)) {
                    overview.earliestStockDate = entry.dateOfPurchase;
                }
                if (!overview.latestStockDate || entryDate > new Date(overview.latestStockDate)) {
                    overview.latestStockDate = entry.dateOfPurchase;
                }
            }
        });

        let overviewRows = Array.from(overviewByItemWarehouse.values());
        overviewRows = overviewRows.map(row => {
            const reservationQuantity =
                (reservationSums.exact.get(`${row.productId}:${row.warehouseId}`) || 0) +
                (reservationSums.productOnly.get(row.productId) || 0);
            const reservedQuantity = (row.blockedQuantity || 0) + reservationQuantity;
            return {
                ...row,
                reservationQuantity,
                reservedQuantity,
                availableQuantity: Math.max(0, (row.onHandQuantity || 0) - reservedQuantity),
            };
        });
        if (lowStock === 'true') {
            overviewRows = overviewRows.filter(row => row.availableQuantity <= 0 || row.reservedQuantity > row.onHandQuantity);
        }

        overviewRows.sort((a, b) => {
            const warehouseCompare = (a.warehouseName || '').localeCompare(b.warehouseName || '');
            if (warehouseCompare !== 0) return warehouseCompare;
            return (a.partNo || a.itemCode || '').localeCompare(b.partNo || b.itemCode || '');
        });

        const pageNum = Math.max(parseInt(page as string, 10) || 1, 1);
        const rowNum = Math.max(parseInt(row as string, 10) || 10, 1);
        const total = overviewRows.length;
        const pagedRows = overviewRows.slice((pageNum - 1) * rowNum, pageNum * rowNum);

        return res.status(200).json({
            success: true,
            message: 'Stock overview fetched successfully',
            data: {
                overview: pagedRows,
                summary: {
                    totalItems: total,
                    totalOnHand: overviewRows.reduce((sum, item) => sum + item.onHandQuantity, 0),
                    totalReserved: overviewRows.reduce((sum, item) => sum + item.reservedQuantity, 0),
                    totalAvailable: overviewRows.reduce((sum, item) => sum + item.availableQuantity, 0),
                    totalQuarantined: overviewRows.reduce((sum, item) => sum + item.quarantinedQuantity, 0),
                    totalValue: overviewRows.reduce((sum, item) => sum + item.stockValue, 0),
                    exceptionCount: overviewRows.filter(item => item.availableQuantity <= 0 || item.reservedQuantity > item.onHandQuantity).length
                },
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
            .populate('dn', 'dnNo')
            .populate('grn', 'grnNo')
            .populate('createdBy', 'firstName lastName');
        
        if (!stockEntry) return res.status(404).json({ message: "Stock entry not found" });
        return res.status(200).json(stockEntry);
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const getInventoryPlanning = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { search = '', targetWarehouse } = req.query;
        const filter: any = { isDeleted: { $ne: true } };
        if (targetWarehouse && ObjectId.isValid(targetWarehouse as string)) {
            filter.targetWarehouse = new ObjectId(targetWarehouse as string);
        }

        const searchTerm = typeof search === 'string' ? search.trim() : '';
        if (searchTerm) {
            const regex = new RegExp(searchTerm, 'i');
            const products = await Product.find({
                $or: [{ partNo: regex }, { itemCode: regex }, { productDescription: regex }],
                isDeleted: { $ne: true },
            }).select('_id');
            filter.$or = [
                { itemCode: regex },
                { productDescription: regex },
                ...(products.length ? [{ partNo: { $in: products.map(product => product._id) } }] : []),
            ];
        }

        const stockEntries = await StockEntry.find(filter)
            .populate('partNo', 'partNo itemCode productDescription unitOfMeasure reorderPoint leadTimeDays')
            .populate('targetWarehouse', 'wareHouseName')
            .lean();

        const products = await Product.find({ isDeleted: { $ne: true } })
            .select('_id partNo itemCode productDescription unitOfMeasure reorderPoint leadTimeDays')
            .lean();

        const productById = new Map<string, any>();
        const productByPartNo = new Map<string, any>();
        const productByItemCode = new Map<string, any>();
        const productByDescription = new Map<string, any>();

        products.forEach((product: any) => {
            productById.set(product._id.toString(), product);
            const partNoKey = normalizePlanningKey(product.partNo);
            const itemCodeKey = normalizePlanningKey(product.itemCode);
            const descriptionKey = normalizePlanningKey(product.productDescription);
            if (partNoKey) productByPartNo.set(partNoKey, product);
            if (itemCodeKey) productByItemCode.set(itemCodeKey, product);
            if (descriptionKey) productByDescription.set(descriptionKey, product);
        });

        const resolveProduct = (value: any, description?: string, itemCode?: string) => {
            const objectId = value?._id || value;
            if (objectId && ObjectId.isValid(objectId.toString()) && productById.has(objectId.toString())) {
                return productById.get(objectId.toString());
            }

            const keys = [
                normalizePlanningKey(value?.partNo || value),
                normalizePlanningKey(itemCode),
                normalizePlanningKey(description),
            ].filter(Boolean);

            for (const key of keys) {
                const product = productByPartNo.get(key) || productByItemCode.get(key) || productByDescription.get(key);
                if (product) return product;
            }

            return null;
        };

        const entryIds = stockEntries.map((entry: any) => entry._id);
        const activeBlocks = entryIds.length ? await StockBlock.find({
            stockEntryId: { $in: entryIds },
            isDeleted: { $ne: true },
            toDate: { $gte: new Date() },
        }).select('stockEntryId quantity toDate customerName').lean() : [];

        const blockedByEntryId = new Map<string, number>();
        activeBlocks.forEach((block: any) => {
            const entryId = block.stockEntryId?.toString();
            if (entryId) blockedByEntryId.set(entryId, (blockedByEntryId.get(entryId) || 0) + (block.quantity || 0));
        });

        const reservationSums = await sumActiveReservationsByProductWarehouse(
            [...new Set(stockEntries.map((entry: any) => entry.partNo?._id?.toString()).filter(Boolean))],
            [...new Set(stockEntries.map((entry: any) => entry.targetWarehouse?._id?.toString()).filter(Boolean))]
        );

        const rows = new Map<string, any>();
        stockEntries.forEach((entry: any) => {
            const productId = entry.partNo?._id?.toString();
            const warehouseId = entry.targetWarehouse?._id?.toString();
            if (!productId || !warehouseId) return;
            const key = `${productId}:${warehouseId}`;
            if (!rows.has(key)) {
                rows.set(key, {
                    productId,
                    warehouseId,
                    itemCode: entry.itemCode || entry.partNo?.itemCode || '',
                    partNo: entry.partNo?.partNo || '',
                    productDescription: entry.productDescription || entry.partNo?.productDescription || '',
                    warehouseName: entry.targetWarehouse?.wareHouseName || '',
                    uom: entry.uom || entry.partNo?.unitOfMeasure || '',
                    onHandQuantity: 0,
                    blockedQuantity: 0,
                    reservationQuantity: 0,
                    availableNow: 0,
                    incomingQuantity: 0,
                    outgoingQuantity: 0,
                    canSellSoon: 0,
                    reorderPoint: entry.partNo?.reorderPoint || 0,
                    expectedArrivalDate: null,
                });
            }
            const row = rows.get(key);
            if (entry.isQuarantined) return;
            row.onHandQuantity += entry.quantity || 0;
            row.blockedQuantity += blockedByEntryId.get(entry._id.toString()) || 0;
        });

        products.forEach((product: any) => {
            const productId = product._id.toString();
            if ([...rows.values()].some(row => row.productId === productId)) return;
            if (searchTerm) {
                const regex = new RegExp(searchTerm, 'i');
                if (![product.partNo, product.itemCode, product.productDescription].some(value => regex.test(String(value || '')))) return;
            }
            rows.set(`${productId}:`, {
                productId,
                warehouseId: '',
                itemCode: product.itemCode || '',
                partNo: product.partNo || '',
                productDescription: product.productDescription || '',
                warehouseName: 'Unassigned',
                uom: product.unitOfMeasure || '',
                onHandQuantity: 0,
                blockedQuantity: 0,
                reservationQuantity: 0,
                availableNow: 0,
                incomingQuantity: 0,
                purchaseIncomingQuantity: 0,
                outgoingQuantity: 0,
                reservationOutgoingQuantity: 0,
                deliveryOutgoingQuantity: 0,
                dealOutgoingQuantity: 0,
                canSellSoon: 0,
                reorderPoint: product.reorderPoint || 0,
                expectedArrivalDate: null,
            });
        });

        const receivedByPoProduct = new Map<string, number>();
        const grns = await GRN.find({ isDeleted: { $ne: true } })
            .select('purchaseOrderId items')
            .lean();
        grns.forEach((grn: any) => {
            grn.items?.forEach((item: any) => {
                const product = resolveProduct(item.partNo, item.itemDescription);
                const poId = grn.purchaseOrderId?.toString();
                if (!product || !poId) return;
                addPlanningQuantity(receivedByPoProduct, `${poId}:${product._id.toString()}`, item.acceptedQty || item.receivedQty || 0);
            });
        });

        const openPurchaseOrders = await PurchaseOrder.find({ poStatus: 'Approved' })
            .select('poNo poDate etaTerms items')
            .lean();
        openPurchaseOrders.forEach((po: any) => {
            po.items?.forEach((item: any) => {
                const product = resolveProduct(item.partNo, item.detail);
                if (!product) return;
                const productId = product._id.toString();
                const orderedQuantity = Number(item.quantity) || 0;
                const receivedQuantity = receivedByPoProduct.get(`${po._id.toString()}:${productId}`) || 0;
                const pendingQuantity = Math.max(0, orderedQuantity - receivedQuantity);
                if (!pendingQuantity) return;

                const row = rows.get(`${productId}:`) || Array.from(rows.values()).find(existing => existing.productId === productId);
                if (!row) return;

                row.incomingQuantity += pendingQuantity;
                row.purchaseIncomingQuantity += pendingQuantity;
                row.expectedArrivalDate = row.expectedArrivalDate || po.poDate || null;
            });
        });

        const deliveryOutgoingByProduct = new Map<string, number>();
        const deliveryNotes = await DeliveryNote.find({ status: { $nin: ['Cancelled', 'Rejected'] } })
            .select('items')
            .lean();
        deliveryNotes.forEach((deliveryNote: any) => {
            deliveryNote.items?.forEach((item: any) => {
                if (item.isInventoryItem === false) return;
                const product = resolveProduct(item.partNo, item.description);
                if (!product) return;
                const pendingQuantity = Math.max(0, (Number(item.orderedQty) || 0) - (Number(item.deliveredQty) || 0));
                addPlanningQuantity(deliveryOutgoingByProduct, product._id.toString(), pendingQuantity);
            });
        });

        const deliveredByItemId = new Map<string, number>();
        deliveryNotes.forEach((deliveryNote: any) => {
            deliveryNote.items?.forEach((item: any) => {
                if (!item.itemId) return;
                addPlanningQuantity(deliveredByItemId, String(item.itemId), Number(item.currentDeliveryQty) || Number(item.deliveredQty) || 0);
            });
        });

        const approvedDeals = await Quotation.find({
            isDeleted: { $ne: true },
            'dealData.status': 'approved',
        }).select('dealData.updatedItems').lean();

        const dealOutgoingByProduct = new Map<string, number>();
        approvedDeals.forEach((quote: any) => {
            quote.dealData?.updatedItems?.forEach((item: any) => {
                item.itemDetails?.forEach((detail: any) => {
                    if (detail.dealSelected === false) return;
                    const product = resolveProduct(detail.partNo, detail.detail, detail.itemCode);
                    if (!product) return;
                    const quotedQuantity = Number(detail.quantity) || 0;
                    const deliveredQuantity = detail._id ? (deliveredByItemId.get(detail._id.toString()) || 0) : 0;
                    const pendingQuantity = Math.max(0, quotedQuantity - deliveredQuantity);
                    addPlanningQuantity(dealOutgoingByProduct, product._id.toString(), pendingQuantity);
                });
            });
        });

        const planning = Array.from(rows.values()).map(row => {
            row.reservationQuantity = (reservationSums.exact.get(`${row.productId}:${row.warehouseId}`) || 0) + (reservationSums.productOnly.get(row.productId) || 0);
            row.reservationOutgoingQuantity = row.blockedQuantity + row.reservationQuantity;
            row.deliveryOutgoingQuantity = deliveryOutgoingByProduct.get(row.productId) || 0;
            row.dealOutgoingQuantity = Math.max(0, (dealOutgoingByProduct.get(row.productId) || 0) - row.deliveryOutgoingQuantity);
            row.outgoingQuantity = row.reservationOutgoingQuantity + row.deliveryOutgoingQuantity + row.dealOutgoingQuantity;
            row.availableNow = Math.max(0, row.onHandQuantity - row.outgoingQuantity);
            row.canSellSoon = row.availableNow + row.incomingQuantity;
            return row;
        });

        return res.status(200).json({
            success: true,
            message: 'Inventory planning fetched successfully',
            data: planning,
        });
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const getStockMovements = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { product, warehouse, limit = '100' } = req.query;
        const filter: any = { isDeleted: { $ne: true } };
        if (product && ObjectId.isValid(product as string)) filter.product = new ObjectId(product as string);
        if (warehouse && ObjectId.isValid(warehouse as string)) filter.warehouse = new ObjectId(warehouse as string);

        const movements = await StockMovement.find(filter)
            .populate('product', 'partNo itemCode productDescription')
            .populate('warehouse', 'wareHouseName')
            .populate('createdBy', 'firstName lastName')
            .sort({ movementDate: -1, createdDate: -1 })
            .limit(Math.min(Math.max(parseInt(limit as string, 10) || 100, 1), 500))
            .lean();

        return res.status(200).json({ success: true, message: 'Stock movements fetched successfully', data: movements });
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const getStockReservations = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status = 'Active' } = req.query;
        const filter: any = { isDeleted: { $ne: true } };
        if (status) filter.status = status;
        const reservations = await StockReservation.find(filter)
            .populate('product', 'partNo itemCode productDescription')
            .populate('warehouse', 'wareHouseName')
            .populate('quote', 'quoteId subject')
            .populate('customer', 'customerName')
            .populate('createdBy', 'firstName lastName')
            .sort({ expiresAt: 1, createdDate: -1 })
            .lean();
        return res.status(200).json({ success: true, message: 'Stock reservations fetched successfully', data: reservations });
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const createStockReservation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data: any = req.body;
        const employee = await getEmployeeData((req as any).user);
        if (!employee) return res.status(401).json({ message: 'Unauthorized' });
        if (!data.product || !ObjectId.isValid(data.product) || !data.quantity || !data.expiresAt) {
            return res.status(400).json({ message: 'Product, quantity and expiry are required' });
        }
        if (data.warehouse && !ObjectId.isValid(data.warehouse)) {
            return res.status(400).json({ message: 'Invalid warehouse id' });
        }

        const reservation = await StockReservation.create({
            product: data.product,
            warehouse: data.warehouse || undefined,
            quote: data.quote || undefined,
            deal: data.deal || undefined,
            job: data.job || undefined,
            customer: data.customer || undefined,
            project: data.project || undefined,
            sourceType: data.sourceType || 'Manual',
            sourceRef: data.sourceRef || data.quote || data.deal || data.job || data.project || undefined,
            quantity: data.quantity,
            reservedFrom: data.reservedFrom || new Date(),
            expiresAt: data.expiresAt,
            status: 'Active',
            createdBy: employee._id,
            createdDate: new Date(),
            updatedDate: new Date(),
            isDeleted: false,
        });

        await StockMovement.create({
            product: reservation.product,
            warehouse: reservation.warehouse,
            movementType: 'Reservation',
            reservedQuantity: reservation.quantity,
            referenceType: reservation.sourceType,
            referenceId: reservation.sourceRef || reservation._id,
            remarks: `Reserved until ${reservation.expiresAt.toISOString()}`,
            movementDate: new Date(),
            createdBy: employee._id,
            createdDate: new Date(),
        });

        return res.status(201).json({ success: true, message: 'Reservation created successfully', data: reservation });
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const releaseStockReservation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { releaseReason = 'Released manually' } = req.body;
        const employee = await getEmployeeData((req as any).user);
        if (!employee) return res.status(401).json({ message: 'Unauthorized' });
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid reservation id' });

        const reservation = await StockReservation.findOneAndUpdate(
            { _id: id, isDeleted: { $ne: true }, status: 'Active' },
            {
                status: 'Released',
                releaseReason,
                releasedAt: new Date(),
                releasedBy: employee._id,
                updatedDate: new Date(),
            },
            { new: true }
        );
        if (!reservation) return res.status(404).json({ message: 'Active reservation not found' });

        await StockMovement.create({
            product: reservation.product,
            warehouse: reservation.warehouse,
            movementType: 'Release',
            reservedQuantity: reservation.quantity,
            referenceType: reservation.sourceType,
            referenceId: reservation.sourceRef || reservation._id,
            remarks: releaseReason,
            movementDate: new Date(),
            createdBy: employee._id,
            createdDate: new Date(),
        });

        return res.status(200).json({ success: true, message: 'Reservation released successfully', data: reservation });
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

        const existingEntry = await StockEntry.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!existingEntry) return res.status(404).json({ message: "Stock entry not found" });
        if (existingEntry.isQuarantined) return res.status(400).json({ message: "Quarantined stock entries cannot be edited. Release from quarantine first." });

        const refChecks: Promise<any>[] = [];
        if (data.partNo) refChecks.push(Product.findById(data.partNo));
        if (data.supplierName) refChecks.push(Supplier.findById(data.supplierName));
        if (data.productSegment) refChecks.push(Department.findById(data.productSegment));
        if (data.productCategory) refChecks.push(ProductCategory.findById(data.productCategory));
        if (data.targetWarehouse) refChecks.push(Warehouse.findById(data.targetWarehouse));
        if (data.jobId) {
            refChecks.push(jobModel.findById(data.jobId));
        }

        let partNoProduct: any = null;
        if (refChecks.length) {
            const checks = await Promise.all(refChecks);
            if (checks.some((c) => !c)) return res.status(400).json({ message: "Invalid references provided" });
            if (data.partNo) partNoProduct = checks[0];
        }

        const employee = await getEmployeeData(token);
        if (!employee) return res.status(401).json({ message: "Unauthorized" });

        const updated = await StockEntry.findOneAndUpdate(
            { _id: id, isDeleted: { $ne: true } },
            {
                $set: {
                    ...(data.grn ? { grn: data.grn } : {}),
                    ...(data.partNo ? { partNo: data.partNo } : {}),
                    ...(data.itemCode !== undefined ? { itemCode: data.itemCode?.trim() || null } : (partNoProduct?.itemCode ? { itemCode: partNoProduct.itemCode } : {})),
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
            .populate('dn', 'dnNo')
            .populate('grn', 'grnNo')
            .populate('createdBy', 'firstName lastName');

        if (!updated) return res.status(404).json({ message: "Stock entry not found" });

        if (data.quantity !== undefined && data.quantity !== existingEntry.quantity) {
            const delta = data.quantity - existingEntry.quantity;
            await StockMovement.create({
                product: updated.partNo,
                warehouse: updated.targetWarehouse,
                stockEntry: updated._id,
                movementType: 'Adjustment',
                quantityIn: delta > 0 ? delta : 0,
                quantityOut: delta < 0 ? Math.abs(delta) : 0,
                reservedQuantity: 0,
                referenceType: updated.grn ? 'GRN' : 'Manual Stock Entry',
                referenceId: updated.grn || updated._id,
                remarks: `Quantity adjusted from ${existingEntry.quantity} to ${data.quantity}`,
                movementDate: new Date(),
                createdBy: employee._id,
                createdDate: new Date(),
            });
        }

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

        const existing = await StockEntry.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!existing) return res.status(404).json({ message: "Stock entry not found or already deleted" });

        const deleted = await StockEntry.findOneAndUpdate(
            { _id: id, isDeleted: { $ne: true } },
            { $set: { isDeleted: true } },
            { new: true }
        );

        if (!deleted) return res.status(404).json({ message: "Stock entry not found or already deleted" });

        const employee = await getEmployeeData((req as any).user);
        await StockMovement.create({
            product: deleted.partNo,
            warehouse: deleted.targetWarehouse,
            stockEntry: deleted._id,
            movementType: 'Adjustment',
            quantityIn: 0,
            quantityOut: deleted.quantity,
            reservedQuantity: 0,
            referenceType: deleted.grn ? 'GRN' : 'Manual Stock Entry',
            referenceId: deleted.grn || deleted._id,
            remarks: 'Stock entry deleted',
            movementDate: new Date(),
            createdBy: employee?._id,
            createdDate: new Date(),
        });

        return res.status(200).json({ success: true, message: "Stock entry deleted" });
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const releaseFromQuarantine = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ success: false, message: "Invalid id" });

        const tokenData = (req as any).user;
        const employee = await getEmployeeData(tokenData);
        if (!employee) {
            return res.status(401).json({ success: false, message: "Employee not found" });
        }

        const stockEntry = await StockEntry.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!stockEntry) {
            return res.status(404).json({ success: false, message: "Stock entry not found" });
        }

        if (!stockEntry.isQuarantined) {
            return res.status(400).json({ success: false, message: "Stock entry is not quarantined" });
        }

        const linkedStockHold = await StockHold.findOne({
            stockEntryId: stockEntry._id,
            isDeleted: { $ne: true }
        }).select('status').lean();

        if (linkedStockHold && !['Resolved', 'Disposed'].includes(linkedStockHold.status)) {
            return res.status(400).json({ success: false, message: "Cannot release from hold: the linked stock hold is not resolved" });
        }

        stockEntry.isQuarantined = false;
        stockEntry.quarantineReleasedAt = new Date();
        stockEntry.quarantineReleasedBy = employee._id;
        stockEntry.updatedDate = new Date();
        await stockEntry.save();

        await StockMovement.create({
            product: stockEntry.partNo,
            warehouse: stockEntry.targetWarehouse,
            stockEntry: stockEntry._id,
            movementType: 'Release',
            quantityIn: 0,
            quantityOut: 0,
            reservedQuantity: 0,
            referenceType: stockEntry.grn ? 'GRN' : 'Manual Stock Entry',
            referenceId: stockEntry.grn || stockEntry._id,
            remarks: 'Released from quarantine',
            movementDate: new Date(),
            createdBy: employee._id,
            createdDate: new Date(),
        });

        return res.status(200).json({ success: true, message: "Stock entry released from quarantine", data: stockEntry });
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

        await StockMovement.create({
            product: stockEntry.partNo,
            warehouse: stockEntry.targetWarehouse,
            stockEntry: stockEntry._id,
            movementType: 'Reservation',
            reservedQuantity: stockBlock.quantity,
            referenceType: 'Stock Block',
            referenceId: stockBlock._id,
            remarks: `Blocked for ${stockBlock.customerName.trim()} (${stockBlock.salesPersonName.trim()})`,
            movementDate: new Date(),
            createdBy: employee._id,
            createdDate: new Date(),
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
