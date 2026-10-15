import { NextFunction, Request, Response } from 'express';
import Supplier, { supplierStatus } from '../models/supplier.model';
import MasterListItemModel from '../models/masterListItem.model';
import { Types } from 'mongoose';
import Product from '../models/products.model';
import { deleteFileFromAws, uploadFileToAws } from '../common/aws-connect';
import { PipelineStage } from 'mongoose';
import { getEmployeeData, buildPrivilegeAccessFilter, escapeRegex } from '../common/utils/util';
import { findSupplierDuplicates, supplierContactPoints, supplierKeys } from '../common/utils/partyMatch';
import { Server } from 'socket.io';
import { createNotificationWithPrivileges } from './notification.controller';
import { getNextSequence } from '../models/counter.model';


const MAX_PAGE_SIZE = 5000;

/** Grid sort keys the suppliers list may sort by, mapped to the aggregated document field. */
const SUPPLIER_SORT_FIELDS: Record<string, string> = {
   supplierId: 'supplierId',
   supplierName: 'supplierName',
   supplierType: 'supplierType',
   status: 'status',
   creditDays: 'creditDays',
   creditValue: 'creditValue',
   createdDate: 'createdDate',
   category: 'categoryInfo.label',
   location: 'address.location',
};

/** Grid filter keys -> document path, and whether the path only exists after the category lookup. */
const SUPPLIER_FILTER_FIELDS: Record<string, { path: string; type: 'text' | 'number'; post?: boolean }> = {
   supplierId: { path: 'supplierId', type: 'text' },
   supplierName: { path: 'supplierName', type: 'text' },
   supplierType: { path: 'supplierType', type: 'text' },
   status: { path: 'status', type: 'text' },
   location: { path: 'address.location', type: 'text' },
   categoryName: { path: 'categoryInfo.label', type: 'text', post: true },
   creditDays: { path: 'creditDays', type: 'number' },
   creditValue: { path: 'creditValue', type: 'number' },
};

/** Turns the data-grid's filter chips into Mongo conditions. Unknown keys/operators are ignored. */
const buildSupplierColumnFilters = (columnFilters: any): { preMatch: Record<string, any>; postMatch: Record<string, any> } => {
   const pre: Record<string, any>[] = [];
   const post: Record<string, any>[] = [];
   if (Array.isArray(columnFilters)) {
      for (const f of columnFilters) {
         const def = SUPPLIER_FILTER_FIELDS[f?.key];
         if (!def) continue;
         const target = def.post ? post : pre;
         const value = f.value;
         if (f.op === 'empty') {
            target.push({ $or: [{ [def.path]: null }, { [def.path]: '' }, { [def.path]: { $exists: false } }] });
            continue;
         }
         if (value === undefined || value === null || String(value).trim() === '') continue;
         if (def.type === 'number') {
            const n = Number(value);
            if (isNaN(n)) continue;
            if (f.op === 'gt') target.push({ [def.path]: { $gt: n } });
            else if (f.op === 'lt') target.push({ [def.path]: { $lt: n } });
            else if (f.op === 'isNot') target.push({ [def.path]: { $ne: n } });
            else target.push({ [def.path]: n });
            continue;
         }
         const text = escapeRegex(String(value).trim());
         switch (f.op) {
            case 'is': case 'eq': target.push({ [def.path]: { $regex: `^${text}$`, $options: 'i' } }); break;
            case 'isNot': target.push({ [def.path]: { $not: { $regex: `^${text}$`, $options: 'i' } } }); break;
            case 'notContains': target.push({ [def.path]: { $not: { $regex: text, $options: 'i' } } }); break;
            default: target.push({ [def.path]: { $regex: text, $options: 'i' } });
         }
      }
   }
   return {
      preMatch: pre.length ? { $and: pre } : {},
      postMatch: post.length ? { $and: post } : {},
   };
};

