import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import Supplier from "../models/supplier.model";
import Product from "../models/products.model";
import Customer from "../models/customer.model";
import Enquiry from "../models/enquiry.model";
import Quotation from "../models/quotation.model";
import Job from "../models/job.model";
import PurchaseOrder from "../models/purchaseOrder.model";
import Employee from "../models/employee.model";

/**
 * Global search behind the command palette.
 *
 * Only stable "identity" fields are matched (document numbers, names, emails, codes). Volatile
 * fields — prices, quantities, dates, statuses — are shown on results but never searched, so a
 * typed "250" does not drag in every line that happens to cost 250.
 *
 * The query is classified first:
 *  - a 24-hex ObjectId      → exact id lookup in every collection
 *  - a known number prefix  → exact/prefix lookup in that one collection (ENQ-, RFQ-, PO-, ...)
 *  - an email               → email fields only
 *  - anything else          → identity fields, prefix matches ranked above contains matches
 */

export type SearchModule =
  | "supplier" | "product" | "customer" | "enquiry" | "quotation"
  | "job" | "purchaseOrder" | "employee";

export interface SearchHit {
  module: SearchModule;
  id: string;
  title: string;
  subtitle: string;
  /** Short reference shown at the right: document number or code. */
  ref?: string;
  status?: string;
  score: number;
  /** Module-specific extras the palette needs for actions (kept small). */
  data?: Record<string, any>;
}

const PER_MODULE = 5;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isObjectId = (q: string) => /^[a-f0-9]{24}$/i.test(q);
const isEmail = (q: string) => /^[^\s@]+@[^\s@]+$/.test(q) || (q.includes("@") && q.length > 2);

/** Document-number prefixes that pin a query to one module. Checked case-insensitively. */
const PREFIXES: { re: RegExp; module: SearchModule }[] = [
  { re: /^enq/i, module: "enquiry" },
  { re: /^(lpo|po)[-/\d]/i, module: "purchaseOrder" },
  { re: /^(qt|quo|qtn)/i, module: "quotation" },
  { re: /^job/i, module: "job" },
  { re: /^(sup|sp)[-/\d]/i, module: "supplier" },
  { re: /^(emp|nt)[-/\d]/i, module: "employee" },
];

/** Exact > prefix > word-start > contains, on whichever identity field matched best. */
const scoreOf = (q: string, values: (string | undefined | null)[]): number => {
  const needle = q.toLowerCase();
  let best = 0;
  for (const raw of values) {
    const v = String(raw ?? "").toLowerCase();
    if (!v) continue;
    if (v === needle) best = Math.max(best, 100);
    else if (v.startsWith(needle)) best = Math.max(best, 80);
    else if (new RegExp(`\\b${escapeRegex(needle)}`).test(v)) best = Math.max(best, 60);
    else if (v.includes(needle)) best = Math.max(best, 40);
  }
  return best;
};

type Mode = { kind: "id"; id: Types.ObjectId } | { kind: "email" } | { kind: "text" };

/** `$or` over the given fields, or an exact `_id` match for an id query. */
const matchOn = (mode: Mode, q: string, fields: string[], emailFields: string[] = []) => {
  if (mode.kind === "id") return { _id: mode.id };
  const regex = { $regex: escapeRegex(q), $options: "i" };
  const use = mode.kind === "email" ? emailFields : fields;
  if (!use.length) return null;
  return { $or: use.map((f) => ({ [f]: regex })) };
};