export const getSuppliers = async (req: Request, res: Response) => {
   try {
      let { page = 1, row = 10, toDate, fromDate, status, category, supplierType, supplierName, search, location, productName } = req.body;

      const tokenData = req.user;
      const employee = await getEmployeeData(tokenData);
      if (!employee) {
         return res.status(401).json({
            success: false,
            message: "Employee not found",
         });
      }

      const privileges = employee.category?.privileges;
      const accessFilter = privileges?.supplier?.viewReport 
         ? await buildPrivilegeAccessFilter(employee._id, privileges.supplier.viewReport, 'createdBy')
         : {};

      // Convert string page and row to numbers, falling back to safe values for junk input
      page = parseInt(String(page), 10);
      row = parseInt(String(row), 10);
      if (!Number.isFinite(page) || page < 1) page = 1;
      if (!Number.isFinite(row) || row < 1) row = 10;
      row = Math.min(row, MAX_PAGE_SIZE);

      const { filters: columnFilters, sortKey, sortDir } = req.body;

      // Calculate skip value for pagination
      const skip = (page - 1) * row;

      // Build filter object
      const filter: Record<string, any> = { 
         isDeleted: false,
         ...accessFilter
      };

      // Add date range filter if provided
      if (fromDate || toDate) {
         filter.createdDate = {};
         const start = fromDate ? new Date(fromDate) : null;
         const end = toDate ? new Date(toDate) : null;
         if ((start && isNaN(start.getTime())) || (end && isNaN(end.getTime()))) {
            return res.status(400).json({ success: false, message: 'Invalid date range' });
         }
         if (start) {
            filter.createdDate.$gte = start;
         }
         if (end) {
            // Set time to end of day for toDate
            end.setHours(23, 59, 59, 999);
            filter.createdDate.$lte = end;
         }
      }

      // Add status filter if provided
      if (status) {
         // Handle both single status and array of statuses. "Blocked" is not a stored status: the list
         // shows it in the Status column for blocked suppliers, so it filters on isBlocked.
         const statuses: string[] = Array.isArray(status) ? status : [status];
         const stored = statuses.filter((s) => s !== 'Blocked');
         const wantsBlocked = stored.length !== statuses.length;
         if (wantsBlocked && stored.length) {
            filter.$or = [{ status: { $in: stored } }, { isBlocked: true }];
         } else if (wantsBlocked) {
            filter.isBlocked = true;
         } else {
            filter.status = Array.isArray(status) ? { $in: status } : status;
         }
      }

      // Add category filter if provided (now it's an ObjectId)
      if (category) {
         if (!Types.ObjectId.isValid(category)) {
            return res.status(400).json({ success: false, message: 'Invalid category' });
         }
         filter.category = new Types.ObjectId(category);
      }

      // Add supplierType filter if provided
      if (supplierType) {
         filter.supplierType = supplierType;
      }

      const andClauses: Record<string, any>[] = [];

      // Add supplierName filter if provided (search parameter maps to supplierName)
      const searchTerm = String(search || supplierName || '').trim();
      if (searchTerm) {
         const pattern = { $regex: escapeRegex(searchTerm), $options: 'i' };
         andClauses.push({ $or: [{ supplierName: pattern }, { supplierId: pattern }] });
      }

      // Grid column filters (whitelisted keys only)
      const { preMatch, postMatch } = buildSupplierColumnFilters(columnFilters);
      if (Object.keys(preMatch).length) andClauses.push(preMatch);
      if (andClauses.length) filter.$and = andClauses;

      // Add location filter if provided
      if (location) {
         filter['address.location'] = { $regex: escapeRegex(String(location)), $options: 'i' };
      }

      // Add productName filter if provided
      if (productName) {
         filter['products.productName'] = { $regex: escapeRegex(String(productName)), $options: 'i' };
      }

      // Cheap stages first (match, category lookup, sort, page), heavy lookups only on the page.
      const categoryStages: PipelineStage[] = [
         {
            $lookup: {
               from: MasterListItemModel.collection.name,
               localField: 'category',
               foreignField: '_id',
               as: 'categoryDetails'
            }
         },
         { $addFields: { categoryInfo: { $arrayElemAt: ["$categoryDetails", 0] } } },
      ];
      const postMatchStages: PipelineStage[] = Object.keys(postMatch).length ? [{ $match: postMatch }] : [];

      const sortField = SUPPLIER_SORT_FIELDS[String(sortKey)];
      const sortSpec: Record<string, 1 | -1> = {};
      if (sortField) sortSpec[sortField] = sortDir === 'desc' ? -1 : 1;
      if (!(sortField in sortSpec)) sortSpec.createdDate = -1;
      else if (sortField !== 'createdDate') sortSpec.createdDate = -1;
      sortSpec._id = 1;
      const sortStage: PipelineStage = { $sort: sortSpec };

      const aggregationPipeline: PipelineStage[] = [
         { $match: filter },
         ...categoryStages,
         ...postMatchStages,
         sortStage,
         { $skip: skip },
         { $limit: row },
         {
            $lookup: {
               from: 'employees', // createdBy references 'Employee'
               localField: 'createdBy',
               foreignField: '_id',
               as: 'createdByDepartment'
            }
         },
         {
            $lookup: {
               from: 'employees',
               localField: 'approvedHistory.approvedBy',
               foreignField: '_id',
               as: 'approvedByEmployee'
            }
         },
         {
            $lookup: {
               from: 'employees',
               localField: 'rejectHistory.rejectedBy',
               foreignField: '_id',
               as: 'rejectedByEmployee'
            }
         },
         {
            $lookup: {
               from: 'purchaseorders',
               localField: '_id',
               foreignField: 'supplierId',
               as: 'purchaseOrders'
            }
         },
         {
            $addFields: {
               createdByInfo: { $arrayElemAt: ["$createdByDepartment", 0] },
               hasOrders: { $gt: [{ $size: "$purchaseOrders" }, 0] },
               approvedHistory: {
                  $map: {
                     input: "$approvedHistory",
                     as: "history",
                     in: {
                        $mergeObjects: [
                           "$$history",
                           {
                              approvedBy: {
                                 $arrayElemAt: [
                                    {
                                       $filter: {
                                          input: "$approvedByEmployee",
                                          as: "emp",
                                          cond: { $eq: ["$$emp._id", "$$history.approvedBy"] }
                                       }
                                    },
                                    0
                                 ]
                              }
                           }
                        ]
                     }
                  }
               },
               rejectHistory: {
                  $map: {
                     input: "$rejectHistory",
                     as: "history",
                     in: {
                        $mergeObjects: [
                           "$$history",
                           {
                              rejectedBy: {
                                 $arrayElemAt: [
                                    {
                                       $filter: {
                                          input: "$rejectedByEmployee",
                                          as: "emp",
                                          cond: { $eq: ["$$emp._id", "$$history.rejectedBy"] }
                                       }
                                    },
                                    0
                                 ]
                              }
                           }
                        ]
                     }
                  }
               }
            }
         },
         // Products are managed in the product catalogue; a supplier's list is the catalogue items
         // that name it as their default vendor.
         {
            $lookup: {
               from: Product.collection.name,
               let: { supplierId: "$_id" },
               pipeline: [
                  { $match: { $expr: { $eq: ["$defaultVendor", "$$supplierId"] }, isDeleted: { $ne: true } } },
                  { $project: { _id: 1, itemCode: 1, productDescription: 1, unitOfMeasure: 1, price: "$estimatedCost" } },
                  { $sort: { itemCode: 1 } },
               ],
               as: "catalogueProducts",
            }
         },
         {
            $project: {
               supplierId: 1,
               supplierName: 1,
               address: 1,
               addresses: 1,
               supplierType: 1,
               category: "$categoryInfo",
               contactDetails: 1,
               contacts: 1,
               companyEmail: 1,
               companyPhone: 1,
               website: 1,
               bankDetails: 1,
               bankAccounts: 1,
               documents: 1,
               status: 1,
               isBlocked: 1,
               hasOrders: 1,
               products: "$catalogueProducts",
               creditDays: 1,
               creditValue: 1,
               createdDate: 1,
               updatedDate: 1,
               createdBy: "$createdByInfo",
               approvedHistory: 1,
               rejectHistory: 1,
               blockHistory: 1
            }
         },
      ];

      // Count with the same filters (the category-name filter needs the lookup)
      const countPipeline: PipelineStage[] = [
         { $match: filter },
         ...(postMatchStages.length ? [...categoryStages, ...postMatchStages] : []),
         { $count: 'total' },
      ];
      const [countResult] = await Supplier.aggregate(countPipeline).collation({ locale: 'en' }).exec();
      const totalDocs: number = countResult?.total ?? 0;

      // Execute aggregation pipeline (case-insensitive, natural ordering for text sorts)
      const suppliersData = await Supplier.aggregate(aggregationPipeline).collation({ locale: 'en' }).exec();

      // Calculate pagination metadata
      const totalPages = Math.ceil(totalDocs / row);

      return res.status(200).json({
         success: true,
         message: 'Suppliers fetched successfully',
         data: {
            suppliers: suppliersData,
            pagination: {
               total: totalDocs,
               page,
               pages: totalPages,
               limit: row
            }
         }
      });
   } catch (error) {
      console.error('Error fetching suppliers:', error);
      return res.status(500).json({
         success: false,
         message: 'Error fetching suppliers',
         error: error instanceof Error ? error.message : 'Unknown error',
      });
   }
}

/** Report aggregate: status counts and approved credit limit, overall and grouped by category / supplier type. */
export const getSupplierReportSummary = async (req: Request, res: Response) => {
   try {
      const { toDate, fromDate, category, supplierType } = req.body;

      const employee = await getEmployeeData(req.user);
      if (!employee) {
         return res.status(401).json({ success: false, message: "Employee not found" });
      }

      const privileges = employee.category?.privileges;
      const accessFilter = privileges?.supplier?.viewReport
         ? await buildPrivilegeAccessFilter(employee._id, privileges.supplier.viewReport, 'createdBy')
         : {};

      const filter: Record<string, any> = { isDeleted: false, ...accessFilter };

      if (fromDate || toDate) {
         const start = fromDate ? new Date(fromDate) : null;
         const end = toDate ? new Date(toDate) : null;
         if ((start && isNaN(start.getTime())) || (end && isNaN(end.getTime()))) {
            return res.status(400).json({ success: false, message: 'Invalid date range' });
         }
         filter.createdDate = {};
         if (start) filter.createdDate.$gte = start;
         if (end) {
            end.setHours(23, 59, 59, 999);
            filter.createdDate.$lte = end;
         }
      }
      if (category) {
         if (!Types.ObjectId.isValid(category)) {
            return res.status(400).json({ success: false, message: 'Invalid category' });
         }
         filter.category = new Types.ObjectId(category);
      }
      if (supplierType) filter.supplierType = String(supplierType);

      const counters = {
         total: { $sum: 1 },
         pending: { $sum: { $cond: [{ $eq: ['$status', supplierStatus.pending] }, 1, 0] } },
         approved: { $sum: { $cond: [{ $eq: ['$status', supplierStatus.approved] }, 1, 0] } },
         rejected: { $sum: { $cond: [{ $eq: ['$status', supplierStatus.rejected] }, 1, 0] } },
         creditValue: { $sum: { $cond: [{ $eq: ['$status', supplierStatus.approved] }, { $ifNull: ['$creditValue', 0] }, 0] } },
      };

      const [result] = await Supplier.aggregate([
         { $match: filter },
         {
            $facet: {
               totals: [{ $group: { _id: null, ...counters } }],
               byCategory: [
                  { $group: { _id: '$category', ...counters } },
                  { $lookup: { from: MasterListItemModel.collection.name, localField: '_id', foreignField: '_id', as: 'dept' } },
                  { $addFields: { name: { $arrayElemAt: ['$dept.label', 0] } } },
                  { $project: { dept: 0 } },
               ],
               byType: [{ $group: { _id: '$supplierType', ...counters } }],
            },
         },
      ]);

      const empty = { total: 0, pending: 0, approved: 0, rejected: 0, creditValue: 0 };
      const toRow = (r: any) => ({
         id: r._id ? String(r._id) : 'unassigned',
         name: r.name || (r._id && typeof r._id === 'string' ? r._id : 'Unassigned'),
         total: r.total, pending: r.pending, approved: r.approved, rejected: r.rejected, creditValue: r.creditValue,
      });

      return res.status(200).json({
         success: true,
         data: {
            totals: result?.totals?.[0] ? { ...empty, ...result.totals[0], _id: undefined } : empty,
            byCategory: (result?.byCategory || []).map(toRow),
            bySupplierType: (result?.byType || []).map(toRow),
         },
      });
   } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
   }
};