const searchers: Record<SearchModule, (q: string, mode: Mode) => Promise<SearchHit[]>> = {
  async supplier(q, mode) {
    const match = matchOn(mode, q, ["supplierId", "supplierName", "contactDetails.email"], ["contactDetails.email"]);
    if (!match) return [];
    const rows = await Supplier.find({ isDeleted: { $ne: true }, ...match })
      .select("supplierId supplierName supplierType status isBlocked contactDetails")
      .limit(PER_MODULE).lean();
    return rows.map((s: any) => ({
      module: "supplier", id: String(s._id),
      title: s.supplierName, ref: s.supplierId,
      subtitle: [s.supplierType, s.contactDetails?.email].filter(Boolean).join(" · "),
      status: s.isBlocked ? "Blocked" : s.status,
      score: scoreOf(q, [s.supplierName, s.supplierId, s.contactDetails?.email]),
      data: { supplierName: s.supplierName, contactEmail: s.contactDetails?.email, isSupplierApproved: s.status === "Approved" },
    }));
  },

  async product(q, mode) {
    const match = matchOn(mode, q, ["itemCode", "partNo", "nickName", "productName", "productDescription", "brand", "barcode"]);
    if (!match) return [];
    const rows = await Product.find({ isDeleted: { $ne: true }, approvalStatus: { $ne: "Draft" }, ...match })
      .select("itemCode partNo nickName productName productDescription brand unitOfMeasure approvalStatus productCategory estimatedCost defaultSellingPrice defaultVendor type")
      .populate("productCategory", "categoryName")
      .limit(PER_MODULE).lean();
    return rows.map((p: any) => ({
      module: "product", id: String(p._id),
      title: p.productName || p.productDescription || p.partNo,
      ref: p.itemCode,
      subtitle: [p.partNo, p.nickName, p.brand, p.productCategory?.categoryName].filter(Boolean).join(" · "),
      status: p.approvalStatus === "Approved" ? undefined : p.approvalStatus,
      score: scoreOf(q, [p.itemCode, p.partNo, p.nickName, p.productName, p.productDescription, p.brand]),
      data: { product: p },
    }));
  },

  async customer(q, mode) {
    const match = matchOn(mode, q,
      ["clientRef", "companyName", "customerEmailId", "contactDetails.email", "contactDetails.firstName", "contactDetails.lastName"],
      ["customerEmailId", "contactDetails.email"]);
    if (!match) return [];
    const rows = await Customer.find({ isDeleted: { $ne: true }, ...match })
      .select("clientRef companyName customerEmailId status contactDetails.firstName contactDetails.lastName contactDetails.email")
      .limit(PER_MODULE).lean();
    return rows.map((c: any) => {
      const contacts = (c.contactDetails || []).map((d: any) => `${d.firstName || ""} ${d.lastName || ""}`.trim());
      const contactHit = (c.contactDetails || []).find((d: any) =>
        scoreOf(q, [d.email, d.firstName, d.lastName, `${d.firstName} ${d.lastName}`]) > 0);
      return {
        module: "customer", id: String(c._id),
        title: c.companyName, ref: c.clientRef,
        subtitle: contactHit
          ? `Contact: ${`${contactHit.firstName || ""} ${contactHit.lastName || ""}`.trim()}${contactHit.email ? " · " + contactHit.email : ""}`
          : [c.customerEmailId, contacts.length ? `${contacts.length} contact${contacts.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · "),
        status: c.status,
        score: scoreOf(q, [c.companyName, c.clientRef, c.customerEmailId, ...(c.contactDetails || []).flatMap((d: any) => [d.email, d.firstName, d.lastName])]),
      } as SearchHit;
    });
  },

  async enquiry(q, mode) {
    const match = matchOn(mode, q, ["enquiryId", "title"]);
    if (!match) return [];
    const rows = await Enquiry.find({ isDeleted: { $ne: true }, ...match })
      .select("enquiryId title status client")
      .populate("client", "companyName")
      .sort({ createdDate: -1 }).limit(PER_MODULE).lean();
    return rows.map((e: any) => ({
      module: "enquiry", id: String(e._id),
      title: e.title || e.enquiryId, ref: e.enquiryId,
      subtitle: e.client?.companyName || "",
      status: e.status,
      score: scoreOf(q, [e.enquiryId, e.title]),
      data: { enquiryId: e.enquiryId },
    }));
  },

  async quotation(q, mode) {
    const match = matchOn(mode, q, ["quoteId", "subject"]);
    if (!match) return [];
    const rows = await Quotation.find({ isDeleted: { $ne: true }, ...match })
      .select("quoteId subject status client")
      .populate("client", "companyName")
      .sort({ date: -1 }).limit(PER_MODULE).lean();
    return rows.map((x: any) => ({
      module: "quotation", id: String(x._id),
      title: x.subject || x.quoteId, ref: x.quoteId,
      subtitle: x.client?.companyName || "",
      status: x.status,
      score: scoreOf(q, [x.quoteId, x.subject]),
    }));
  },

  async job(q, mode) {
    const match = matchOn(mode, q, ["jobId"]);
    if (!match) return [];
    const rows = await Job.find({ isDeleted: { $ne: true }, ...match })
      .select("jobId status allocateType quoteId")
      .populate({ path: "quoteId", select: "quoteId subject client", populate: { path: "client", select: "companyName" } })
      .sort({ createdDate: -1 }).limit(PER_MODULE).lean();
    return rows.map((j: any) => ({
      module: "job", id: String(j._id),
      title: j.quoteId?.subject || j.jobId, ref: j.jobId,
      subtitle: [j.quoteId?.client?.companyName, j.allocateType].filter(Boolean).join(" · "),
      status: j.status,
      score: scoreOf(q, [j.jobId]),
      data: { jobId: j.jobId },
    }));
  },

  async purchaseOrder(q, mode) {
    const match = matchOn(mode, q, ["poNo", "subject"]);
    if (!match) return [];
    const rows = await PurchaseOrder.find({ ...match })
      .select("poNo subject poStatus supplierId")
      .populate("supplierId", "supplierName")
      .sort({ poDate: -1 }).limit(PER_MODULE).lean();
    return rows.map((p: any) => ({
      module: "purchaseOrder", id: String(p._id),
      title: p.subject || p.poNo, ref: p.poNo,
      subtitle: p.supplierId?.supplierName || "",
      status: p.poStatus,
      score: scoreOf(q, [p.poNo, p.subject]),
    }));
  },

  async employee(q, mode) {
    const match = matchOn(mode, q, ["employeeId", "firstName", "lastName", "email"], ["email"]);
    if (!match) return [];
    const rows = await Employee.find({ isDeleted: { $ne: true }, ...match })
      .select("employeeId firstName lastName email designation")
      .limit(PER_MODULE).lean();
    return rows.map((e: any) => ({
      module: "employee", id: String(e._id),
      title: `${e.firstName || ""} ${e.lastName || ""}`.trim(), ref: e.employeeId,
      subtitle: [e.designation, e.email].filter(Boolean).join(" · "),
      score: scoreOf(q, [e.employeeId, e.firstName, e.lastName, `${e.firstName} ${e.lastName}`, e.email]),
      data: { employeeId: e.employeeId },
    }));
  },
};

const ALL_MODULES = Object.keys(searchers) as SearchModule[];

/** GET /search?q=...&modules=supplier,product */
export const globalSearch = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = String(req.query.q ?? "").trim().slice(0, 100);
    if (q.length < 2) return res.json({ success: true, data: [] });

    const requested = String(req.query.modules ?? "").split(",").map((m) => m.trim()).filter(Boolean) as SearchModule[];
    let modules = requested.length ? requested.filter((m) => m in searchers) : ALL_MODULES;

    let mode: Mode = { kind: "text" };
    if (isObjectId(q)) mode = { kind: "id", id: new Types.ObjectId(q) };
    else if (isEmail(q)) {
      mode = { kind: "email" };
      modules = modules.filter((m) => ["supplier", "customer", "employee"].includes(m));
    } else if (!requested.length) {
      const pinned = PREFIXES.find((p) => p.re.test(q));
      // A number prefix puts its module first (and boosts it below); the rest still run so a name like "Jobson" is found.
      if (pinned) modules = [pinned.module, ...modules.filter((m) => m !== pinned.module)];
    }

    const settled = await Promise.allSettled(modules.map((m) => searchers[m](q, mode)));
    const hits = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    const pinned = mode.kind === "text" && !requested.length ? PREFIXES.find((p) => p.re.test(q))?.module : undefined;
    hits.forEach((h) => { if (h.module === pinned) h.score += 20; });
    hits.sort((a, b) => b.score - a.score);

    return res.json({ success: true, data: hits });
  } catch (error) {
    next(error);
  }
};

const oid = (id: string) => (Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null);

/** GET /search/related/:module/:id — the records linked to one hit, fetched when the hit is opened. */
export const getRelated = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const module = req.params.module as SearchModule;
    const id = oid(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Invalid id" });

    let data: Record<string, any> = {};
    switch (module) {
      case "supplier": {
        const [supplier, defaultProducts, pos] = await Promise.all([
          Supplier.findById(id).select("supplierId supplierName status contactDetails products.productName creditDays").lean(),
          Product.find({ defaultVendor: id, isDeleted: { $ne: true }, approvalStatus: { $ne: "Draft" } })
            .select("itemCode partNo productName productDescription brand unitOfMeasure productCategory estimatedCost defaultSellingPrice defaultVendor type approvalStatus")
            .populate("productCategory", "categoryName").limit(50).lean(),
          PurchaseOrder.find({ supplierId: id }).select("poNo subject poStatus poDate items.partNo").sort({ poDate: -1 }).limit(10).lean(),
        ]);
        if (!supplier) return res.status(404).json({ success: false, message: "Supplier not found" });

        // Products bought from this supplier before count as its products too, not only those it is the default vendor of.
        const knownIds = new Set(defaultProducts.map((p: any) => String(p._id)));
        const purchasedIds = Array.from(new Set(pos.flatMap((po: any) => (po.items || []).map((i: any) => i.partNo).filter((p: any) => p && oid(String(p)))
          .map(String)))).filter((pid) => !knownIds.has(pid));
        const purchased = purchasedIds.length
          ? await Product.find({ _id: { $in: purchasedIds }, isDeleted: { $ne: true } })
            .select("itemCode partNo productName productDescription brand unitOfMeasure productCategory estimatedCost defaultSellingPrice defaultVendor type approvalStatus")
            .populate("productCategory", "categoryName").limit(50).lean()
          : [];

        data = {
          supplier,
          products: [
            ...defaultProducts.map((p: any) => ({ ...p, link: "Default vendor" })),
            ...purchased.map((p: any) => ({ ...p, link: "Purchased before" })),
          ],
          purchaseOrders: pos.map(({ items, ...po }: any) => ({ ...po, lineCount: (items || []).length })),
        };
        break;
      }
      case "product": {
        const [product, quotes, pos] = await Promise.all([
          Product.findById(id).select("itemCode partNo productName productDescription defaultVendor").populate("defaultVendor", "supplierId supplierName status contactDetails.email").lean(),
          Quotation.find({ isDeleted: { $ne: true }, "optionalItems.items.itemDetails.productId": id })
            .select("quoteId subject status client date").populate("client", "companyName").sort({ date: -1 }).limit(10).lean(),
          PurchaseOrder.find({ "items.partNo": id }).select("poNo poStatus poDate supplierId").populate("supplierId", "supplierName status contactDetails.email").sort({ poDate: -1 }).limit(10).lean(),
        ]);
        if (!product) return res.status(404).json({ success: false, message: "Product not found" });

        const suppliers = new Map<string, any>();
        const vendor: any = (product as any).defaultVendor;
        if (vendor?._id) suppliers.set(String(vendor._id), { ...vendor, link: "Default vendor" });
        pos.forEach((po: any) => {
          const s = po.supplierId;
          if (s?._id && !suppliers.has(String(s._id))) suppliers.set(String(s._id), { ...s, link: `Last PO ${po.poNo}` });
        });

        data = { product, suppliers: Array.from(suppliers.values()), quotations: quotes, purchaseOrders: pos };
        break;
      }
      case "customer": {
        const [customer, enquiries, quotes] = await Promise.all([
          Customer.findById(id).select("clientRef companyName customerEmailId contactNo status contactDetails paymentTerms creditStatus").lean(),
          Enquiry.find({ client: id, isDeleted: { $ne: true } }).select("enquiryId title status date").sort({ createdDate: -1 }).limit(10).lean(),
          Quotation.find({ client: id, isDeleted: { $ne: true } }).select("quoteId subject status date").sort({ date: -1 }).limit(10).lean(),
        ]);
        if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });
        const allQuoteIds = await Quotation.find({ client: id, isDeleted: { $ne: true } }).distinct("_id");
        const jobs = await Job.find({ quoteId: { $in: allQuoteIds }, isDeleted: { $ne: true } })
          .select("jobId status allocateType quoteId").populate("quoteId", "quoteId subject").sort({ createdDate: -1 }).limit(10).lean();
        data = {
          customer,
          contacts: ((customer as any).contactDetails || []).map((c: any) => ({
            _id: c._id, name: `${c.courtesyTitle ? c.courtesyTitle + " " : ""}${c.firstName || ""} ${c.lastName || ""}`.trim(),
            email: c.email, phoneNo: c.phoneNo, designation: c.designation, isPrimary: !!c.isPrimary,
          })),
          enquiries, quotations: quotes, jobs,
        };
        break;
      }
      case "enquiry": {
        const [enquiry, quotes] = await Promise.all([
          Enquiry.findById(id).select("enquiryId title status client contact salesPerson").populate("client", "companyName").populate("salesPerson", "firstName lastName").lean(),
          Quotation.find({ enqId: id, isDeleted: { $ne: true } }).select("quoteId subject status date").sort({ date: -1 }).lean(),
        ]);
        if (!enquiry) return res.status(404).json({ success: false, message: "Enquiry not found" });
        data = { enquiry, quotations: quotes };
        break;
      }
      case "quotation": {
        const [quotation, jobs, pos] = await Promise.all([
          Quotation.findById(id).select("quoteId subject status client enqId").populate("client", "companyName").populate("enqId", "enquiryId title").lean(),
          Job.find({ quoteId: id, isDeleted: { $ne: true } }).select("jobId status allocateType").lean(),
          PurchaseOrder.find({ quoteId: id }).select("poNo poStatus poDate supplierId").populate("supplierId", "supplierName").sort({ poDate: -1 }).limit(10).lean(),
        ]);
        if (!quotation) return res.status(404).json({ success: false, message: "Quotation not found" });
        data = { quotation, jobs, purchaseOrders: pos };
        break;
      }
      case "job": {
        const job: any = await Job.findById(id).select("jobId status allocateType quoteId procurementPerson")
          .populate({ path: "quoteId", select: "quoteId subject client enqId", populate: { path: "client", select: "companyName" } })
          .populate("procurementPerson", "firstName lastName employeeId").lean();
        if (!job) return res.status(404).json({ success: false, message: "Job not found" });
        const pos = await PurchaseOrder.find({ jobId: id }).select("poNo poStatus poDate supplierId").populate("supplierId", "supplierName").sort({ poDate: -1 }).limit(10).lean();
        data = { job, purchaseOrders: pos };
        break;
      }
      default:
        data = {};
    }

    return res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