/** Live check for the supplier form: `?supplierName=&email=&phone=&iban=&excludeId=`. */
export const checkSupplierDuplicate = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const q = req.query;
      const matches = await findSupplierDuplicates({
         supplierName: String(q.supplierName ?? ''),
         emails: [].concat(q.email as any ?? []).map(String),
         phones: [].concat(q.phone as any ?? []).map(String),
         ibans: [].concat(q.iban as any ?? []).map(String),
         excludeId: q.excludeId ? String(q.excludeId) : undefined,
      });
      return res.status(200).json({ matches });
   } catch (error) {
      console.error(error);
      next(error);
   }
};

type SupplierContactInput = { name?: string; email?: string; phoneNumber?: string; designation?: string; isPrimary?: boolean };

/** Cleans the contact list and returns it with its primary contact, which also fills the legacy `contactDetails`. */
const normalizeSupplierContacts = (rawContacts: unknown, legacy?: SupplierContactInput) => {
   const source: SupplierContactInput[] = Array.isArray(rawContacts) && rawContacts.length ? rawContacts : legacy ? [legacy] : [];
   const contacts = source.map((c) => ({
      name: String(c?.name ?? '').trim(),
      email: String(c?.email ?? '').trim(),
      phoneNumber: String(c?.phoneNumber ?? '').trim(),
      designation: String(c?.designation ?? '').trim(),
      isPrimary: !!c?.isPrimary,
   }));
   if (!contacts.length || contacts.some((c) => !c.name || !c.email || !c.phoneNumber)) return null;
   const primaryIndex = Math.max(0, contacts.findIndex((c) => c.isPrimary));
   contacts.forEach((c, i) => { c.isPrimary = i === primaryIndex; });
   const { name, email, phoneNumber } = contacts[primaryIndex];
   return { contacts, contactDetails: { name, email, phoneNumber } };
};

/** Cleans the address list; the first address also fills the legacy `address`. */
const normalizeSupplierAddresses = (rawAddresses: unknown, legacy?: Record<string, any>) => {
   const source: Record<string, any>[] = Array.isArray(rawAddresses) && rawAddresses.length ? rawAddresses : legacy ? [legacy] : [];
   const fields = ['label', 'streetNo', 'buildingNo', 'zoneNo', 'poBox', 'city', 'location'];
   const addresses = source.map((a): Record<string, any> => ({ ...Object.fromEntries(fields.map((f) => [f, String(a?.[f] ?? "").trim()])), isPrimary: !!a?.isPrimary }));
   if (!addresses.length || addresses.some((a) => !a.location)) return null;
   const primaryIndex = Math.max(0, addresses.findIndex((a) => a.isPrimary));
   addresses.forEach((a, i) => { a.isPrimary = i === primaryIndex; });
   return { addresses, address: addresses[primaryIndex] };
};

/**
 * Cleans the bank account list; the primary account also fills the legacy `bankDetails`.
 * `undefined` = not supplied (leave as is), `null` = every account removed.
 */
const normalizeBankAccounts = (rawAccounts: unknown, legacy?: Record<string, any> | null) => {
   if (rawAccounts === undefined && legacy === undefined) return undefined;
   const source: Record<string, any>[] = Array.isArray(rawAccounts) ? rawAccounts : legacy ? [legacy] : [];
   const fields = ['bankName', 'branch', 'accountName', 'accountNumber', 'iban', 'swiftCode', 'currency', 'bankCountry', 'bankAddress'];
   const bankAccounts = source
      .map((b): Record<string, any> => ({ ...Object.fromEntries(fields.map((f) => [f, String(b?.[f] ?? '').trim()])), isPrimary: !!b?.isPrimary }))
      .filter((b) => fields.some((f) => (b as any)[f]));
   if (!bankAccounts.length) return null;
   const primaryIndex = Math.max(0, bankAccounts.findIndex((b) => b.isPrimary));
   bankAccounts.forEach((b, i) => { b.isPrimary = i === primaryIndex; });
   return { bankAccounts, bankDetails: bankAccounts[primaryIndex] };
};

/** Accounts already stored on a supplier, falling back to the single legacy record. */
const storedBankAccounts = (s: any): any[] =>
   s.bankAccounts?.length ? s.bankAccounts : s.bankDetails ? [s.bankDetails] : [];

export const createSupplier = async (req: Request, res: Response) => {
   try {
      const tokenData = req.user;
      const employee = await getEmployeeData(tokenData);
      const {
         supplierName,
         address: legacyAddress,
         addresses: rawAddresses,
         supplierType,
         category,
         contactDetails: legacyContact,
         contacts: rawContacts,
         companyEmail: rawCompanyEmail,
         companyPhone: rawCompanyPhone,
         website: rawWebsite,
         bankDetails: legacyBank,
         bankAccounts: rawBankAccounts,
         products,
         creditDays,
         creditValue,
         confirmDuplicates,
      } = JSON.parse(req.body.supplier);

      const contactSet = normalizeSupplierContacts(rawContacts, legacyContact);
      const addressSet = normalizeSupplierAddresses(rawAddresses, legacyAddress);
      const bankSet = normalizeBankAccounts(rawBankAccounts, legacyBank);

      // Validate required fields
      if (!supplierName || !supplierType || !category || !contactSet || !addressSet) {
         return res.status(400).json({
            success: false,
            message: 'Please provide all required fields',
         });
      }
      const { contactDetails, contacts } = contactSet;
      const companyEmail = String(rawCompanyEmail ?? '').trim();
      const companyPhone = String(rawCompanyPhone ?? '').trim();
      const website = String(rawWebsite ?? '').trim();
      const { address, addresses } = addressSet;

      // The creator is always the authenticated employee, never a client-supplied id.
      const creatorId = employee?._id;
      if (!creatorId || !Types.ObjectId.isValid(creatorId)) {
         return res.status(401).json({
            success: false,
            message: 'Employee not found',
         });
      }

      if (typeof supplierName !== 'string' || !supplierName.trim()) {
         return res.status(400).json({ success: false, message: 'Supplier name is required' });
      }

      const duplicates = await findSupplierDuplicates({
         supplierName, ...supplierContactPoints({ companyEmail, companyPhone, contacts }), ibans: bankSet?.bankAccounts.map((b) => b.iban),
      });
      const hard = duplicates.find((m) => m.level === 'block');
      if (hard) {
         return res.status(409).json({ success: false, message: hard.reason, matches: duplicates });
      }
      if (duplicates.length && confirmDuplicates !== true) {
         return res.status(409).json({ success: false, duplicateWarning: true, message: duplicates[0].reason, matches: duplicates });
      }

      // Handle file uploads
      const files = (req as any).files.documents || []
      console.log(files);

      let documents: { fileName: string; originalname: string }[] = [];
      if (files && Array.isArray(files)) {
         documents = await Promise.all(
            files.map(async (file: any) => {
               await uploadFileToAws(file.filename, file.path);
               return {
                  fileName: file.filename,
                  originalname: file.originalname,
               };
            })
         );
      }


      // Derive the department code (e.g. ICT/ELV) from the selected category for the supplier id
      const categoryItem = await MasterListItemModel.findOne({ _id: category, list: 'supplierCategory' });
      const supplierId = await generateSupplierId(categoryItem?.label || 'GEN');

      // Create new supplier object
      const newSupplier = new Supplier({
         supplierName: supplierName.trim(),
         ...supplierKeys({ supplierName, companyEmail, companyPhone, contacts, bankAccounts: bankSet?.bankAccounts }),
         companyEmail,
         companyPhone,
         website,
         address,
         addresses,
         supplierType,
         category,
         contactDetails,
         contacts,
         ...(bankSet ? { bankAccounts: bankSet.bankAccounts, bankDetails: bankSet.bankDetails } : {}),
         documents: documents,
         products: products ?? [],
         creditDays,
         creditValue,
         createdBy: new Types.ObjectId(creatorId),
         createdDate: new Date(),
         updatedDate: new Date(),
         // Approval is switched off for now: new suppliers are saved as Approved and no approval request is
         // sent. To bring it back, save 'Pending' here and restore the SupplierApprovalRequest notification.
         status: supplierStatus.approved,
         supplierId,
      });

      // Save the supplier to database
      const savedSupplier = await newSupplier.save();

      // Populate the createdBy field before returning
      const populatedSupplier = await Supplier.findById(savedSupplier._id)
         .populate({
            path: 'createdBy',
            select: 'firstName lastName designation department',
            populate: {
               path: 'department',
               select: 'departmentName',
            },
         });

      return res.status(201).json({
         success: true,
         message: 'Supplier created successfully',
         data: populatedSupplier,
      });
   } catch (error) {
      console.error('Error creating supplier:', error);
      return res.status(500).json({
         success: false,
         message: 'Error creating supplier',
         error: error instanceof Error ? error.message : 'Unknown error',
      });
   }
};

export const updateSupplierStatus = async (req: any, res: Response) => {
   try {
      const { id: supplierId } = req.params;
      const { status, comment } = req.body;
      const tokenData = req.user;
      const employee = await getEmployeeData(tokenData);
      const userId = employee._id;

      // Validate required fields
      if (!supplierId || !status) {
         return res.status(400).json({
            success: false,
            message: 'id (params) and status are required',
         });
      }

      // Validate status
      const validStatuses = Object.values(supplierStatus);
      const statusToUpdate = Array.isArray(status) ? status[0] : status;

      if (!validStatuses.includes(statusToUpdate)) {
         return res.status(400).json({
            success: false,
            message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
         });
      }

      // Find the supplier
      const supplier = await Supplier.findById(supplierId);
      if (!supplier) {
         return res.status(404).json({
            success: false,
            message: 'Supplier not found',
         });
      }

      // Only a pending supplier can be approved or rejected. Rejected suppliers go back to
      // pending when they are edited (see updateSupplier); approved ones are blocked, not rejected.
      if (statusToUpdate === supplierStatus.pending) {
         return res.status(400).json({
            success: false,
            message: 'Status cannot be set back to Pending directly; edit the supplier to resubmit it',
         });
      }
      if (supplier.status !== supplierStatus.pending) {
         return res.status(400).json({
            success: false,
            message: `Supplier is already ${supplier.status.toLowerCase()}`,
         });
      }
      if (statusToUpdate === supplierStatus.rejected && !String(comment ?? '').trim()) {
         return res.status(400).json({
            success: false,
            message: 'A reason is required to reject a supplier',
         });
      }

      // Handle different status updates
      if (statusToUpdate === supplierStatus.approved) {
         // Approval logic
         if (!userId) {
            return res.status(400).json({
               success: false,
               message: 'approvedBy is required for approval',
            });
         }

         const privileges = employee.category?.privileges;
         if (!privileges?.supplier?.canApproveSupplier) {
            return res.status(403).json({
               success: false,
               message: "You do not have permission to approve suppliers",
            });
         }

         supplier.status = supplierStatus.approved;
         supplier.approvedHistory.push({
            date: new Date(),
            reason: comment,
            approvedBy: new Types.ObjectId(userId)
         });
         supplier.updatedDate = new Date();

      } else if (statusToUpdate === supplierStatus.rejected) {
         // Rejection logic
         if (!userId) {
            return res.status(400).json({
               success: false,
               message: 'rejectedBy is required for rejection',
            });
         }

         // Add rejection to history
         supplier.rejectHistory.push({
            date: new Date(),
            reason: comment,
            rejectedBy: new Types.ObjectId(userId)
         });

         supplier.status = supplierStatus.rejected;
         supplier.updatedDate = new Date();

      } else if (statusToUpdate === supplierStatus.pending) {
         // Handle pending status
         supplier.status = supplierStatus.pending;
         supplier.updatedDate = new Date();
      }

      // Save the updated supplier
      const updatedSupplier = await supplier.save();

      const socket = req.app.get('io') as Server;
      const supplierIdStr = updatedSupplier._id.toString();
      if (statusToUpdate === supplierStatus.approved) {
         await createNotificationWithPrivileges(
            {
               type: 'SupplierApproved',
               referenceModel: 'Supplier',
               title: 'Supplier approved',
               message: `Supplier ${updatedSupplier.supplierName} has been approved`,
               sentBy: userId?.toString?.(),
               referenceId: updatedSupplier._id,
               additionalData: { supplierId: supplierIdStr }
            },
            {
               privilegeKey: 'supplier',
               checkFunction: (p) => p.supplier?.viewReport !== 'none'
            },
            socket
         );
      } else if (statusToUpdate === supplierStatus.rejected) {
         await createNotificationWithPrivileges(
            {
               type: 'SupplierRejected',
               referenceModel: 'Supplier',
               title: 'Supplier rejected',
               message: `Supplier ${updatedSupplier.supplierName} has been rejected`,
               sentBy: userId?.toString?.(),
               referenceId: updatedSupplier._id,
               additionalData: { supplierId: supplierIdStr }
            },
            {
               privilegeKey: 'supplier',
               checkFunction: (p) => p.supplier?.viewReport !== 'none'
            },
            socket
         );
      }

      // Populate both createdBy, approvedBy, and rejection history fields before returning
      const populatedSupplier = await Supplier.findById(updatedSupplier._id)
         .populate({
            path: 'createdBy',
            select: 'departmentName',
         })
         .populate({
            path: 'approvedHistory.approvedBy',
            select: 'firstName lastName designation department',
            populate: {
               path: 'department',
               select: 'departmentName',
            },
         })
         .populate({
            path: 'rejectHistory.rejectedBy',
            select: 'firstName lastName designation department',
            populate: {
               path: 'department',
               select: 'departmentName',
            },
         })
         .populate({
            path: 'category',
            select: 'label',
         });

      // Determine success message based on status
      const successMessage = statusToUpdate === supplierStatus.approved
         ? 'Supplier approved successfully'
         : statusToUpdate === supplierStatus.rejected
            ? 'Supplier rejected successfully'
            : 'Supplier status updated successfully';

      return res.status(200).json({
         success: true,
         message: successMessage,
         data: populatedSupplier,
      });
   } catch (error) {
      console.error('Error updating supplier status:', error);
      return res.status(500).json({
         success: false,
         message: 'Error updating supplier status',
         error: error instanceof Error ? error.message : 'Unknown error',
      });
   }
};

export const deleteSupplier = async (req: Request, res: Response) => {
   try {
      const { id } = req.params;

      // Validate id
      if (!id) {
         return res.status(400).json({
            success: false,
            message: 'Supplier ID is required'
         });
      }

      // Find and update the supplier to set isDeleted to true
      const updatedSupplier = await Supplier.findByIdAndUpdate(
         id,
         { isDeleted: true },
         { new: true }
      )
         .populate({
            path: 'createdBy',
            select: 'firstName lastName designation department',
            populate: {
               path: 'department',
               select: 'departmentName',
            },
         })
         .populate({
            path: 'approvedHistory.approvedBy',
            select: 'firstName lastName designation department',
            populate: {
               path: 'department',
               select: 'departmentName',
            },
         })

      if (!updatedSupplier) {
         return res.status(404).json({
            success: false,
            message: 'Supplier not found'
         });
      }

      return res.status(200).json({
         success: true,
         message: 'Supplier marked as deleted successfully',
         data: updatedSupplier
      });

   } catch (error) {
      console.error('Error deleting supplier:', error);
      return res.status(500).json({
         success: false,
         message: 'Internal server error',
         error: error.message
      });
   }
};



export const updateSupplier = async (req: Request, res: Response) => {
   try {
      const { id } = req.params;
      const {
         supplierName,
         address: legacyAddress,
         addresses: rawAddresses,
         supplierType,
         category,
         contactDetails: legacyContact,
         contacts: rawContacts,
         companyEmail: rawCompanyEmail,
         companyPhone: rawCompanyPhone,
         website: rawWebsite,
         bankDetails: legacyBank,
         bankAccounts: rawBankAccounts,
         products,
         creditDays,
         creditValue,
         confirmDuplicates,
      } = JSON.parse(req.body.supplier);

      const contactSet = normalizeSupplierContacts(rawContacts, legacyContact);
      const addressSet = normalizeSupplierAddresses(rawAddresses, legacyAddress);
      const bankSet = normalizeBankAccounts(rawBankAccounts, legacyBank);

      // Validate required fields
      if (!id || !supplierName || !supplierType || !category || !contactSet || !addressSet) {
         return res.status(400).json({
            success: false,
            message: 'Please provide all required fields',
         });
      }
      const { contactDetails, contacts } = contactSet;
      const companyEmail = String(rawCompanyEmail ?? '').trim();
      const companyPhone = String(rawCompanyPhone ?? '').trim();
      const website = String(rawWebsite ?? '').trim();
      const { address, addresses } = addressSet;

      // Find the existing supplier to get current documents and status
      const existingSupplier = await Supplier.findById(id);
      if (!existingSupplier) {
         return res.status(404).json({
            success: false,
            message: 'Supplier not found',
         });
      }

      if (typeof supplierName !== 'string' || !supplierName.trim()) {
         return res.status(400).json({ success: false, message: 'Supplier name is required' });
      }

      const duplicates = await findSupplierDuplicates({
         supplierName, ...supplierContactPoints({ companyEmail, companyPhone, contacts }), ibans: bankSet?.bankAccounts.map((b) => b.iban),
         excludeId: String(existingSupplier._id),
      });
      const hard = duplicates.find((m) => m.level === 'block');
      if (hard) {
         return res.status(409).json({ success: false, message: hard.reason, matches: duplicates });
      }
      if (duplicates.length && confirmDuplicates !== true) {
         return res.status(409).json({ success: false, duplicateWarning: true, message: duplicates[0].reason, matches: duplicates });
      }

      // Approval is switched off for now: an edit never sends a supplier back for approval, and a
      // supplier still Pending/Rejected from before becomes Approved when it is edited.
      const newStatus = supplierStatus.approved;

      const files = (req as any).files?.documents || [];

      let documents: { fileName: string; originalname: string }[] = [];
      if (files && files.length > 0) {
         // Delete old documents from AWS if new documents are being uploaded
         if (existingSupplier.documents && existingSupplier.documents.length > 0) {
            for (const doc of existingSupplier.documents) {
               await deleteFileFromAws(doc.fileName);
               console.log(`Deleted old document: ${doc.fileName}`);
            }
         }

         // Upload new documents
         documents = await Promise.all(
            files.map(async (file: any) => {
               await uploadFileToAws(file.filename, file.path);
               return {
                  fileName: file.filename,
                  originalname: file.originalname,
               };
            })
         );
      } else {
         // Keep existing documents if no new ones are provided
         documents = existingSupplier.documents || [];
         console.log("No new files found, keeping existing documents");
      }

      // If the category (department) changed, refresh the department segment of the
      // supplier id while keeping its original sequence number intact.
      let supplierId = existingSupplier.supplierId;
      if (supplierId && String(existingSupplier.category) !== String(category)) {
         const department = await MasterListItemModel.findOne({ _id: category, list: 'supplierCategory' });
         if (department) {
            const parts = supplierId.split('-');
            if (parts.length === 4) {
               parts[2] = deriveDepartmentCode(department.label);
               supplierId = parts.join('-');
            }
         }
      }

      // Find the supplier by ID and update it
      const updatedSupplier = await Supplier.findByIdAndUpdate(
         id,
         {
            supplierName: supplierName.trim(),
            ...supplierKeys({ supplierName, companyEmail, companyPhone, contacts, bankAccounts: bankSet === undefined ? storedBankAccounts(existingSupplier) : bankSet?.bankAccounts }),
            companyEmail,
            companyPhone,
            website,
            address,
            addresses,
            supplierType,
            category,
            contactDetails,
            contacts,
            // null clears banking details the user removed; omitted (undefined) leaves them untouched,
            // which is what a non-finance editor sends since they never see the banking step.
            ...(bankSet === undefined ? {} : { bankAccounts: bankSet?.bankAccounts ?? [], bankDetails: bankSet?.bankDetails ?? null }),
            documents, // Always update documents (either new ones or existing ones)
            // Products live in the product catalogue now; the legacy embedded list is left untouched.
            ...(products === undefined ? {} : { products }),
            creditDays,
            creditValue,
            updatedDate: new Date(),
            status: newStatus, // Update status accordingly
            supplierId,
         },
         { new: true }
      )
         .populate({
            path: 'createdBy',
            select: 'firstName lastName designation department',
            populate: {
               path: 'department',
               select: 'departmentName',
            },
         })
         .populate({
            path: 'approvedHistory.approvedBy',
            select: 'firstName lastName designation department',
            populate: {
               path: 'department',
               select: 'departmentName',
            },
         });

      return res.status(200).json({
         success: true,
         message: 'Supplier updated successfully',
         data: updatedSupplier,
      });
   } catch (error) {
      console.error('Error updating supplier:', error);
      return res.status(500).json({
         success: false,
         message: 'Error updating supplier',
         error: error instanceof Error ? error.message : 'Unknown error',
      });
   }
};



export const getSupplierById = async (req: Request, res: Response) => {
   try {
      const { id } = req.params;

      if (!id) {
         return res.status(400).json({
            success: false,
            message: 'Supplier ID is required',
         });
      }

      // Find supplier by ID and populate createdBy, approvedBy, and updatedBy references
      const supplier = await Supplier.findById(id)
         .populate({
            path: 'createdBy',
            select: 'firstName lastName designation department',
            populate: {
               path: 'department',
               select: 'departmentName',
            },
         })
         .populate({
            path: 'approvedHistory.approvedBy',
            select: 'firstName lastName designation department',
            populate: {
               path: 'department',
               select: 'departmentName',
            },
         })
         .populate({
            path: 'rejectHistory.rejectedBy',
            select: 'firstName lastName designation department',
            populate: {
               path: 'department',
               select: 'departmentName',
            },
         })
         .populate({
            path: 'category',
            select: 'label _id',
         });

      if (!supplier) {
         return res.status(404).json({
            success: false,
            message: 'Supplier not found',
         });
      }

      return res.status(200).json({
         success: true,
         data: supplier,
      });
   } catch (error) {
      console.error('Error fetching supplier:', error);
      return res.status(500).json({
         success: false,
         message: 'Error fetching supplier',
         error: error instanceof Error ? error.message : 'Unknown error',
      });
   }
};

const deriveDepartmentCode = (departmentName: string) => {
   return departmentName.trim().split(' ')[0].replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase();
};

// Format: NT-SP-{DEPT}-{seq}. Sequence is scoped per department via an atomic counter,
// so concurrent creates cannot collide on the same supplierId.
const generateSupplierId = async (departmentName: string) => {
   const deptCode = deriveDepartmentCode(departmentName);

   const sequence = await getNextSequence(`supplierId-${deptCode}`);
   const sequenceStr = sequence.toString().padStart(3, '0');
   return `NT-SP-${deptCode}-${sequenceStr}`;
};

// Read-only preview of the supplier ID for a given category, used to populate the
// readonly Supplier ID field on the create/edit forms as the user picks a department.
// Note: this is a preview only — the real value is generated again at create time,
// so the previewed sequence number may not match what actually gets saved.
export const previewSupplierId = async (req: Request, res: Response) => {
   try {
      const { category } = req.query;

      if (!category || !Types.ObjectId.isValid(category as string)) {
         return res.status(400).json({
            success: false,
            message: 'A valid category is required',
         });
      }

      const department = await MasterListItemModel.findOne({ _id: category, list: 'supplierCategory' });
      if (!department) {
         return res.status(404).json({
            success: false,
            message: 'Category not found',
         });
      }

      const deptCode = deriveDepartmentCode(department.label);
      const latestSupplier = await Supplier.findOne({
         supplierId: { $regex: `^NT-SP-${deptCode}-\\d{3}$` }
      }).sort({ supplierId: -1 });

      let sequence = 1;
      if (latestSupplier?.supplierId) {
         const lastSequence = parseInt(latestSupplier.supplierId.split('-')[3], 10);
         if (!isNaN(lastSequence)) {
            sequence = lastSequence + 1;
         }
      }

      const supplierId = `NT-SP-${deptCode}-${sequence.toString().padStart(3, '0')}`;

      return res.status(200).json({
         success: true,
         data: { supplierId, departmentCode: deptCode },
      });
   } catch (error) {
      console.error('Error previewing supplier id:', error);
      return res.status(500).json({
         success: false,
         message: 'Error previewing supplier id',
         error: error instanceof Error ? error.message : 'Unknown error',
      });
   }
};

export const blockSupplier = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id: supplierId } = req.params;
      if (!Types.ObjectId.isValid(supplierId)) {
         return res.status(400).json({ message: 'Invalid supplier id' });
      }
      const supplier = await Supplier.findOne({ _id: supplierId });
      if (supplier) {
         if (supplier.status !== supplierStatus.approved) {
            return res.status(400).json({ message: 'Only approved suppliers can be blocked or unblocked' });
         }
         const isBlocked = supplier.isBlocked ? false : true;
         const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 1000) : '';
         if (isBlocked && !reason) {
            return res.status(400).json({ message: 'A reason is required to block a supplier' });
         }
         const actor = await getEmployeeData(req.user);
         const byName = actor ? `${actor.firstName ?? ''} ${actor.lastName ?? ''}`.trim() : '';
         await Supplier.findByIdAndUpdate(
            supplierId,
            { isBlocked, updatedDate: new Date(), $push: { blockHistory: { date: new Date(), blocked: isBlocked, reason, byName } } },
            { new: true },
         );
         return res.status(200).json({ isBlocked });
      } else {
         return res.status(404).json({ message: "Supplier not found" });
      }
   } catch (error) {
      console.log(error);
      next(error);
   }
};

export const getSupplierList = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const suppliers = await Supplier.find(
         {
            isDeleted: false,
            status: 'Approved',
            isBlocked: { $ne: true }
         },
         {
            _id: 1,
            supplierName: 1
         }
      );

      return res.status(200).json({
         success: true,
         data: suppliers
      })
   } catch (error) {
      console.log(error)
      next(error)
   }
}